import { prisma } from "@/lib/prisma";
import { getActivePrice, calculateRawCost } from "@/lib/pricing";

// Fallback costs used only when the pricing snapshot is not yet loaded
// (e.g., during seed or cold start). These should match the seed values.
const FALLBACK_COSTS: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 },
  "claude-sonnet-4-6": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  "claude-haiku-4-5": { input: 0.80 / 1_000_000, output: 4.0 / 1_000_000 },
  "claude-haiku-4-5-20251001": { input: 0.80 / 1_000_000, output: 4.0 / 1_000_000 },
};

const FALLBACK_TTS_COSTS: Record<string, number> = {
  "openai-tts": 0.015 / 1_000,
  "azure-tts": 0.016 / 1_000,
};

async function calculateCostFromSnapshot(
  model: string,
  inputTokens: number,
  outputTokens: number,
  characters: number,
): Promise<number> {
  const snapshot = await getActivePrice(model);

  if (snapshot) {
    if (snapshot.unit === "character") {
      return calculateRawCost(snapshot, characters, 0);
    }
    return calculateRawCost(snapshot, inputTokens, outputTokens);
  }

  // Fallback to hardcoded prices
  if (model.startsWith("claude")) {
    const pricing = FALLBACK_COSTS[model];
    if (!pricing) return 0;
    return pricing.input * inputTokens + pricing.output * outputTokens;
  }

  const ttsCost = FALLBACK_TTS_COSTS[model];
  if (ttsCost) return ttsCost * characters;

  return 0;
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

  void (async () => {
    try {
      const costUsd =
        params.costUsd ??
        (await calculateCostFromSnapshot(model, inputTokens, outputTokens, characters));

      await prisma.lLMUsageLog.create({
        data: {
          userId: userId ?? null,
          model,
          endpoint,
          inputTokens,
          outputTokens,
          characters,
          costUsd,
        },
      });
    } catch {
      // intentionally silent — usage logging must never break the main flow
    }
  })();
}
