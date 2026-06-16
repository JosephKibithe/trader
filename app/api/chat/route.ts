import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import {
  getAnonymousMessageCap,
  getAnonymousUsage,
  getAnonymousUsageProvider,
  hasReachedAnonymousCap,
  incrementAnonymousUsage,
} from "@/lib/anonymous-usage";

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

    const anonymousId = getCanonicalAnonymousId(req, body.anonymousId);
    const limit = getAnonymousMessageCap();
    const provider = getAnonymousUsageProvider();
    const currentUsage = await getAnonymousUsage(anonymousId);

    if (await hasReachedAnonymousCap(anonymousId)) {
      const blockedResponse = NextResponse.json(
        {
          error: "Free limit reached. You have used all 5 anonymous messages.",
          anonymousId,
          storage: provider,
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
    const updatedUsage = await incrementAnonymousUsage(anonymousId);

    const response = NextResponse.json({
      reply,
      anonymousId,
      storage: provider,
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

    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
