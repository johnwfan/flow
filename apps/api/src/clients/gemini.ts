// gemini-2.0-flash was retired by Google; confirmed live against the API
// (2026-09-13) that gemini-3.6-flash is the current replacement.
const GEMINI_MODEL = "gemini-3.6-flash";

interface GenerateOptions {
  timeoutMs?: number;
  fallback: string;
}

export async function generateText(prompt: string, options: GenerateOptions): Promise<string> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    return options.fallback;
  }

  const controller = new AbortController();
  // Real-world p50 latency for gemini-3.6-flash on these prompts is ~7.5-8.8s
  // (measured live 2026-09-13) -- an 8s timeout was cutting off ~half of
  // requests, silently falling back with no visible error. 15s leaves headroom.
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      console.error(`[gemini] request failed: status=${res.status} body=${body.slice(0, 300)}`);
      return options.fallback;
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text?.trim() || options.fallback;
  } catch (e) {
    console.error(`[gemini] request threw:`, (e as Error).message);
    return options.fallback;
  } finally {
    clearTimeout(timeout);
  }
}
