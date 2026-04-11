import { prisma } from "@/lib/prisma";

// ── Types ──

export interface PricingSnapshot {
  provider: string;
  model: string;
  inputPricePerUnit: number;
  outputPricePerUnit: number;
  unit: string;
}

export interface Multipliers {
  planning: number;
  generation: number;
  execution: number;
  research: number;
  tts: number;
}

export interface FloorCredits {
  builder: number;
  onboarding: number;
  research: number;
  tts: number;
  default: number;
}

export type ServiceCategory = keyof Multipliers;

export interface CostEstimate {
  rawCostUsd: number;
  multiplier: number;
  chargedCostUsd: number;
  creditValueUsd: number;
  rawCredits: number;
  floorCredits: number;
  finalCredits: number;
  bufferFraction: number;
  bufferedCredits: number;
}

export interface SettlementResult {
  estimatedCredits: number;
  realCostUsd: number;
  realCredits: number;
  settlementCapFraction: number;
  maxAllowedCredits: number;
  settledCredits: number;
  difference: number; // positive = refund, negative = extra charge
  action: "refund" | "exact" | "adjustment" | "capped";
}

// ── Config cache (in-memory, refreshed on miss or expiry) ──

interface ConfigCache {
  creditValueUsd: number;
  multipliers: Multipliers;
  floorCredits: FloorCredits;
  settlementCapFraction: number;
  estimateBufferFraction: number;
  loadedAt: number;
}

const CONFIG_TTL_MS = 60_000; // 1 minute
let configCache: ConfigCache | null = null;

async function getConfigValue(key: string): Promise<string | null> {
  const entry = await prisma.platformConfig.findUnique({ where: { key } });
  return entry?.value ?? null;
}

async function loadConfig(): Promise<ConfigCache> {
  if (configCache && Date.now() - configCache.loadedAt < CONFIG_TTL_MS) {
    return configCache;
  }

  const [creditValueRaw, multipliersRaw, floorsRaw, capRaw, bufferRaw] =
    await Promise.all([
      getConfigValue("pricing.credit_value_usd"),
      getConfigValue("pricing.multipliers"),
      getConfigValue("pricing.floor_credits"),
      getConfigValue("pricing.settlement_cap_fraction"),
      getConfigValue("pricing.estimate_buffer_fraction"),
    ]);

  const defaults: ConfigCache = {
    creditValueUsd: 0.01,
    multipliers: { planning: 4.0, generation: 5.0, execution: 1.8, research: 3.0, tts: 3.0 },
    floorCredits: { builder: 5, onboarding: 2, research: 3, tts: 1, default: 1 },
    settlementCapFraction: 0.3,
    estimateBufferFraction: 0.15,
    loadedAt: Date.now(),
  };

  configCache = {
    creditValueUsd: creditValueRaw ? Number(creditValueRaw) || defaults.creditValueUsd : defaults.creditValueUsd,
    multipliers: multipliersRaw ? { ...defaults.multipliers, ...(JSON.parse(multipliersRaw) as Partial<Multipliers>) } : defaults.multipliers,
    floorCredits: floorsRaw ? { ...defaults.floorCredits, ...(JSON.parse(floorsRaw) as Partial<FloorCredits>) } : defaults.floorCredits,
    settlementCapFraction: capRaw ? Number(capRaw) || defaults.settlementCapFraction : defaults.settlementCapFraction,
    estimateBufferFraction: bufferRaw ? Number(bufferRaw) || defaults.estimateBufferFraction : defaults.estimateBufferFraction,
    loadedAt: Date.now(),
  };

  return configCache;
}

// ── Pricing snapshot lookup ──

const snapshotCache = new Map<string, { snapshot: PricingSnapshot; loadedAt: number }>();

