import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authGuard";
import { requestLogger } from "@/lib/logger";

const MAX_CONVERSATIONS = 200;
const MAX_PAYLOAD_BYTES = 500_000;
const MAX_PROMPT_LENGTH = 10_000;
const MAX_TITLE_LENGTH = 200;

type ConversationPayload = {
  id: string;
  title: string;
  prompt: string;
  createdAt: string;
  [key: string]: unknown;
};

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function parseDate(value: unknown): Date {
  if (typeof value !== "string") return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeConversationPayload(input: unknown): ConversationPayload | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!id || !prompt) return null;

  const titleRaw = typeof raw.title === "string" ? raw.title.trim() : "";
  const createdAtDate = parseDate(raw.createdAt);
  const createdAt = createdAtDate.toISOString();

  return {
    ...raw,
    id,
    prompt: truncate(prompt, MAX_PROMPT_LENGTH),
    title: truncate(titleRaw || prompt, MAX_TITLE_LENGTH),
    createdAt,
  };
}

function parseStoredPayload(
  payloadJson: string,
  fallback: { conversationId: string; title: string; prompt: string; createdAt: Date }
): ConversationPayload | null {
  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    return normalizeConversationPayload(parsed);
  } catch {
    return normalizeConversationPayload({
      id: fallback.conversationId,
      title: fallback.title,
      prompt: fallback.prompt,
      createdAt: fallback.createdAt.toISOString(),
    });
  }
}

export async function GET(req: NextRequest) {
  const log = requestLogger("onboarding/conversations.get");
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const records = await prisma.onboardingConversation.findMany({
      where: { userId: auth.userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_CONVERSATIONS,
    });

    const conversations = records
      .map((record) =>
        parseStoredPayload(record.payloadJson, {
          conversationId: record.conversationId,
          title: record.title,
          prompt: record.prompt,
          createdAt: record.createdAt,
        })
      )
      .filter((conversation): conversation is ConversationPayload => conversation !== null);

    return NextResponse.json({ conversations });
  } catch (error) {
    log.error("Failed to fetch conversations", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch onboarding conversations" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const log = requestLogger("onboarding/conversations.put");
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const body = (await req.json()) as { conversations?: unknown };
    if (!Array.isArray(body.conversations)) {
      return NextResponse.json(
        { error: "conversations must be an array" },
        { status: 400 }
      );
    }

    if (body.conversations.length > MAX_CONVERSATIONS) {
      return NextResponse.json(
        { error: `conversations limit is ${MAX_CONVERSATIONS}` },
        { status: 400 }
      );
    }

    const normalized = body.conversations
      .map((item) => normalizeConversationPayload(item))
      .filter((item): item is ConversationPayload => item !== null);

    if (normalized.length !== body.conversations.length) {
      return NextResponse.json(
        { error: "One or more conversations are invalid" },
        { status: 400 }
      );
    }

    const ids = normalized.map((conversation) => conversation.id);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      if (ids.length === 0) {
        await tx.onboardingConversation.deleteMany({
          where: { userId: auth.userId },
        });
      } else {
        await tx.onboardingConversation.deleteMany({
          where: {
            userId: auth.userId,
            conversationId: { notIn: ids },
          },
        });
      }

      for (const conversation of normalized) {
        const payloadJson = JSON.stringify(conversation);
        const payloadBytes = Buffer.byteLength(payloadJson, "utf8");
        if (payloadBytes > MAX_PAYLOAD_BYTES) {
          throw new Error(
            `Conversation ${conversation.id} exceeds ${MAX_PAYLOAD_BYTES} bytes`
          );
        }

        await tx.onboardingConversation.upsert({
          where: {
            userId_conversationId: {
              userId: auth.userId,
              conversationId: conversation.id,
            },
          },
          create: {
            userId: auth.userId,
            conversationId: conversation.id,
            title: conversation.title,
            prompt: conversation.prompt,
            payloadJson,
            createdAt: parseDate(conversation.createdAt),
            lastActivityAt: now,
          },
          update: {
            title: conversation.title,
            prompt: conversation.prompt,
            payloadJson,
            lastActivityAt: now,
          },
        });
      }
    });

    return NextResponse.json({ ok: true, count: normalized.length });
  } catch (error) {
    log.error("Failed to persist conversations", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to persist onboarding conversations" },
      { status: 500 }
    );
  }
}
