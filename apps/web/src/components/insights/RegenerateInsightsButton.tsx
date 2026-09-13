"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/app/(app)/insights/insights.module.css";

const API_BASE_URL = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "";

export function RegenerateInsightsButton() {
  const router = useRouter();
  const [isRegenerating, setIsRegenerating] = useState(false);

  async function regenerate() {
    if (isRegenerating) return;
    setIsRegenerating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/insights/regenerate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(`Regenerate failed with ${res.status}`);
      router.refresh();
    } catch {
      window.alert("Could not regenerate the Gemini insights board. Check that the API and Gemini key are working.");
      setIsRegenerating(false);
    }
  }

  return (
    <button className={styles.regenerateBtn} onClick={regenerate} disabled={isRegenerating}>
      {isRegenerating ? "Regenerating" : "Regenerate"}
    </button>
  );
}
