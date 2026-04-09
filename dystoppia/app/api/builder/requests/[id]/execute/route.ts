import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authorization";
import { evaluateExecutionPolicy, type ExecutionMode } from "@/lib/executionPolicy";
import { logAuditEvent } from "@/lib/audit";
import { executeReadOnlyResearch } from "@/lib/researchExecutor";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(req, "master");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const mode = (body.mode === "live" ? "live" : "dry_run") as ExecutionMode;

    const request = await prisma.executionRequest.findFirst({
      where: {
        id,
        userId: auth.userId,
        module: "builder",
      },
      include: {
        approvalGates: true,
      },
    });

    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const policy = evaluateExecutionPolicy({
      prompt: request.prompt,
      actionClass: request.actionClass as
        | "read_only"
        | "analysis_only"
        | "billable_generation"
        | "privileged_execution",
      role: auth.role,
    });

    const unresolvedApprovalGates = request.approvalGates.filter((gate) => !gate.resolvedAt);
    if (policy.requiresApproval && unresolvedApprovalGates.length > 0) {
      await logAuditEvent({
        actorUserId: auth.userId,
        actorRole: auth.role,
        eventType: "execution.blocked.unresolved_approval",
        targetType: "ExecutionRequest",
        targetId: request.id,
        requestId: request.id,
        metadata: {
          unresolvedApprovalGates: unresolvedApprovalGates.length,
        },
      });

      return NextResponse.json(
        {
          error: "Execution requires resolved approval gates first",
          policy,
        },
        { status: 409 }
      );
    }

    if (!policy.allowedInMvp || policy.executorType === "none") {
      await logAuditEvent({
        actorUserId: auth.userId,
        actorRole: auth.role,
        eventType: "execution.blocked.policy",
        targetType: "ExecutionRequest",
        targetId: request.id,
        requestId: request.id,
        metadata: {
          policyStatus: policy.policyStatus,
          target: policy.target,
        },
      });

      return NextResponse.json(
        {
          error: "Execution is not allowed by MVP policy",
          policy,
        },
        { status: 403 }
      );
    }

    const manifest = {
      requestId: request.id,
      executorType: policy.executorType,
      target: policy.target,
      mode,
      prompt: request.prompt,
      safetyNotes: policy.reasons,
    };

    if (mode === "dry_run") {
      await logAuditEvent({
        actorUserId: auth.userId,
        actorRole: auth.role,
        eventType: "execution.dry_run.created",
        targetType: "ExecutionRequest",
        targetId: request.id,
        requestId: request.id,
        metadata: manifest,
      });

      return NextResponse.json({
        ok: true,
        mode,
        policy,
        manifest,
      });
    }

    const executorEnabled = process.env.DYSTOPPIA_ENABLE_RESEARCH_EXECUTOR === "true";

    if (!executorEnabled) {
      await logAuditEvent({
        actorUserId: auth.userId,
        actorRole: auth.role,
        eventType: "execution.live.blocked.config",
        targetType: "ExecutionRequest",
        targetId: request.id,
        requestId: request.id,
        metadata: {
          executorEnabled,
          executorType: policy.executorType,
        },
      });

      return NextResponse.json(
        {
          error: "Live execution is not configured",
          policy,
          manifest,
        },
        { status: 412 }
      );
    }

    const executorResponse = await executeReadOnlyResearch({
      prompt: request.prompt,
      requestId: request.id,
    });

    await prisma.usageEvent.create({
      data: {
        userId: auth.userId,
        requestId: request.id,
        provider: "reddit_public",
        serviceType: "research_executor_live",
        quantity: executorResponse.redditPosts.length,
        unit: "reddit_posts",
        estimatedCostUsd: 0,
        actualCostUsd: 0,
        metadataJson: JSON.stringify({
          query: executorResponse.query,
          mode,
        }),
      },
    });

    await logAuditEvent({
      actorUserId: auth.userId,
      actorRole: auth.role,
      eventType: "execution.live.completed",
      targetType: "ExecutionRequest",
      targetId: request.id,
      requestId: request.id,
      metadata: {
        executorType: policy.executorType,
        fetchedPosts: executorResponse.redditPosts.length,
        query: executorResponse.query,
      },
    });

    return NextResponse.json({
      ok: true,
      mode,
      policy,
      manifest,
      executorResponse,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to execute request", details: String(error) },
      { status: 500 }
    );
  }
}
