import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verify } from "@/lib/cookieToken";

export async function requireUser(
  _req: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const store = await cookies();
  const token = store.get("dystoppia_uid")?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = verify(token);
  if (!userId) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  return { userId };
}
