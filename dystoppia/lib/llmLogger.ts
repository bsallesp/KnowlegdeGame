import { prisma } from "@/lib/prisma";

// Anthropic pricing per token (as of 2026)
const ANTHROPIC_COSTS: Record<string, { input: number; output: number }> = {
  "claude-opus-4-5": { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 },
  "claude-sonnet-4-6": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  "claude-haiku-4-5": { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
  "claude-haiku-4-5-20251001": {
    input: 0.25 / 1_000_000,
    output: 1.25 / 1_000_000,
  },
};

// TTS pricing per character
const TTS_COSTS: Record<string, number> = {
  "openai-tts": 0.015 / 1_000, // $0.015 per 1000 chars
  "azure-tts": 0.016 / 1_000, // ~$0.016 per 1000 chars
};

export function calculateAnthropicCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = ANTHROPIC_COSTS[model];
  if (!pricing) return 0;
  return pricing.input * inputTokens + pricing.output * outputTokens;
}

export function calculateTTSCost(
  provider: "openai-tts" | "azure-tts",
  characters: number,
): number {
  return (TTS_COSTS[provider] ?? 0) * characters;
}

export interface LLMUsageParams {
  userId?: string | null;
  model: string;
  endpoint: string;
  inputTokens?: number;
  outputTokens?: number;
  characters?: number;
  costUsd?: number;
}

/**
 * Fire-and-forget LLM usage logger. Never throws.
 */
export function logLLMUsage(params: LLMUsageParams): void {
  const {
    userId,
    model,
    endpoint,
    inputTokens = 0,
    outputTokens = 0,
    characters = 0,
  } = params;

  const costUsd =
    params.costUsd ??
    (model.startsWith("claude")
      ? calculateAnthropicCost(model, inputTokens, outputTokens)
      : calculateTTSCost(model as "openai-tts" | "azure-tts", characters));

  prisma.lLMUsageLog
    .create({
      data: {
        userId: userId ?? null,
        model,
        endpoint,
        inputTokens,
        outputTokens,
        characters,
        costUsd,
      },
    })
    .catch(() => {
      // intentionally silent — usage logging must never break the main flow
    });
}
