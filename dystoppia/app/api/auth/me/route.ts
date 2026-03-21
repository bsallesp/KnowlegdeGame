import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verify } from "@/lib/cookieToken";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("dystoppia_uid")?.value;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = verify(token);
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, credits: true, plan: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      credits: user.credits,
      plan: user.plan,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to verify session", details: String(error) },
      { status: 500 }
    );
  }
}
