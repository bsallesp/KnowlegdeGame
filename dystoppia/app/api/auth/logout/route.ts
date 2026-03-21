import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function DELETE() {
  const store = await cookies();
  store.set("dystoppia_uid", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
