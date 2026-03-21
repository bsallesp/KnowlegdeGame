import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authGuard";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const profile = await prisma.userProfile.findUnique({
    where: { userId: auth.userId },
  });

  if (!profile) {
    return NextResponse.json({ profile: null });
  }

  return NextResponse.json({
    profile: {
      goals: profile.goals ? JSON.parse(profile.goals) : [],
      knowledgeLevels: profile.knowledgeLevels ? JSON.parse(profile.knowledgeLevels) : {},
      timePerSession: profile.timePerSession,
      preferredLang: profile.preferredLang,
      rawHistory: profile.rawHistory ? JSON.parse(profile.rawHistory) : [],
    },
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const updates = await req.json();
  const data: Record<string, string> = {};

  if (updates.goals !== undefined) data.goals = JSON.stringify(updates.goals);
  if (updates.knowledgeLevels !== undefined) data.knowledgeLevels = JSON.stringify(updates.knowledgeLevels);
  if (updates.timePerSession !== undefined) data.timePerSession = updates.timePerSession;
  if (updates.preferredLang !== undefined) data.preferredLang = updates.preferredLang;

  await prisma.userProfile.upsert({
    where: { userId: auth.userId },
    create: { userId: auth.userId, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}
