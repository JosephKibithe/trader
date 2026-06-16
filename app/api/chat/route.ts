import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import {
  getAnonymousMessageCap,
  getAnonymousUsage,
  getAnonymousUsageProvider,
  hasReachedAnonymousCap,
  incrementAnonymousUsage,
} from "@/lib/anonymous-usage";
import { consumeIpRateLimit, type IpRateLimitResult } from "@/lib/ip-rate-limit";

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
          ipRateLimit: {
            used: ipRateLimit.used,
            remaining: ipRateLimit.remaining,
            limit: ipRateLimit.limit,
            resetInSeconds: ipRateLimit.resetInSeconds,
          },
        },
        { status: 429 },
      );

      applyIpRateLimitHeaders(rateLimitedResponse, ipRateLimit);
      return rateLimitedResponse;
    }

    const anonymousId = getCanonicalAnonymousId(req, body.anonymousId);
    const anonymousTrackerId = ipIdentifier;
    const limit = getAnonymousMessageCap();
    const provider = getAnonymousUsageProvider();
    const currentUsage = await getAnonymousUsage(anonymousTrackerId);

    if (await hasReachedAnonymousCap(anonymousTrackerId)) {
      const blockedResponse = NextResponse.json(
        {
          error: "Free limit reached. You have used all 5 anonymous messages.",
          anonymousId,
          storage: provider,
          ipRateLimit: {
            used: ipRateLimit.used,
            remaining: ipRateLimit.remaining,
            limit: ipRateLimit.limit,
            resetInSeconds: ipRateLimit.resetInSeconds,
          },
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

    const reply = completion.choices[0]?.message?.content || "No response.";
    const updatedUsage = await incrementAnonymousUsage(anonymousTrackerId);

    const response = NextResponse.json({
      reply,
      anonymousId,
      storage: provider,
      ipRateLimit: {
        used: ipRateLimit.used,
        remaining: ipRateLimit.remaining,
        limit: ipRateLimit.limit,
        resetInSeconds: ipRateLimit.resetInSeconds,
      },
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
