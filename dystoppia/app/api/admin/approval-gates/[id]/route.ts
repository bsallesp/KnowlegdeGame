import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authorization";
import { logAuditEvent } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(req, "master");
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const { decision, note } = await req.json();

    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json({ error: "decision must be approved or rejected" }, { status: 400 });
    }

    const gate = await prisma.approvalGate.findUnique({
      where: { id },
      include: {
        request: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!gate) {
      return NextResponse.json({ error: "Approval gate not found" }, { status: 404 });
    }

    const updatedGate = await prisma.approvalGate.update({
      where: { id },
      data: {
        status: decision,
        resolvedByUserId: auth.userId,
        resolvedAt: new Date(),
      },
    });

    await logAuditEvent({
      actorUserId: auth.userId,
      actorRole: auth.role,
      eventType: `approval_gate.${decision}`,
      targetType: "ApprovalGate",
      targetId: gate.id,
      requestId: gate.requestId,
      metadata: {
        note: typeof note === "string" ? note : null,
        previousStatus: gate.status,
      },
    });

    return NextResponse.json({ gate: updatedGate });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to resolve approval gate", details: String(error) },
      { status: 500 }
    );
  }
}
