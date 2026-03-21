import type { TTSProvider, TTSOptions } from "./provider";

const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";
const DEFAULT_VOICE = "alloy";
const DEFAULT_SPEED = 1.0;

export class OpenAITTSProvider implements TTSProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    const response = await fetch(OPENAI_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: options?.voice ?? DEFAULT_VOICE,
        speed: options?.speed ?? DEFAULT_SPEED,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI TTS error ${response.status}: ${err}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
