const GEMINI_MODEL = "gemini-2.0-flash";

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
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);

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
      return options.fallback;
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text?.trim() || options.fallback;
  } catch {
    return options.fallback;
  } finally {
    clearTimeout(timeout);
  }
}
