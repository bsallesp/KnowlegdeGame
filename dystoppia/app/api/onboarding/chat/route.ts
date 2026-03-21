import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authGuard";
import type { OnboardingMessage, OnboardingEntry } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const { topic, messages, pillar } = await req.json() as {
    topic: string;
    messages: OnboardingMessage[];
    pillar: string;
  };

  if (!topic) {
    return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  }

  // Fetch existing user profile to avoid redundant questions
  const profile = await prisma.userProfile.findUnique({
    where: { userId: auth.userId },
  });

  const profileData = profile
    ? {
        goals: profile.goals ? JSON.parse(profile.goals) : [],
        knowledgeLevels: profile.knowledgeLevels ? JSON.parse(profile.knowledgeLevels) : {},
        timePerSession: profile.timePerSession,
        preferredLang: profile.preferredLang,
      }
    : null;

  const prompt = buildPrompt(topic, messages, profileData, pillar ?? "studio");

  let text = "";
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    text = response.content[0].type === "text" ? response.content[0].text : "";
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }

  // Extract JSON from response (strip any accidental markdown fences)
  let parsed: Record<string, unknown>;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? text);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }

  // If ready to create, persist onboarding entry to user profile
  if (parsed.readyToCreate && parsed.onboardingContext) {
    await saveOnboardingEntry(auth.userId, topic, parsed.onboardingContext as string);
  }

  return NextResponse.json(parsed);
}

async function saveOnboardingEntry(userId: string, topic: string, context: string) {
  const entry: OnboardingEntry = { topic, context, createdAt: new Date().toISOString() };

  const existing = await prisma.userProfile.findUnique({ where: { userId } });
  const rawHistory: OnboardingEntry[] = existing?.rawHistory
    ? JSON.parse(existing.rawHistory)
    : [];

  rawHistory.push(entry);
  // Keep last 30 entries
  const trimmed = rawHistory.slice(-30);

  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, rawHistory: JSON.stringify(trimmed) },
    update: { rawHistory: JSON.stringify(trimmed) },
  });
}

function buildPrompt(
  topic: string,
  messages: OnboardingMessage[],
  profile: Record<string, unknown> | null,
  pillar: string
): string {
  const conversationHistory =
    messages.length > 0
      ? messages
          .map(
            (m) =>
              `${m.role}: ${m.content}${m.selectedCards?.length ? ` [cards: ${m.selectedCards.join(", ")}]` : ""}`
          )
          .join("\n")
      : "Sem histórico ainda — esta é a primeira mensagem.";

  const profileContext = profile
    ? `Perfil existente do usuário: ${JSON.stringify(profile)}`
    : "Nenhum perfil existente para este usuário.";

  return `Você é um consultor de aprendizado inteligente no app Dystoppia. Conduza um onboarding dinâmico para personalizar o aprendizado do usuário.

Tema solicitado: "${topic}"
Pilar: ${pillar}

${profileContext}

Conversa até agora:
${conversationHistory}

Sua tarefa:
- Faça UMA pergunta focada e amigável por vez
- Gere 3-5 opções de cards ESPECÍFICAS para "${topic}" (não genéricas)
- Após 2-4 turnos (ou antes se o contexto já estiver claro), declare readyToCreate=true
- Responda SEMPRE no mesmo idioma do usuário (detecte nas respostas livres; padrão: português brasileiro)
- Pule perguntas sobre coisas que você já sabe pelo perfil ou conversa
- Se as respostas indicam nível avançado, adapte o vocabulário e profundidade

Prioridade das informações a coletar:
1. Nível de conhecimento / background com "${topic}" e áreas relacionadas
2. Objetivo principal (certificação? trabalho? curiosidade? caso de uso específico?)
3. Tempo disponível por sessão
4. (Opcional) Estilo de aprendizado preferido

Retorne SOMENTE um objeto JSON válido (sem markdown, sem explicação, sem blocos de código):

Se precisar de mais informações:
{"readyToCreate":false,"turn":{"question":"Pergunta clara e amigável","subtitle":"Uma linha explicando por que você está perguntando","multiSelect":false,"cards":[{"id":"id_unico","label":"Rótulo curto","description":"Descrição opcional de uma linha","icon":"emoji"}],"allowFreeText":true,"freeTextPlaceholder":"Ou descreva com suas palavras..."},"summary":{"topic":"${topic}"}}

Se tiver contexto suficiente (após 2+ turnos, ou se nível+objetivo já estão claros):
{"readyToCreate":true,"turn":null,"summary":{"topic":"${topic}"},"onboardingContext":"Descrição completa em prosa do perfil do usuário para '${topic}': nível atual, objetivo específico, tempo disponível, estilo preferido e qualquer foco especial. Este texto guiará diretamente o design do currículo e a geração de perguntas."}`;
}
