import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authorization";

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
      include: {
        approvalGates: true,
        usageEvents: true,
        auditLogs: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
        creditLedger: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
      },
    });

    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    return NextResponse.json({ request });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch builder request", details: String(error) },
      { status: 500 }
    );
  }
}
