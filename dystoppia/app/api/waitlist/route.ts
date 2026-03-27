import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { email, source } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    await prisma.waitlistEntry.upsert({
      where: { email: email.toLowerCase().trim() },
      create: { email: email.toLowerCase().trim(), source: source ?? null },
      update: {},
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to save email" }, { status: 500 });
  }
}
