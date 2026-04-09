import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authGuard";

export type UserRole = "master" | "customer";
export type ActionClass =
  | "read_only"
  | "analysis_only"
  | "billable_generation"
  | "privileged_execution";

export interface AuthenticatedUserContext {
  userId: string;
  role: UserRole;
  status: string;
  isInternal: boolean;
}

export interface AllowedActionInput {
  role: UserRole;
  actionClass: ActionClass;
  module: string;
}

export function isActionAllowed({
  role,
  actionClass,
  module,
}: AllowedActionInput): boolean {
  if (role === "master") {
    return true;
  }

  if (module === "builder") {
    return false;
  }

  return actionClass === "read_only" || actionClass === "analysis_only";
}

export async function getAuthenticatedUser(
  req: NextRequest
): Promise<AuthenticatedUserContext | NextResponse> {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      role: true,
      status: true,
      isInternal: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  if (user.status !== "active") {
    return NextResponse.json({ error: "Account is not active" }, { status: 403 });
  }

  return {
    userId: user.id,
    role: (user.role as UserRole) ?? "customer",
    status: user.status,
    isInternal: user.isInternal,
  };
}

export async function requireRole(
  req: NextRequest,
  role: UserRole
): Promise<AuthenticatedUserContext | NextResponse> {
  const user = await getAuthenticatedUser(req);
  if (user instanceof NextResponse) return user;

  if (user.role !== role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return user;
}

export function assertAllowedAction(
  input: AllowedActionInput
): NextResponse | null {
  if (isActionAllowed(input)) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Action not allowed",
      actionClass: input.actionClass,
      module: input.module,
    },
    { status: 403 }
  );
}
