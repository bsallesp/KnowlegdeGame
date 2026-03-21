export interface TTSOptions {
  voice?: string;
  speed?: number;
}

export interface TTSProvider {
  synthesize(text: string, options?: TTSOptions): Promise<Buffer>;
}