export async function getActivePrice(model: string): Promise<PricingSnapshot | null> {
  const cached = snapshotCache.get(model);
  if (cached && Date.now() - cached.loadedAt < CONFIG_TTL_MS) {
    return cached.snapshot;
  }

  const row = await prisma.providerPricingSnapshot.findFirst({
    where: {
      model,
      effectiveTo: null,
    },
    orderBy: { effectiveFrom: "desc" },
  });

  if (!row) return null;

  const snapshot: PricingSnapshot = {
    provider: row.provider,
    model: row.model,
    inputPricePerUnit: row.inputPricePerUnit,
    outputPricePerUnit: row.outputPricePerUnit,
    unit: row.unit,
  };

  snapshotCache.set(model, { snapshot, loadedAt: Date.now() });
  return snapshot;
}

// ── Cost calculation ──

export function calculateRawCost(
  snapshot: PricingSnapshot,
  inputUnits: number,
  outputUnits: number,
): number {
  return snapshot.inputPricePerUnit * inputUnits + snapshot.outputPricePerUnit * outputUnits;
}

export async function estimateCredits(params: {
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  serviceCategory: ServiceCategory;
  floorKey?: keyof FloorCredits;
}): Promise<CostEstimate> {
  const config = await loadConfig();
  const snapshot = await getActivePrice(params.model);

  const rawCostUsd = snapshot
    ? calculateRawCost(snapshot, params.estimatedInputTokens, params.estimatedOutputTokens)
    : 0;

  const multiplier = config.multipliers[params.serviceCategory];
  const chargedCostUsd = rawCostUsd * multiplier;
  const rawCredits = Math.ceil(chargedCostUsd / config.creditValueUsd);
  const floorKey = params.floorKey ?? "default";
  const floorCredits = config.floorCredits[floorKey] ?? config.floorCredits.default;
  const finalCredits = Math.max(rawCredits, floorCredits);
  const bufferedCredits = Math.ceil(finalCredits * (1 + config.estimateBufferFraction));

  return {
    rawCostUsd,
    multiplier,
    chargedCostUsd,
    creditValueUsd: config.creditValueUsd,
    rawCredits,
    floorCredits,
    finalCredits,
    bufferFraction: config.estimateBufferFraction,
    bufferedCredits,
  };
}

// ── Settlement (post-LLM) ──

export async function settleCredits(params: {
  estimatedCredits: number;
  model: string;
  realInputTokens: number;
  realOutputTokens: number;
  serviceCategory: ServiceCategory;
  floorKey?: keyof FloorCredits;
}): Promise<SettlementResult> {
  const config = await loadConfig();
  const snapshot = await getActivePrice(params.model);

  const realCostUsd = snapshot
    ? calculateRawCost(snapshot, params.realInputTokens, params.realOutputTokens)
    : 0;

  const multiplier = config.multipliers[params.serviceCategory];
  const chargedCostUsd = realCostUsd * multiplier;
  const rawCredits = Math.ceil(chargedCostUsd / config.creditValueUsd);
  const floorKey = params.floorKey ?? "default";
  const floorCredits = config.floorCredits[floorKey] ?? config.floorCredits.default;
  const realCredits = Math.max(rawCredits, floorCredits);

  const maxAllowedCredits = Math.ceil(
    params.estimatedCredits * (1 + config.settlementCapFraction)
  );

  let settledCredits: number;
  let action: SettlementResult["action"];

  if (realCredits === params.estimatedCredits) {
    settledCredits = realCredits;
    action = "exact";
  } else if (realCredits < params.estimatedCredits) {
    settledCredits = realCredits;
    action = "refund";
  } else if (realCredits <= maxAllowedCredits) {
    settledCredits = realCredits;
    action = "adjustment";
  } else {
    // Cap: we absorb the excess beyond the cap
    settledCredits = maxAllowedCredits;
    action = "capped";
  }

  const difference = params.estimatedCredits - settledCredits;

  return {
    estimatedCredits: params.estimatedCredits,
    realCostUsd,
    realCredits,
    settlementCapFraction: config.settlementCapFraction,
    maxAllowedCredits,
    settledCredits,
    difference,
    action,
  };
}

// ── Utility: invalidate cache (call after admin updates config) ──

export function invalidatePricingCache(): void {
  configCache = null;
  snapshotCache.clear();
}
