import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// ─── fetch mock ───────────────────────────────────────────────────────────────
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { OpenAITTSProvider } from "@/lib/tts/openai";
import { AzureTTSProvider } from "@/lib/tts/azure";
import { getTTSProvider } from "@/lib/tts";

const AUDIO_BYTES = Buffer.from("fake-mp3-data");

function mockFetchOk(bytes = AUDIO_BYTES) {
  mockFetch.mockResolvedValue({
    ok: true,
    arrayBuffer: async () => bytes.buffer,
    text: async () => "",
  });
}

function mockFetchFail(status = 500, message = "Internal Server Error") {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    text: async () => message,
    arrayBuffer: async () => new ArrayBuffer(0),
  });
}

beforeEach(() => vi.clearAllMocks());

// ─── OpenAITTSProvider ────────────────────────────────────────────────────────
describe("OpenAITTSProvider", () => {
  const provider = new OpenAITTSProvider("sk-test-key");

  test("calls OpenAI TTS endpoint with correct headers", async () => {
    mockFetchOk();
    await provider.synthesize("Hello world");
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk-test-key");
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  test("sends correct body with default voice and speed", async () => {
    mockFetchOk();
    await provider.synthesize("Test");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.model).toBe("tts-1");
    expect(body.voice).toBe("alloy");
    expect(body.speed).toBe(1.0);
    expect(body.input).toBe("Test");
  });

  test("sends custom voice and speed when provided", async () => {
    mockFetchOk();
    await provider.synthesize("Test", { voice: "nova", speed: 1.2 });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.voice).toBe("nova");
    expect(body.speed).toBe(1.2);
  });

  test("returns audio buffer on success", async () => {
    mockFetchOk();
    const result = await provider.synthesize("Hello");
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  test("throws on non-ok response", async () => {
    mockFetchFail(429, "Rate limit exceeded");
    await expect(provider.synthesize("Hello")).rejects.toThrow("OpenAI TTS error 429");
  });
});

// ─── AzureTTSProvider ─────────────────────────────────────────────────────────
describe("AzureTTSProvider", () => {
  const provider = new AzureTTSProvider("azure-key-123", "eastus");

  test("calls Azure TTS endpoint with correct region", async () => {
    mockFetchOk();
    await provider.synthesize("Hello");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("eastus.tts.speech.microsoft.com");
  });

  test("sends correct subscription key header", async () => {
    mockFetchOk();
    await provider.synthesize("Hello");
    const opts = mockFetch.mock.calls[0][1] as RequestInit;
    expect((opts.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]).toBe("azure-key-123");
  });

  test("sends SSML content type", async () => {
    mockFetchOk();
    await provider.synthesize("Hello");
    const opts = mockFetch.mock.calls[0][1] as RequestInit;
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe("application/ssml+xml");
  });

  test("SSML body contains the text to synthesize", async () => {
    mockFetchOk();
    await provider.synthesize("Learn this concept");
    const body = mockFetch.mock.calls[0][1].body as string;
    expect(body).toContain("Learn this concept");
  });

  test("SSML escapes XML special characters", async () => {
    mockFetchOk();
    await provider.synthesize('5 < 10 & "quoted"');
    const body = mockFetch.mock.calls[0][1].body as string;
    expect(body).toContain("&lt;");
    expect(body).toContain("&amp;");
    expect(body).toContain("&quot;");
  });

  test("uses default voice en-US-JennyNeural", async () => {
    mockFetchOk();
    await provider.synthesize("Hello");
    const body = mockFetch.mock.calls[0][1].body as string;
    expect(body).toContain("en-US-JennyNeural");
  });

  test("uses custom voice when provided", async () => {
    mockFetchOk();
    await provider.synthesize("Hello", { voice: "en-US-GuyNeural" });
    const body = mockFetch.mock.calls[0][1].body as string;
    expect(body).toContain("en-US-GuyNeural");
  });

  test("returns audio buffer on success", async () => {
    mockFetchOk();
    const result = await provider.synthesize("Hello");
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  test("throws on non-ok response", async () => {
    mockFetchFail(401, "Unauthorized");
    await expect(provider.synthesize("Hello")).rejects.toThrow("Azure TTS error 401");
  });
});

// ─── getTTSProvider factory ───────────────────────────────────────────────────
describe("getTTSProvider()", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("returns OpenAI provider when TTS_PROVIDER=openai", () => {
    process.env.TTS_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.AZURE_SPEECH_KEY;
    delete process.env.AZURE_SPEECH_REGION;
    const provider = getTTSProvider();
    expect(provider).toBeDefined();
  });

  test("throws when TTS_PROVIDER=openai but OPENAI_API_KEY missing", () => {
    process.env.TTS_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    expect(() => getTTSProvider()).toThrow("OPENAI_API_KEY");
  });

  test("returns Azure provider when TTS_PROVIDER=azure and keys set", () => {
    process.env.TTS_PROVIDER = "azure";
    process.env.AZURE_SPEECH_KEY = "az-key";
    process.env.AZURE_SPEECH_REGION = "eastus";
    const provider = getTTSProvider();
    expect(provider).toBeDefined();
  });

  test("throws when TTS_PROVIDER=azure but keys missing", () => {
    process.env.TTS_PROVIDER = "azure";
    delete process.env.AZURE_SPEECH_KEY;
    delete process.env.AZURE_SPEECH_REGION;
    expect(() => getTTSProvider()).toThrow();
  });

  test("auto-mode: returns Azure+fallback when Azure keys present", () => {
    delete process.env.TTS_PROVIDER;
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AZURE_SPEECH_KEY = "az-key";
    process.env.AZURE_SPEECH_REGION = "eastus";
    const provider = getTTSProvider();
    expect(provider).toBeDefined();
  });

  test("auto-mode: returns OpenAI when Azure keys absent", () => {
    delete process.env.TTS_PROVIDER;
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.AZURE_SPEECH_KEY;
    delete process.env.AZURE_SPEECH_REGION;
    const provider = getTTSProvider();
    expect(provider).toBeDefined();
  });

  test("auto-mode with fallback: if Azure fails, falls back to OpenAI", async () => {
    delete process.env.TTS_PROVIDER;
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AZURE_SPEECH_KEY = "az-key";
    process.env.AZURE_SPEECH_REGION = "eastus";

    // First call (Azure) fails, second call (OpenAI) succeeds
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "Azure down" })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => AUDIO_BYTES.buffer });

    const provider = getTTSProvider();
    const result = await provider.synthesize("Hello");
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
