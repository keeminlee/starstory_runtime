import { cfg } from "../../config/env.js";
import { MeepoError } from "../../errors/meepoError.js";
import { log } from "../../utils/logger.js";
import type { SttProvider, SttTranscriptionMeta } from "./provider.js";
import { pcmToWav } from "./wav.js";

const sttLog = log.withScope("stt");

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { err_msg?: string; error?: string; message?: string };
    return body.err_msg ?? body.error ?? body.message ?? `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export class DeepgramSttProvider implements SttProvider {
  async transcribePcm(
    pcm: Buffer,
    sampleRate: number,
  ): Promise<{ text: string; confidence?: number; meta?: SttTranscriptionMeta }> {
    const apiKey = cfg.deepgram.apiKey;
    if (!apiKey) {
      throw new MeepoError("ERR_STT_FAILED", {
        message: "STT provider 'deepgram' requires DEEPGRAM_API_KEY to be configured.",
        metadata: {
          provider: "deepgram",
          env_key: "DEEPGRAM_API_KEY",
        },
      });
    }

    const wavBuffer = pcmToWav(pcm, sampleRate, 2);
    const params = new URLSearchParams({
      model: cfg.stt.deepgramModel,
      language: cfg.stt.language,
      smart_format: "true",
      punctuate: "true",
    });

    const response = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "content-type": "audio/wav",
      },
      body: new Uint8Array(wavBuffer),
    });

    if (!response.ok) {
      const message = await readErrorMessage(response);
      sttLog.error(`Deepgram transcription failed (${response.status}): ${message}`);
      throw new MeepoError("ERR_STT_FAILED", {
        message: `STT transcription failed: ${message}`,
        metadata: {
          provider: "deepgram",
          status: response.status,
          model: cfg.stt.deepgramModel,
        },
      });
    }

    const body = await response.json() as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            confidence?: number;
          }>;
        }>;
      };
    };

    const alternative = body.results?.channels?.[0]?.alternatives?.[0];
    const text = alternative?.transcript?.trim() ?? "";
    return {
      text,
      confidence: alternative?.confidence,
    };
  }
}