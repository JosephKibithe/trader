"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { getOrCreateAnonymousId } from "@/lib/anonymous-id";

type Usage = {
  used: number;
  remaining: number;
  limit: number;
};

type SessionUser = {
  name?: string | null;
  email?: string | null;
};

type SessionPayload = {
  user?: SessionUser;
  expires?: string;
};

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      theme?: "light" | "dark" | "auto";
    },
  ) => string;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function Home() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [tier, setTier] = useState<"anonymous" | "signed_in_free">("anonymous");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  const isSignedIn = Boolean(user?.email);
  const captchaNeeded = Boolean(turnstileSiteKey && !sessionLoading && !isSignedIn);

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch("/api/auth/session");
        const data = (await res.json()) as SessionPayload;
        setUser(data.user?.email ? data.user : null);
      } catch {
        setUser(null);
      } finally {
        setSessionLoading(false);
      }
    }

    loadSession();
  }, []);

  useEffect(() => {
    if (!captchaNeeded || !turnstileRef.current || turnstileWidgetIdRef.current) {
      return;
    }

    const renderTurnstile = () => {
      const siteKey = turnstileSiteKey;
      const container = turnstileRef.current;

      if (!siteKey || !window.turnstile || !container || turnstileWidgetIdRef.current) {
        return;
      }

      turnstileWidgetIdRef.current = window.turnstile.render(container, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken(""),
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]',
    );

    if (existingScript) {
      renderTurnstile();
      existingScript.addEventListener("load", renderTurnstile, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = renderTurnstile;
    document.body.appendChild(script);
  }, [captchaNeeded]);

  function resetTurnstile() {
    setTurnstileToken("");
    if (turnstileWidgetIdRef.current) {
      window.turnstile?.reset(turnstileWidgetIdRef.current);
    }
  }

  async function sendMessage() {
    if (!message.trim()) return;
    if (captchaNeeded && !turnstileToken) {
      setReply("Complete the captcha first.");
      return;
    }

    setLoading(true);
    setReply("");

    try {
      const anonymousId = getOrCreateAnonymousId();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, anonymousId, turnstileToken }),
      });

      const data = await res.json();

      if (data.usage) {
        setUsage(data.usage);
      }

      if (data.tier === "signed_in_free" || data.tier === "anonymous") {
        setTier(data.tier);
      }

      setReply(data.reply || data.error || "No response");

      if (!isSignedIn) {
        resetTurnstile();
      }
    } catch {
      setReply("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const sendDisabled =
    loading || sessionLoading || !message.trim() || (captchaNeeded && !turnstileToken);

  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Groq Trader MVP</h1>

          <div className="text-right text-sm text-zinc-300">
            {sessionLoading ? (
              "Checking session..."
            ) : isSignedIn ? (
              <div className="space-y-1">
                <div>{user?.email}</div>
                <button className="text-blue-300 underline" onClick={() => signOut()}>
                  Sign out
                </button>
              </div>
            ) : (
              <button className="text-blue-300 underline" onClick={() => signIn("google")}>
                Sign in with Google
              </button>
            )}
          </div>
        </div>

        {usage ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
            {tier === "signed_in_free" ? "Signed-in free" : "Anonymous free"} usage:{" "}
            {usage.used}/{usage.limit} used · {usage.remaining} remaining
          </div>
        ) : null}

        <textarea
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-4"
          rows={5}
          placeholder="Ask about BTC, SOL, TSLA, market sentiment..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        {captchaNeeded ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <div ref={turnstileRef} />
            {!turnstileToken ? (
              <p className="mt-2 text-xs text-zinc-500">Captcha required for anonymous use.</p>
            ) : null}
          </div>
        ) : null}

        <button
          onClick={sendMessage}
          disabled={sendDisabled}
          className="rounded-lg bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
        >
          {loading ? "Thinking..." : "Send"}
        </button>

        <div className="min-h-[140px] whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          {reply || "Response shows here."}
        </div>
      </div>
    </main>
  );
}
