import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authorization";
import { buildStructuredBuilderResult } from "@/lib/builder";
import { estimateBuilderRequest } from "@/lib/costEngine";
import { appendCreditLedgerEvent, getCurrentCreditBalance } from "@/lib/credits";
import { logAuditEvent } from "@/lib/audit";

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

    const estimate = estimateBuilderRequest(prompt);
    const result = buildStructuredBuilderResult({ prompt, estimate });
    const warnings = result.warnings;

    const currentBalance = await getCurrentCreditBalance(auth.userId);

    if (estimate.viabilityStatus === "reject") {
      const rejectedRequest = await prisma.executionRequest.create({
        data: {
          userId: auth.userId,
          module: "builder",
          prompt: prompt.trim(),
          normalizedIntent: "builder_planning",
          requestClass: "builder",
          actionClass: estimate.actionClass,
          status: "rejected",
          viabilityStatus: estimate.viabilityStatus,
          estimatedCostUsd: estimate.totalCostUsd,
          estimatedCredits: estimate.estimatedCredits,
          resultJson: JSON.stringify(result),
          warningsJson: JSON.stringify(warnings),
          completedAt: new Date(),
        },
      });

      await logAuditEvent({
        actorUserId: auth.userId,
        actorRole: auth.role,
        eventType: "builder.request.rejected",
        targetType: "ExecutionRequest",
        targetId: rejectedRequest.id,
        requestId: rejectedRequest.id,
        metadata: {
          viabilityStatus: estimate.viabilityStatus,
        },
      });

      return NextResponse.json(
        {
          error: "Builder request rejected by safety policy",
          request: rejectedRequest,
          estimate,
          result,
        },
        { status: 422 }
      );
    }

    if (currentBalance < estimate.estimatedCredits) {
      const rejectedRequest = await prisma.executionRequest.create({
        data: {
          userId: auth.userId,
          module: "builder",
          prompt: prompt.trim(),
          normalizedIntent: "builder_planning",
          requestClass: "builder",
          actionClass: estimate.actionClass,
          status: "rejected",
          viabilityStatus: estimate.viabilityStatus,
          estimatedCostUsd: estimate.totalCostUsd,
          estimatedCredits: estimate.estimatedCredits,
          resultJson: JSON.stringify(result),
          warningsJson: JSON.stringify([...warnings, "Insufficient credits for this request."]),
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
        metadata: {
          currentBalance,
          estimatedCredits: estimate.estimatedCredits,
        },
      });

      return NextResponse.json(
        {
          error: "Insufficient credits",
          request: rejectedRequest,
          currentBalance,
          requiredCredits: estimate.estimatedCredits,
        },
        { status: 402 }
      );
    }

    const executionRequest = await prisma.executionRequest.create({
      data: {
        userId: auth.userId,
        module: "builder",
        prompt: prompt.trim(),
        normalizedIntent: "builder_planning",
        requestClass: "builder",
        actionClass: estimate.actionClass,
        status: "completed",
        viabilityStatus: estimate.viabilityStatus,
        estimatedCostUsd: estimate.totalCostUsd,
        estimatedCredits: estimate.estimatedCredits,
        finalCostUsd: estimate.totalCostUsd,
        finalCredits: estimate.estimatedCredits,
        resultJson: JSON.stringify(result),
        warningsJson: JSON.stringify(warnings),
        completedAt: new Date(),
      },
    });

    const ledgerEntry = await appendCreditLedgerEvent({
      userId: auth.userId,
      requestId: executionRequest.id,
      eventType: "deduction",
      amount: -estimate.estimatedCredits,
      reason: "Builder request charge",
      metadata: {
        module: "builder",
        complexity: estimate.complexity,
      },
      createdByUserId: auth.userId,
    });

    await prisma.usageEvent.create({
      data: {
        userId: auth.userId,
        requestId: executionRequest.id,
        provider: "internal",
        serviceType: "builder_planning",
        quantity: 1,
        unit: "request",
        estimatedCostUsd: estimate.totalCostUsd,
        actualCostUsd: estimate.totalCostUsd,
        metadataJson: JSON.stringify({
          complexity: estimate.complexity,
          confidence: estimate.confidence,
        }),
      },
    });

    if (estimate.actionClass === "privileged_execution") {
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

    await logAuditEvent({
      actorUserId: auth.userId,
      actorRole: auth.role,
      eventType: "builder.request.completed",
      targetType: "ExecutionRequest",
      targetId: executionRequest.id,
      requestId: executionRequest.id,
      metadata: {
        estimatedCredits: estimate.estimatedCredits,
        balanceAfter: ledgerEntry.balanceAfter,
        viabilityStatus: estimate.viabilityStatus,
      },
    });

    return NextResponse.json({
      ok: true,
      request: executionRequest,
      estimate,
      result,
      balanceAfter: ledgerEntry.balanceAfter,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process builder request", details: String(error) },
      { status: 500 }
    );
  }
}
