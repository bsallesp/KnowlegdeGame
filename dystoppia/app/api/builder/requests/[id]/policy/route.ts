import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authorization";
import { evaluateExecutionPolicy } from "@/lib/executionPolicy";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(req, "master");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const request = await prisma.executionRequest.findFirst({
      where: {
        id,
        userId: auth.userId,
        module: "builder",
      },
      select: {
        id: true,
        prompt: true,
        actionClass: true,
        approvalGates: {
          select: {
            id: true,
            status: true,
            resolvedAt: true,
          },
        },
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

    return NextResponse.json({
      requestId: request.id,
      policy,
      approvalSummary: {
        total: request.approvalGates.length,
        unresolved: request.approvalGates.filter((gate) => !gate.resolvedAt).length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to evaluate execution policy", details: String(error) },
      { status: 500 }
    );
  }
}
