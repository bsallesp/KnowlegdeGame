import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authorization";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(req, "master");
    if (auth instanceof NextResponse) return auth;

    const limitParam = req.nextUrl.searchParams.get("limit");
    const requestId = req.nextUrl.searchParams.get("requestId");
    const take = Math.min(Math.max(Number.parseInt(limitParam ?? "20", 10) || 20, 1), 100);

    const entries = await prisma.auditLog.findMany({
      where: requestId ? { requestId } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    });

    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch audit log", details: String(error) },
      { status: 500 }
    );
  }
}
