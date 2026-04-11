import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authorization";
import { buildStructuredBuilderResult } from "@/lib/builder";
import { estimateBuilderRequest } from "@/lib/costEngine";
import { appendCreditLedgerEvent, getCurrentCreditBalance } from "@/lib/credits";
import { logAuditEvent } from "@/lib/audit";
import { estimateCredits, settleCredits } from "@/lib/pricing";

const BUILDER_MODEL = "claude-sonnet-4-6";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(req, "master");
    if (auth instanceof NextResponse) return auth;

    const requests = await prisma.executionRequest.findMany({
      where: { userId: auth.userId, module: "builder" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });

    return NextResponse.json({ requests });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch builder requests", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(req, "master");
    if (auth instanceof NextResponse) return auth;

    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
      return NextResponse.json({ error: "prompt must be at least 10 characters" }, { status: 400 });
    }

    // ── Step 1: Heuristic estimate (safety/viability check) ──
    const heuristicEstimate = estimateBuilderRequest(prompt);

    if (heuristicEstimate.viabilityStatus === "reject") {
      const rejectedRequest = await prisma.executionRequest.create({
        data: {
          userId: auth.userId,
          module: "builder",
          prompt: prompt.trim(),
          normalizedIntent: "builder_planning",
          requestClass: "builder",
          actionClass: heuristicEstimate.actionClass,
          status: "rejected",
          viabilityStatus: heuristicEstimate.viabilityStatus,
          estimatedCostUsd: 0,
          estimatedCredits: 0,
          completedAt: new Date(),
          warningsJson: JSON.stringify(heuristicEstimate.reasons),
        },
      });

      await logAuditEvent({
        actorUserId: auth.userId,
        actorRole: auth.role,
        eventType: "builder.request.rejected",
        targetType: "ExecutionRequest",
        targetId: rejectedRequest.id,
        requestId: rejectedRequest.id,
        metadata: { viabilityStatus: heuristicEstimate.viabilityStatus },
      });

      return NextResponse.json(
        { error: "Builder request rejected by safety policy", request: rejectedRequest },
        { status: 422 }
      );
    }

    // ── Step 2: Estimate credits from pricing engine ──
    const costEstimate = await estimateCredits({
      model: BUILDER_MODEL,
      estimatedInputTokens: heuristicEstimate.estimatedInputTokens,
      estimatedOutputTokens: heuristicEstimate.estimatedOutputTokens,
      serviceCategory: "planning",
      floorKey: "builder",
    });

    const creditsToReserve = costEstimate.bufferedCredits;
    const currentBalance = await getCurrentCreditBalance(auth.userId);

    if (currentBalance < creditsToReserve) {
      const rejectedRequest = await prisma.executionRequest.create({
        data: {
          userId: auth.userId,
          module: "builder",
          prompt: prompt.trim(),
          normalizedIntent: "builder_planning",
          requestClass: "builder",
          actionClass: heuristicEstimate.actionClass,
          status: "rejected",
          viabilityStatus: heuristicEstimate.viabilityStatus,
          estimatedCostUsd: costEstimate.rawCostUsd,
          estimatedCredits: creditsToReserve,
          warningsJson: JSON.stringify(["Insufficient credits for this request."]),
          completedAt: new Date(),
        },
      });

      await logAuditEvent({
        actorUserId: auth.userId,
        actorRole: auth.role,
        eventType: "builder.request.insufficient_credits",
        targetType: "ExecutionRequest",
        targetId: rejectedRequest.id,
        requestId: rejectedRequest.id,
        metadata: { currentBalance, requiredCredits: creditsToReserve },
      });

      return NextResponse.json(
        {
          error: "Insufficient credits",
          request: rejectedRequest,
          currentBalance,
          requiredCredits: creditsToReserve,
        },
        { status: 402 }
      );
    }

    // ── Step 3: Create request + reserve credits ──
    const executionRequest = await prisma.executionRequest.create({
      data: {
        userId: auth.userId,
        module: "builder",
        prompt: prompt.trim(),
        normalizedIntent: "builder_planning",
        requestClass: "builder",
        actionClass: heuristicEstimate.actionClass,
        status: "processing",
        viabilityStatus: heuristicEstimate.viabilityStatus,
        estimatedCostUsd: costEstimate.chargedCostUsd,
        estimatedCredits: creditsToReserve,
      },
    });

    const reservationEntry = await appendCreditLedgerEvent({
      userId: auth.userId,
      requestId: executionRequest.id,
      eventType: "reserved",
      amount: -creditsToReserve,
      reason: "Builder request reservation",
      metadata: {
        module: "builder",
        complexity: heuristicEstimate.complexity,
        estimatedInputTokens: heuristicEstimate.estimatedInputTokens,
        estimatedOutputTokens: heuristicEstimate.estimatedOutputTokens,
        multiplier: costEstimate.multiplier,
        bufferFraction: costEstimate.bufferFraction,
      },
      createdByUserId: auth.userId,
    });

    await logAuditEvent({
      actorUserId: auth.userId,
      actorRole: auth.role,
      eventType: "builder.request.reserved",
      targetType: "ExecutionRequest",
      targetId: executionRequest.id,
      requestId: executionRequest.id,
      metadata: {
        reservedCredits: creditsToReserve,
        balanceAfter: reservationEntry.balanceAfter,
      },
    });

    // ── Step 4: Call LLM ──
    const result = await buildStructuredBuilderResult({
      prompt,
      estimate: heuristicEstimate,
      userId: auth.userId,
    });

    // ── Step 5: Settle — measure real cost vs reserved ──
    const realTokens = result.costSummary._realTokens ?? {
      inputTokens: heuristicEstimate.estimatedInputTokens,
      outputTokens: heuristicEstimate.estimatedOutputTokens,
    };

    const settlement = await settleCredits({
      estimatedCredits: creditsToReserve,
      model: BUILDER_MODEL,
      realInputTokens: realTokens.inputTokens,
      realOutputTokens: realTokens.outputTokens,
      serviceCategory: "planning",
      floorKey: "builder",
    });

    // Apply settlement to ledger
    if (settlement.action === "refund" && settlement.difference > 0) {
      // Return excess reserved credits
      await appendCreditLedgerEvent({
        userId: auth.userId,
        requestId: executionRequest.id,
        eventType: "settled",
        amount: settlement.difference, // positive = credits back
        reason: `Builder settlement refund (reserved ${creditsToReserve}, actual ${settlement.settledCredits})`,
        metadata: {
          action: settlement.action,
          realCostUsd: settlement.realCostUsd,
          realCredits: settlement.realCredits,
          reservedCredits: creditsToReserve,
        },
        createdByUserId: auth.userId,
      });
    } else if (
      (settlement.action === "adjustment" || settlement.action === "capped") &&
      settlement.difference < 0
    ) {
      // Charge extra (up to cap)
      await appendCreditLedgerEvent({
        userId: auth.userId,
        requestId: executionRequest.id,
        eventType: "adjustment",
        amount: settlement.difference, // negative = extra charge
        reason: `Builder settlement adjustment (reserved ${creditsToReserve}, actual ${settlement.settledCredits})`,
        metadata: {
          action: settlement.action,
          realCostUsd: settlement.realCostUsd,
          realCredits: settlement.realCredits,
          reservedCredits: creditsToReserve,
          capped: settlement.action === "capped",
        },
        createdByUserId: auth.userId,
      });
    }
    // If "exact" — no ledger adjustment needed

    // ── Step 6: Finalize request ──
    await prisma.executionRequest.update({
      where: { id: executionRequest.id },
      data: {
        status: "completed",
        finalCostUsd: settlement.realCostUsd,
        finalCredits: settlement.settledCredits,
        resultJson: JSON.stringify(result),
        warningsJson: JSON.stringify(result.warnings),
        completedAt: new Date(),
      },
    });

    await prisma.usageEvent.create({
      data: {
        userId: auth.userId,
        requestId: executionRequest.id,
        provider: "anthropic",
        serviceType: "builder_planning",
        quantity: 1,
        unit: "request",
        estimatedCostUsd: costEstimate.rawCostUsd,
        actualCostUsd: settlement.realCostUsd,
        metadataJson: JSON.stringify({
          model: BUILDER_MODEL,
          estimatedInputTokens: heuristicEstimate.estimatedInputTokens,
          estimatedOutputTokens: heuristicEstimate.estimatedOutputTokens,
          realInputTokens: realTokens.inputTokens,
          realOutputTokens: realTokens.outputTokens,
          multiplier: costEstimate.multiplier,
          settlementAction: settlement.action,
          reservedCredits: creditsToReserve,
          settledCredits: settlement.settledCredits,
        }),
      },
    });

    if (heuristicEstimate.actionClass === "privileged_execution") {
      await prisma.approvalGate.create({
        data: {
          requestId: executionRequest.id,
          gateType: "expensive_execution",
          status: "not_available_in_mvp",
          requiredRole: "master",
          reason: "Execution-related requests remain manual or approval-gated in the MVP.",
        },
      });
    }

    // Get final balance after settlement
    const finalBalance = await getCurrentCreditBalance(auth.userId);

    await logAuditEvent({
      actorUserId: auth.userId,
      actorRole: auth.role,
      eventType: "builder.request.completed",
      targetType: "ExecutionRequest",
      targetId: executionRequest.id,
      requestId: executionRequest.id,
      metadata: {
        reservedCredits: creditsToReserve,
        settledCredits: settlement.settledCredits,
        settlementAction: settlement.action,
        realCostUsd: settlement.realCostUsd,
        balanceAfter: finalBalance,
        viabilityStatus: heuristicEstimate.viabilityStatus,
      },
    });

    return NextResponse.json({
      ok: true,
      request: {
        ...executionRequest,
        status: "completed",
        finalCostUsd: settlement.realCostUsd,
        finalCredits: settlement.settledCredits,
        resultJson: JSON.stringify(result),
        warningsJson: JSON.stringify(result.warnings),
        completedAt: new Date(),
      },
      estimate: {
        ...heuristicEstimate,
        estimatedCredits: creditsToReserve,
        totalCostUsd: costEstimate.chargedCostUsd,
      },
      settlement: {
        reservedCredits: creditsToReserve,
        settledCredits: settlement.settledCredits,
        action: settlement.action,
        realCostUsd: settlement.realCostUsd,
      },
      result,
      balanceAfter: finalBalance,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process builder request", details: String(error) },
      { status: 500 }
    );
  }
}
