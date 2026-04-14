import { NextResponse } from "next/server";
import { cookies } from "next/headers";

async function clearSession() {
  const store = await cookies();
  store.set("dystoppia_uid", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  return clearSession();
}

export async function POST() {
  return clearSession();
}
