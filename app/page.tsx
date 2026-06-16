"use client";

import { useState } from "react";
import { getOrCreateAnonymousId } from "@/lib/anonymous-id";

type Usage = {
  used: number;
  remaining: number;
  limit: number;
};

export default function Home() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);

  async function sendMessage() {
    if (!message.trim()) return;

    setLoading(true);
    setReply("");

    try {
      const anonymousId = getOrCreateAnonymousId();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, anonymousId }),
      });

      const data = await res.json();

      if (data.usage) {
        setUsage(data.usage);
      }

      setReply(data.reply || data.error || "No response");
    } catch {
      setReply("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold">Groq Trader MVP</h1>

        {usage ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
            Anonymous free usage: {usage.used}/{usage.limit} used · {usage.remaining} remaining
          </div>
        ) : null}

        <textarea
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-4"
          rows={5}
          placeholder="Ask about BTC, SOL, TSLA, market sentiment..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <button
          onClick={sendMessage}
          disabled={loading}
          className="rounded-lg bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
        >
          {loading ? "Thinking..." : "Send"}
        </button>

        <div className="min-h-[140px] rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          {reply || "Response shows here."}
        </div>
      </div>
    </main>
  );
}
