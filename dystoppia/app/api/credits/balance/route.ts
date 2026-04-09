import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/authorization";
import { getCurrentCreditBalance } from "@/lib/credits";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (auth instanceof NextResponse) return auth;

    const balance = await getCurrentCreditBalance(auth.userId);

    return NextResponse.json({
      userId: auth.userId,
      role: auth.role,
      balance,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch credit balance", details: String(error) },
      { status: 500 }
    );
  }
}
