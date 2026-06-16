import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Groq from "groq-sdk";
import { authOptions } from "@/auth";
import {
  getAnonymousMessageCap,
  getAnonymousUsage,
  getAnonymousUsageProvider,
  hasReachedAnonymousCap,
  incrementAnonymousUsage,
} from "@/lib/anonymous-usage";
import { consumeIpRateLimit, type IpRateLimitResult } from "@/lib/ip-rate-limit";
import {
  getSignedInFreeMessageCap,
  getSignedInUsage,
  getSignedInUsageProvider,
  getSignedInUserId,
  hasReachedSignedInCap,
  incrementSignedInUsage,
} from "@/lib/signed-in-usage";
import { verifyTurnstileToken } from "@/lib/turnstile";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const ANONYMOUS_COOKIE_NAME = "anonymous_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function normalizeAnonymousId(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getCanonicalAnonymousId(req: NextRequest, bodyAnonymousId: unknown) {
  const cookieAnonymousId = normalizeAnonymousId(
    req.cookies.get(ANONYMOUS_COOKIE_NAME)?.value,
  );
  const requestAnonymousId = normalizeAnonymousId(bodyAnonymousId);

  return cookieAnonymousId ?? requestAnonymousId ?? crypto.randomUUID();
}

function getRequestIp(req: NextRequest) {
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "local-dev-ip";
}

function applyIpRateLimitHeaders(
  response: NextResponse,
  ipRateLimit: IpRateLimitResult,
) {
  response.headers.set("X-RateLimit-Limit", String(ipRateLimit.limit));
  response.headers.set("X-RateLimit-Remaining", String(ipRateLimit.remaining));
  response.headers.set("X-RateLimit-Reset", String(ipRateLimit.resetInSeconds));
  response.headers.set("X-RateLimit-Storage", ipRateLimit.storage);
}

function getIpRateLimitPayload(ipRateLimit: IpRateLimitResult) {
  return {
    used: ipRateLimit.used,
    remaining: ipRateLimit.remaining,
    limit: ipRateLimit.limit,
    resetInSeconds: ipRateLimit.resetInSeconds,
  };
}

async function createGroqReply(message: string) {
  const completion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content:
          "You are a concise stock and crypto assistant. Keep answers short, practical, and low-hype.",
      },
      {
        role: "user",
        content: message,
      },
    ],
    temperature: 0.4,
    max_tokens: 300,
  });

  return completion.choices[0]?.message?.content || "No response.";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    const ipIdentifier = getRequestIp(req);
    const ipRateLimit = await consumeIpRateLimit(ipIdentifier);

    if (!ipRateLimit.allowed) {
      const rateLimitedResponse = NextResponse.json(
        {
          error: "Too many requests from this IP. Try again later.",
          ipRateLimit: getIpRateLimitPayload(ipRateLimit),
        },
        { status: 429 },
      );

      applyIpRateLimitHeaders(rateLimitedResponse, ipRateLimit);
      return rateLimitedResponse;
    }

    const session = await getServerSession(authOptions);
    const signedInEmail = session?.user?.email;

    if (signedInEmail) {
      const userId = getSignedInUserId(signedInEmail);
      const userLimit = getSignedInFreeMessageCap();
      const userProvider = getSignedInUsageProvider();
      const currentUserUsage = await getSignedInUsage(userId);

      if (await hasReachedSignedInCap(userId)) {
        const blockedResponse = NextResponse.json(
          {
            error: "Signed-in free limit reached.",
            tier: "signed_in_free",
            storage: userProvider,
            ipRateLimit: getIpRateLimitPayload(ipRateLimit),
            usage: {
              used: currentUserUsage.count,
              remaining: 0,
              limit: userLimit,
            },
          },
          { status: 429 },
        );

        applyIpRateLimitHeaders(blockedResponse, ipRateLimit);
        return blockedResponse;
      }

      const reply = await createGroqReply(message);
      const updatedUserUsage = await incrementSignedInUsage(userId);
      const response = NextResponse.json({
        reply,
        tier: "signed_in_free",
        user: {
          email: signedInEmail,
          name: session.user?.name ?? null,
        },
        storage: userProvider,
        ipRateLimit: getIpRateLimitPayload(ipRateLimit),
        usage: {
          used: updatedUserUsage.count,
          remaining: Math.max(0, userLimit - updatedUserUsage.count),
          limit: userLimit,
        },
      });

      applyIpRateLimitHeaders(response, ipRateLimit);
      return response;
    }

    const turnstile = await verifyTurnstileToken(body.turnstileToken, ipIdentifier);

    if (!turnstile.ok) {
      const captchaResponse = NextResponse.json(
        {
          error: "Captcha verification failed. Please try again.",
          turnstile: {
            skipped: turnstile.skipped,
            errors: turnstile.errors,
          },
          ipRateLimit: getIpRateLimitPayload(ipRateLimit),
        },
        { status: 403 },
      );

      applyIpRateLimitHeaders(captchaResponse, ipRateLimit);
      return captchaResponse;
    }

    const anonymousId = getCanonicalAnonymousId(req, body.anonymousId);
    const anonymousTrackerId = ipIdentifier;
    const limit = getAnonymousMessageCap();
    const provider = getAnonymousUsageProvider();
    const currentUsage = await getAnonymousUsage(anonymousTrackerId);

    if (await hasReachedAnonymousCap(anonymousTrackerId)) {
      const blockedResponse = NextResponse.json(
        {
          error: "Free limit reached. Sign in with Google for more free messages.",
          anonymousId,
          tier: "anonymous",
          storage: provider,
          ipRateLimit: getIpRateLimitPayload(ipRateLimit),
          usage: {
            used: currentUsage.count,
            remaining: 0,
            limit,
          },
        },
        { status: 429 },
      );

      blockedResponse.cookies.set(ANONYMOUS_COOKIE_NAME, anonymousId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
      });

      applyIpRateLimitHeaders(blockedResponse, ipRateLimit);
      return blockedResponse;
    }

    const reply = await createGroqReply(message);
    const updatedUsage = await incrementAnonymousUsage(anonymousTrackerId);

    const response = NextResponse.json({
      reply,
      anonymousId,
      tier: "anonymous",
      storage: provider,
      turnstile: {
        skipped: turnstile.skipped,
      },
      ipRateLimit: getIpRateLimitPayload(ipRateLimit),
      usage: {
        used: updatedUsage.count,
        remaining: Math.max(0, limit - updatedUsage.count),
        limit,
      },
    });

    response.cookies.set(ANONYMOUS_COOKIE_NAME, anonymousId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

    applyIpRateLimitHeaders(response, ipRateLimit);
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
