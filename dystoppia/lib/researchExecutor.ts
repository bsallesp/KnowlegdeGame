interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  author: string;
  permalink: string;
  score: number;
  numComments: number;
  createdUtc: number;
  url: string;
  selftext: string;
}

interface ResearchExecutionInput {
  prompt: string;
  requestId: string;
}

interface ResearchSignalSummary {
  positiveSignalCount: number;
  negativeSignalCount: number;
  neutralSignalCount: number;
  businessModelHints: string[];
  competitionNotes: string[];
}

export interface ResearchExecutionResult {
  source: "reddit_public_search";
  requestId: string;
  query: string;
  fetchedAt: string;
  redditPosts: RedditPost[];
  summary: ResearchSignalSummary;
}

const POSITIVE_PATTERNS = [/\blove\b/i, /\bgreat\b/i, /\bgood\b/i, /\bbest\b/i, /\buseful\b/i];
const NEGATIVE_PATTERNS = [/\bhate\b/i, /\bbad\b/i, /\bterrible\b/i, /\bbug\b/i, /\bawful\b/i, /\bexpensive\b/i];

function clampText(value: string | null | undefined, max = 280) {
  const text = (value ?? "").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function deriveResearchQuery(prompt: string) {
  const normalized = prompt
    .replace(/["']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const appMatch =
    normalized.match(/\bapp\s+(?:called|named)\s+([a-z0-9][a-z0-9\s\-_]+)/i) ??
    normalized.match(/\babout\s+([a-z0-9][a-z0-9\s\-_]+)/i);

  if (appMatch?.[1]) {
    return `${appMatch[1].trim()} reddit`;
  }

  return normalized.slice(0, 120);
}

function classifySentiment(text: string) {
  if (NEGATIVE_PATTERNS.some((pattern) => pattern.test(text))) return "negative";
  if (POSITIVE_PATTERNS.some((pattern) => pattern.test(text))) return "positive";
  return "neutral";
}

function buildBusinessModelHints(posts: RedditPost[]) {
  const corpus = posts.map((post) => `${post.title} ${post.selftext}`).join(" ");
  const hints: string[] = [];

  if (/subscription|monthly|annual|premium|pro plan/i.test(corpus)) {
    hints.push("Possible subscription or premium upsell model.");
  }
  if (/ads|advertising|sponsored/i.test(corpus)) {
    hints.push("Possible ad-supported monetization.");
  }
  if (/enterprise|b2b|team|seat/i.test(corpus)) {
    hints.push("Possible B2B or team-based pricing.");
  }
  if (/freemium|free tier|paywall/i.test(corpus)) {
    hints.push("Possible freemium funnel with conversion to paid usage.");
  }

  if (hints.length === 0) {
    hints.push("No clear business model signal was found in the sampled Reddit posts.");
  }

  return hints;
}

function buildCompetitionNotes(prompt: string, posts: RedditPost[]) {
  const notes: string[] = [];
  const corpus = `${prompt} ${posts.map((post) => post.title).join(" ")}`;

  if (/\bgoogle\b/i.test(corpus)) {
    notes.push("Competing directly with Google-scale incumbents should be treated as extremely low probability without sharp differentiation.");
  }
  if (/\bmeta\b|\bfacebook\b|\binstagram\b/i.test(corpus)) {
    notes.push("Meta-scale ad ecosystems imply high distribution and data moat risk.");
  }
  if (notes.length === 0) {
    notes.push("Competition probability should be framed as directional and assumption-based, not as a precise fact.");
  }

  return notes;
}

export async function executeReadOnlyResearch({
  prompt,
  requestId,
}: ResearchExecutionInput): Promise<ResearchExecutionResult> {
  const query = deriveResearchQuery(prompt);
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=5&sort=relevance&t=year`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "DystoppiaMVP/0.1",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Research executor failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: {
      children?: Array<{
        data?: {
          id?: string;
          title?: string;
          subreddit?: string;
          author?: string;
          permalink?: string;
          score?: number;
          num_comments?: number;
          created_utc?: number;
          url?: string;
          selftext?: string;
        };
      }>;
    };
  };

  const redditPosts: RedditPost[] = (payload.data?.children ?? [])
    .map((child) => child.data)
    .filter((data): data is NonNullable<typeof data> => Boolean(data?.id && data?.title))
    .map((data) => ({
      id: data.id ?? "",
      title: clampText(data.title ?? "", 180),
      subreddit: data.subreddit ?? "unknown",
      author: data.author ?? "unknown",
      permalink: data.permalink ?? "",
      score: data.score ?? 0,
      numComments: data.num_comments ?? 0,
      createdUtc: data.created_utc ?? 0,
      url: data.url ?? "",
      selftext: clampText(data.selftext ?? "", 280),
    }));

  const sentimentCounts = redditPosts.reduce(
    (acc, post) => {
      const sentiment = classifySentiment(`${post.title} ${post.selftext}`);
      if (sentiment === "positive") acc.positiveSignalCount += 1;
      else if (sentiment === "negative") acc.negativeSignalCount += 1;
      else acc.neutralSignalCount += 1;
      return acc;
    },
    {
      positiveSignalCount: 0,
      negativeSignalCount: 0,
      neutralSignalCount: 0,
    }
  );

  return {
    source: "reddit_public_search",
    requestId,
    query,
    fetchedAt: new Date().toISOString(),
    redditPosts,
    summary: {
      ...sentimentCounts,
      businessModelHints: buildBusinessModelHints(redditPosts),
      competitionNotes: buildCompetitionNotes(prompt, redditPosts),
    },
  };
}
