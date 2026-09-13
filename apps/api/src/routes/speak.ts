import { createReadStream, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { synthesizeSpeech } from "../clients/elevenlabs.js";
import type { SpeakBody } from "../types.js";

const AUDIO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "audio");

export async function speakRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SpeakBody }>("/v1/speak", async (request, reply) => {
    const { lineId, text } = request.body;

    if (lineId) {
      const filePath = path.join(AUDIO_DIR, `${lineId}.mp3`);
      if (!existsSync(filePath)) {
        return reply.code(404).send({ error: "unknown lineId" });
      }
      reply.header("content-type", "audio/mpeg");
      return reply.send(createReadStream(filePath));
    }

    if (!text) {
      return reply.code(400).send({ error: "lineId or text is required" });
    }

    try {
      const stream = await synthesizeSpeech(text);
      reply.header("content-type", "audio/mpeg");
      return reply.send(stream);
    } catch (err) {
      app.log.error(err);
      return reply.code(502).send({ error: "speech synthesis failed" });
    }
  });
}
