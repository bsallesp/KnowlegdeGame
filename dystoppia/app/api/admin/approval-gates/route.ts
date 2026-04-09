import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authorization";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(req, "master");
    if (auth instanceof NextResponse) return auth;

    const status = req.nextUrl.searchParams.get("status");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const take = Math.min(Math.max(Number.parseInt(limitParam ?? "25", 10) || 25, 1), 100);

    const gates = await prisma.approvalGate.findMany({
      where: status ? { status } : undefined,
      include: {
        request: {
          select: {
            id: true,
            prompt: true,
            actionClass: true,
            status: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    });

    return NextResponse.json({ gates });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch approval gates", details: String(error) },
      { status: 500 }
    );
  }
}
