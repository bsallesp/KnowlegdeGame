import type { TTSProvider, TTSOptions } from "./provider";

const DEFAULT_VOICE = "en-US-JennyNeural";
const OUTPUT_FORMAT = "audio-24khz-96kbitrate-mono-mp3";

export class AzureTTSProvider implements TTSProvider {
  private subscriptionKey: string;
  private region: string;

  constructor(subscriptionKey: string, region: string) {
    this.subscriptionKey = subscriptionKey;
    this.region = region;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    const voice = options?.voice ?? DEFAULT_VOICE;
    const rate = options?.speed != null ? `${((options.speed - 1) * 100).toFixed(0)}%` : "0%";

    const ssml = `<speak version='1.0' xml:lang='en-US'>
  <voice name='${voice}'>
    <prosody rate='${rate}'>${text.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!))}</prosody>
  </voice>
</speak>`;

    const response = await fetch(
      `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": this.subscriptionKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
        },
        body: ssml,
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Azure TTS error ${response.status}: ${err}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
