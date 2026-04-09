import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/authorization";
import { listCreditLedger } from "@/lib/credits";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (auth instanceof NextResponse) return auth;

    const limitParam = req.nextUrl.searchParams.get("limit");
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 50;
    const entries = await listCreditLedger(auth.userId, Number.isNaN(parsedLimit) ? 50 : parsedLimit);

    return NextResponse.json({
      userId: auth.userId,
      entries,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch credit ledger", details: String(error) },
      { status: 500 }
    );
  }
}
