import { Readable } from "node:stream";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export async function synthesizeSpeech(text: string): Promise<Readable> {
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }

  const voiceId = process.env["ELEVENLABS_VOICE_ID"] ?? DEFAULT_VOICE_ID;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2_5",
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`ElevenLabs request failed: ${res.status}`);
  }

  return Readable.fromWeb(res.body as import("stream/web").ReadableStream);
}
