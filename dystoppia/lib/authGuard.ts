import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verify } from "@/lib/cookieToken";

export const ANON_USER_ID = "anon-default-user";

export async function requireUser(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _req: NextRequest
): Promise<{ userId: string } | NextResponse> {
  if (process.env.DISABLE_AUTH === "1") {
    return { userId: ANON_USER_ID };
  }

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
