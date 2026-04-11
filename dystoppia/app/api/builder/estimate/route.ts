import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { estimateBuilderRequest } from "@/lib/costEngine";
import { estimateCredits } from "@/lib/pricing";

const BUILDER_MODEL = "claude-sonnet-4-6";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(req, "master");
    if (auth instanceof NextResponse) return auth;

    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 4) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const heuristic = estimateBuilderRequest(prompt);

    const costEstimate = await estimateCredits({
      model: BUILDER_MODEL,
      estimatedInputTokens: heuristic.estimatedInputTokens,
      estimatedOutputTokens: heuristic.estimatedOutputTokens,
      serviceCategory: "planning",
      floorKey: "builder",
    });

    return NextResponse.json({
      ok: true,
      estimate: {
        ...heuristic,
        estimatedCredits: costEstimate.bufferedCredits,
        totalCostUsd: costEstimate.chargedCostUsd,
        providerCostUsd: costEstimate.rawCostUsd,
        pricing: {
          rawCostUsd: costEstimate.rawCostUsd,
          multiplier: costEstimate.multiplier,
          chargedCostUsd: costEstimate.chargedCostUsd,
          creditValueUsd: costEstimate.creditValueUsd,
          rawCredits: costEstimate.rawCredits,
          floorCredits: costEstimate.floorCredits,
          finalCredits: costEstimate.finalCredits,
          bufferFraction: costEstimate.bufferFraction,
          bufferedCredits: costEstimate.bufferedCredits,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to estimate builder request", details: String(error) },
      { status: 500 }
    );
  }
}
