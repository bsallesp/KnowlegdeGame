/**
 * Adaptive difficulty algorithm.
 * Scale: 1–5
 *
 * Rules:
 * - Correct answer: difficulty may increase if recent performance is strong
 * - Wrong answer: difficulty decreases by 1 (minimum 1)
 * - We look at a rolling window of the last 5 answers for the subItem
 */

export function calculateNewDifficulty(
  currentDifficulty: number,
  recentCorrect: number,
  recentTotal: number
): number {
  if (recentTotal === 0) return currentDifficulty;

  const correctRate = recentCorrect / recentTotal;

  // If last answer was wrong (we check via the correctRate drop), reduce
  // We receive stats *after* recording the answer, so we check the rate
  if (correctRate >= 0.8 && recentTotal >= 3) {
    // Strong performance → increase difficulty
    return Math.min(5, currentDifficulty + 1);
  } else if (correctRate < 0.5) {
    // Poor performance → decrease difficulty
    return Math.max(1, currentDifficulty - 1);
  }

  return currentDifficulty;
}

export interface SM2Result {
  easeFactor: number;
  reviewInterval: number;
  nextReviewAt: Date;
}

export interface ReplayableAnswer {
  sessionId: string;
  correct: boolean;
  timeSpent: number;
  createdAt: Date | string;
}

export interface ReplayedSubItemState {
  difficulty: number;
  easeFactor: number;
  reviewInterval: number;
  nextReviewAt: Date | null;
}

export function calculateSM2(
  easeFactor: number,
  reviewInterval: number,
  correct: boolean,
  timeSpent: number,
  expectedTime: number
): SM2Result {
  let quality: number;
  if (!correct) {
    quality = timeSpent < expectedTime * 0.5 ? 1 : 2;
  } else {
    quality = timeSpent < expectedTime * 0.6 ? 5 : timeSpent < expectedTime * 1.2 ? 4 : 3;
  }

  let newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEaseFactor = Math.max(1.3, newEaseFactor);

  let newInterval: number;
  if (quality < 3) {
    newInterval = 1;
  } else if (reviewInterval === 1) {
    newInterval = 6;
  } else {
    newInterval = Math.round(reviewInterval * newEaseFactor);
  }

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + newInterval);

  return { easeFactor: newEaseFactor, reviewInterval: newInterval, nextReviewAt };
}

interface ScorableSubItem {
  id: string;
  muted: boolean;
  difficulty: number;
  nextReviewAt?: string | null;
}

type SubItemStatsMap = Record<
  string,
  { correctCount: number; totalCount: number; difficulty: number; lastSeen?: string }
>;

function scoreSubItems(subItems: ScorableSubItem[], stats: SubItemStatsMap) {
  const eligible = subItems.filter((s) => !s.muted);
  if (eligible.length === 0) return [];

  const now = Date.now();

  return eligible
    .map((sub) => {
      const stat = stats[sub.id];
      const correctRate = stat && stat.totalCount > 0 ? stat.correctCount / stat.totalCount : 0.5;
      const lastSeenMs = stat?.lastSeen ? now - new Date(stat.lastSeen).getTime() : Infinity;
      const recencyScore = Math.min(lastSeenMs / 60000, 10);
      const weaknessScore = (1 - correctRate) * 5;
      const overdueBoost =
        sub.nextReviewAt && new Date(sub.nextReviewAt).getTime() < now ? 15 : 0;
      return { id: sub.id, score: recencyScore + weaknessScore + overdueBoost };
    })
    .sort((a, b) => b.score - a.score);
}

export function selectNextSubItem(
  subItems: ScorableSubItem[],
  stats: SubItemStatsMap
): string | null {
  const scored = scoreSubItems(subItems, stats);
  if (scored.length === 0) return null;

  // Pick from top 3 randomly with weighting
  const top = scored.slice(0, Math.min(3, scored.length));
  const total = top.reduce((sum, s) => sum + s.score, 0);
  let rand = Math.random() * total;
  for (const item of top) {
    rand -= item.score;
    if (rand <= 0) return item.id;
  }
  return top[0].id;
}

// Returns up to `n` distinct subItem ids ranked by selection score (deterministic, no randomness).
// Used to prefetch/warm the shared question cache for the most likely next subItems.
export function selectTopNSubItems(
  subItems: ScorableSubItem[],
  stats: SubItemStatsMap,
  n: number,
  excludeIds: string[] = []
): string[] {
  if (n <= 0) return [];
  const exclude = new Set(excludeIds);
  return scoreSubItems(subItems, stats)
    .filter((s) => !exclude.has(s.id))
    .slice(0, n)
    .map((s) => s.id);
}

export function replaySubItemProgress(
  answers: ReplayableAnswer[],
  initialState: Partial<ReplayedSubItemState> = {}
): ReplayedSubItemState {
  const sortedAnswers = [...answers].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let difficulty = initialState.difficulty ?? 1;
  let easeFactor = initialState.easeFactor ?? 2.5;
  let reviewInterval = initialState.reviewInterval ?? 1;
  let nextReviewAt: Date | null = initialState.nextReviewAt ?? null;

  const recentBySession = new Map<string, boolean[]>();

  for (const answer of sortedAnswers) {
    const recent = recentBySession.get(answer.sessionId) ?? [];
    const nextRecent = [...recent.slice(-4), answer.correct];
    const recentCorrect = nextRecent.filter(Boolean).length;
    const recentTotal = nextRecent.length;

    difficulty = calculateNewDifficulty(difficulty, recentCorrect, recentTotal);

    const sm2 = calculateSM2(easeFactor, reviewInterval, answer.correct, answer.timeSpent, 15000);
    easeFactor = sm2.easeFactor;
    reviewInterval = sm2.reviewInterval;
    nextReviewAt = sm2.nextReviewAt;

    recentBySession.set(answer.sessionId, nextRecent);
  }

  return {
    difficulty,
    easeFactor,
    reviewInterval,
    nextReviewAt,
  };
}
