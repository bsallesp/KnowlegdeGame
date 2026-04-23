import { prisma } from "@/lib/prisma";

export type UsageType = "question" | "curriculum";

export interface RateLimitState {
  hourlyUsage: number;
  hourlyRemaining: number;
  hourlyResetsAt: Date;
  weeklyUsage: number;
  weeklyRemaining: number;
  weeklyResetsAt: Date;
}

export class RateLimitError extends Error {
  constructor(
    public readonly window: "hourly" | "weekly",
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
    weekly: number;
    hourlyCurriculum: number;
    weeklyCurriculum: number;
  }
> = {
  free: { hourly: 5, weekly: 30, hourlyCurriculum: 1, weeklyCurriculum: 2 },
  learner: {
    hourly: 30,
    weekly: 250,
    hourlyCurriculum: 5,
    weeklyCurriculum: 10,
  },
  master: {
    hourly: 100,
    weekly: 1000,
    hourlyCurriculum: 20,
    weeklyCurriculum: 9999,
  },
};

function planLimits(plan: string) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS["free"];
}

const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RETRIES = 5;

/**
 * Checks and increments the rate limit for a user.
 * Uses optimistic concurrency (same pattern as the old deductCredits).
 * Throws RateLimitError if either the hourly or weekly limit is exceeded.
 */
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
        weeklyUsage: true,
        weeklyWindowStart: true,
        weeklyCurriculumUsage: true,
      },
    });

    if (!user) throw new Error("User not found");

    const now = new Date();
    const limits = planLimits(user.plan);

    // Internal accounts (Anthropic staff / developers) bypass quota limits entirely.
    // Counters are left untouched so production telemetry stays clean.
    if (user.isInternal) {
      return {
        hourlyUsage: user.hourlyUsage,
        hourlyRemaining: Number.POSITIVE_INFINITY,
        hourlyResetsAt: new Date(user.hourlyWindowStart.getTime() + HOUR_MS),
        weeklyUsage: user.weeklyUsage,
        weeklyRemaining: Number.POSITIVE_INFINITY,
        weeklyResetsAt: new Date(user.weeklyWindowStart.getTime() + WEEK_MS),
      };
    }

    // Determine effective hourly usage (reset if window expired)
    const hourlyExpired =
      now.getTime() - user.hourlyWindowStart.getTime() >= HOUR_MS;
    const currentHourly = hourlyExpired ? 0 : user.hourlyUsage;
    const currentHourlyCurriculum = hourlyExpired
      ? 0
      : user.hourlyCurriculumUsage;

    // Determine effective weekly usage (reset if window expired)
    const weeklyExpired =
      now.getTime() - user.weeklyWindowStart.getTime() >= WEEK_MS;
    const currentWeekly = weeklyExpired ? 0 : user.weeklyUsage;
    const currentWeeklyCurriculum = weeklyExpired
      ? 0
      : user.weeklyCurriculumUsage;

    // Check limits based on type
    if (type === "curriculum") {
      if (currentHourlyCurriculum + amount > limits.hourlyCurriculum) {
        const resetsAt = new Date(
          user.hourlyWindowStart.getTime() + HOUR_MS,
        );
        throw new RateLimitError("hourly", limits.hourlyCurriculum - currentHourlyCurriculum, resetsAt);
      }
      if (currentWeeklyCurriculum + amount > limits.weeklyCurriculum) {
        const resetsAt = new Date(
          user.weeklyWindowStart.getTime() + WEEK_MS,
        );
        throw new RateLimitError("weekly", limits.weeklyCurriculum - currentWeeklyCurriculum, resetsAt);
      }
    } else {
      if (currentHourly + amount > limits.hourly) {
        const resetsAt = new Date(
          user.hourlyWindowStart.getTime() + HOUR_MS,
        );
        throw new RateLimitError("hourly", limits.hourly - currentHourly, resetsAt);
      }
      if (currentWeekly + amount > limits.weekly) {
        const resetsAt = new Date(
          user.weeklyWindowStart.getTime() + WEEK_MS,
        );
        throw new RateLimitError("weekly", limits.weekly - currentWeekly, resetsAt);
      }
    }

    // Build update data with new counts
    const updateData: {
      hourlyUsage?: number;
      hourlyWindowStart?: Date;
      hourlyCurriculumUsage?: number;
      weeklyUsage?: number;
      weeklyWindowStart?: Date;
      weeklyCurriculumUsage?: number;
    } = {};

    if (type === "curriculum") {
      updateData.hourlyCurriculumUsage = currentHourlyCurriculum + amount;
      updateData.weeklyCurriculumUsage = currentWeeklyCurriculum + amount;
    } else {
      updateData.hourlyUsage = currentHourly + amount;
      updateData.weeklyUsage = currentWeekly + amount;
    }

    if (hourlyExpired) {
      updateData.hourlyWindowStart = now;
      if (type !== "curriculum") updateData.hourlyUsage = amount;
      else updateData.hourlyCurriculumUsage = amount;
    }

    if (weeklyExpired) {
      updateData.weeklyWindowStart = now;
      if (type !== "curriculum") updateData.weeklyUsage = amount;
      else updateData.weeklyCurriculumUsage = amount;
    }

    // Optimistic lock: match all current window fields
    const result = await prisma.user.updateMany({
      where: {
        id: userId,
        hourlyUsage: user.hourlyUsage,
        hourlyWindowStart: user.hourlyWindowStart,
        hourlyCurriculumUsage: user.hourlyCurriculumUsage,
        weeklyUsage: user.weeklyUsage,
        weeklyWindowStart: user.weeklyWindowStart,
        weeklyCurriculumUsage: user.weeklyCurriculumUsage,
      },
      data: updateData,
    });

    if (result.count === 1) {
      const newHourlyUsage =
        type === "curriculum"
          ? currentHourly
          : (updateData.hourlyUsage ?? currentHourly);
      const newWeeklyUsage =
        type === "curriculum"
          ? currentWeekly
          : (updateData.weeklyUsage ?? currentWeekly);

      const hourlyWindowStart = hourlyExpired ? now : user.hourlyWindowStart;
      const weeklyWindowStart = weeklyExpired ? now : user.weeklyWindowStart;

      return {
        hourlyUsage: newHourlyUsage,
        hourlyRemaining: limits.hourly - newHourlyUsage,
        hourlyResetsAt: new Date(hourlyWindowStart.getTime() + HOUR_MS),
        weeklyUsage: newWeeklyUsage,
        weeklyRemaining: limits.weekly - newWeeklyUsage,
        weeklyResetsAt: new Date(weeklyWindowStart.getTime() + WEEK_MS),
      };
    }
  }

  throw new Error("Failed to update rate limit due to concurrent updates");
}

/**
 * Returns the current rate limit state for a user without incrementing.
 */
export async function getRateLimitState(
  userId: string,
): Promise<RateLimitState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      hourlyUsage: true,
      hourlyWindowStart: true,
      weeklyUsage: true,
      weeklyWindowStart: true,
    },
  });

  if (!user) throw new Error("User not found");

  const now = new Date();
  const limits = planLimits(user.plan);

  const hourlyExpired =
    now.getTime() - user.hourlyWindowStart.getTime() >= HOUR_MS;
  const weeklyExpired =
    now.getTime() - user.weeklyWindowStart.getTime() >= WEEK_MS;

  const currentHourly = hourlyExpired ? 0 : user.hourlyUsage;
  const currentWeekly = weeklyExpired ? 0 : user.weeklyUsage;

  return {
    hourlyUsage: currentHourly,
    hourlyRemaining: limits.hourly - currentHourly,
    hourlyResetsAt: new Date(user.hourlyWindowStart.getTime() + HOUR_MS),
    weeklyUsage: currentWeekly,
    weeklyRemaining: limits.weekly - currentWeekly,
    weeklyResetsAt: new Date(user.weeklyWindowStart.getTime() + WEEK_MS),
  };
}

export { planLimits as getPlanLimits };
