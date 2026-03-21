import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sign } from "@/lib/cookieToken";
import { requestLogger } from "@/lib/logger";

const GENERIC_ERROR = "Invalid email or password.";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const normalized = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalized } });

    // Always run bcrypt to prevent timing-based email enumeration
    const dummyHash = "$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const passwordMatch = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);

    if (!user || !passwordMatch) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    if (!user.emailVerified) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED", email: normalized }, { status: 403 });
    }

    const cookieStore = await cookies();
    cookieStore.set("dystoppia_uid", sign(user.id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (err) {
    const log = requestLogger("auth/login"); log.error("Login failed", { error: String(err) });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
