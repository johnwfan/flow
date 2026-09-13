"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const API_BASE_URL = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "";

export function RegenerateSessionInsightsButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [isRegenerating, setIsRegenerating] = useState(false);

  async function regenerate() {
    if (isRegenerating) return;
    setIsRegenerating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/sessions/${sessionId}/regenerate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(`Regenerate failed with ${res.status}`);
      router.refresh();
    } catch {
      window.alert("Could not regenerate this session's Gemini write-up. Check that the API and Gemini key are working.");
      setIsRegenerating(false);
    }
  }

  return (
    <button
      onClick={regenerate}
      disabled={isRegenerating}
      style={{
        justifySelf: "start",
        padding: "7px 13px",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-pill)",
        background: "var(--raise)",
        color: "var(--body)",
        cursor: isRegenerating ? "default" : "pointer",
        opacity: isRegenerating ? 0.58 : 1,
        fontFamily: "var(--sans)",
        fontSize: 12.5,
      }}
    >
      {isRegenerating ? "Regenerating Gemini write-up" : "Regenerate Gemini write-up"}
    </button>
  );
}
