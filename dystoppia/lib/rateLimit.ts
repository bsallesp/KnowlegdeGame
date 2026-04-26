import { prisma } from "@/lib/prisma";

export type UsageType = "question" | "curriculum";

export interface RateLimitState {
  hourlyUsage: number;
  hourlyRemaining: number;
  hourlyResetsAt: Date;
}

export class RateLimitError extends Error {
  constructor(
    public readonly window: "hourly",
    public readonly remaining: number,
    public readonly resetsAt: Date,
  ) {
    super(`Rate limit exceeded (${window})`);
    this.name = "RateLimitError";
  }
}

const PLAN_LIMITS: Record<
  string,
  {
    hourly: number;
    hourlyCurriculum: number;
  }
> = {
  free: { hourly: 999999, hourlyCurriculum: 999999 },
  learner: { hourly: 999999, hourlyCurriculum: 999999 },
  master: { hourly: 999999, hourlyCurriculum: 999999 },
};

function planLimits(plan: string) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

const HOUR_MS = 60 * 60 * 1000;
const MAX_RETRIES = 5;

export async function checkRateLimit(
  userId: string,
  amount: number,
  type: UsageType,
): Promise<RateLimitState> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        plan: true,
        isInternal: true,
        hourlyUsage: true,
        hourlyWindowStart: true,
        hourlyCurriculumUsage: true,
      },
    });

    if (!user) throw new Error("User not found");

    const now = new Date();
    const limits = planLimits(user.plan);

    if (user.isInternal) {
      return {
        hourlyUsage: user.hourlyUsage,
        hourlyRemaining: Number.POSITIVE_INFINITY,
        hourlyResetsAt: new Date(user.hourlyWindowStart.getTime() + HOUR_MS),
      };
    }

    const hourlyExpired = now.getTime() - user.hourlyWindowStart.getTime() >= HOUR_MS;
    const currentHourly = hourlyExpired ? 0 : user.hourlyUsage;
    const currentHourlyCurriculum = hourlyExpired ? 0 : user.hourlyCurriculumUsage;

    if (type === "curriculum") {
      if (currentHourlyCurriculum + amount > limits.hourlyCurriculum) {
        throw new RateLimitError("hourly", limits.hourlyCurriculum - currentHourlyCurriculum, new Date(user.hourlyWindowStart.getTime() + HOUR_MS));
      }
    } else if (currentHourly + amount > limits.hourly) {
      throw new RateLimitError("hourly", limits.hourly - currentHourly, new Date(user.hourlyWindowStart.getTime() + HOUR_MS));
    }

    const updateData: {
      hourlyUsage?: number;
      hourlyWindowStart?: Date;
      hourlyCurriculumUsage?: number;
    } = {};

    if (type === "curriculum") {
      updateData.hourlyCurriculumUsage = currentHourlyCurriculum + amount;
    } else {
      updateData.hourlyUsage = currentHourly + amount;
    }

    if (hourlyExpired) {
      updateData.hourlyWindowStart = now;
      if (type === "curriculum") {
        updateData.hourlyCurriculumUsage = amount;
      } else {
        updateData.hourlyUsage = amount;
      }
    }

    const result = await prisma.user.updateMany({
      where: {
        id: userId,
        hourlyUsage: user.hourlyUsage,
        hourlyWindowStart: user.hourlyWindowStart,
        hourlyCurriculumUsage: user.hourlyCurriculumUsage,
      },
      data: updateData,
    });

    if (result.count === 1) {
      const newHourlyUsage =
        type === "curriculum"
          ? currentHourly
          : (updateData.hourlyUsage ?? currentHourly);
      const hourlyWindowStart = hourlyExpired ? now : user.hourlyWindowStart;

      return {
        hourlyUsage: newHourlyUsage,
        hourlyRemaining: limits.hourly - newHourlyUsage,
        hourlyResetsAt: new Date(hourlyWindowStart.getTime() + HOUR_MS),
      };
    }
  }

  throw new Error("Failed to update rate limit due to concurrent updates");
}

export async function getRateLimitState(userId: string): Promise<RateLimitState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      hourlyUsage: true,
      hourlyWindowStart: true,
    },
  });

  if (!user) throw new Error("User not found");

  const now = new Date();
  const limits = planLimits(user.plan);
  const hourlyExpired = now.getTime() - user.hourlyWindowStart.getTime() >= HOUR_MS;
  const currentHourly = hourlyExpired ? 0 : user.hourlyUsage;

  return {
    hourlyUsage: currentHourly,
    hourlyRemaining: limits.hourly - currentHourly,
    hourlyResetsAt: new Date(user.hourlyWindowStart.getTime() + HOUR_MS),
  };
}

export { planLimits as getPlanLimits };
