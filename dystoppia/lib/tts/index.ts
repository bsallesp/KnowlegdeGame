import type { TTSProvider, TTSOptions } from "./provider";
import { OpenAITTSProvider } from "./openai";
import { AzureTTSProvider } from "./azure";
import { logger } from "@/lib/logger";

export type { TTSProvider, TTSOptions } from "./provider";

/**
 * Wraps a primary provider with a fallback.
 * If primary throws, logs the error and delegates to fallback.
 */
function withFallback(primary: TTSProvider, fallback: TTSProvider): TTSProvider {
  return {
    async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
      try {
        return await primary.synthesize(text, options);
      } catch (err) {
        logger.warn("tts", "Primary TTS provider failed, falling back to OpenAI", err);
        return fallback.synthesize(text, options);
      }
    },
  };
}

function buildOpenAI(): TTSProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAITTSProvider(apiKey);
}

function buildAzure(): TTSProvider | null {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return null;
  return new AzureTTSProvider(key, region);
}

/**
 * Returns the TTS provider chain:
 * - Azure TTS (primary, if AZURE_SPEECH_KEY + AZURE_SPEECH_REGION are set)
 * - OpenAI TTS (fallback, always)
 *
 * To force a specific provider, set TTS_PROVIDER="openai" or "azure".
 */
export function getTTSProvider(): TTSProvider {
  const forced = process.env.TTS_PROVIDER;

  if (forced === "openai") return buildOpenAI();
  if (forced === "azure") {
    const azure = buildAzure();
    if (!azure) throw new Error("AZURE_SPEECH_KEY or AZURE_SPEECH_REGION is not set");
    return azure;
  }

  // Auto: Azure → OpenAI fallback
  const azure = buildAzure();
  const openai = buildOpenAI();
  if (azure) return withFallback(azure, openai);
  return openai;
}
