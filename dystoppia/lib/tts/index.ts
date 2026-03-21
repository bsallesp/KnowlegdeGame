import type { TTSProvider } from "./provider";
import { OpenAITTSProvider } from "./openai";

export type { TTSProvider, TTSOptions } from "./provider";

/**
 * Returns the configured TTS provider.
 * To swap providers, set TTS_PROVIDER env var and add the new implementation here.
 *
 * Supported: "openai" (default)
 */
export function getTTSProvider(): TTSProvider {
  const provider = process.env.TTS_PROVIDER ?? "openai";

  switch (provider) {
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
      return new OpenAITTSProvider(apiKey);
    }
    default:
      throw new Error(`Unknown TTS provider: "${provider}". Supported: "openai"`);
  }
}
