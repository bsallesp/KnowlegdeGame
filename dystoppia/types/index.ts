export interface TeachingProfile {
  style: string;           // e.g. "scenario_based", "practical_procedural", "conceptual_narrative"
  register: string;        // e.g. "technical", "instructional", "conversational"
  questionPatterns: string[]; // sentence starters / templates for question generation
  contextHint: string;     // how to frame questions for this domain
  exampleDomain: string;   // concrete setting to draw examples from
  assessmentFocus: string; // what cognitive skill to test: recall, application, analysis, synthesis
}

export interface Topic {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  teachingProfile?: TeachingProfile | null;
  items: Item[];
}

export interface Item {
  id: string;
  topicId: string;
  name: string;
  order: number;
  muted: boolean;
  subItems: SubItem[];
}

export interface SubItem {
  id: string;
  itemId: string;
  name: string;
  order: number;
  muted: boolean;
  difficulty: number;
}

export interface Question {
  id: string;
  subItemId: string;
  type: "multiple_choice" | "single_choice" | "fill_blank" | "true_false";
  content: string;
  options?: string[] | null;
  answer: string;
  explanation: string;
  difficulty: number;
  timeLimit?: number | null;
  createdAt: string;
  subItem?: SubItem;
}

export interface UserAnswer {
  id: string;
  questionId: string;
  subItemId: string;
  sessionId: string;
  correct: boolean;
  timeSpent: number;
  createdAt: string;
}

export interface SubItemStats {
  correctCount: number;
  totalCount: number;
  difficulty: number;
  lastSeen?: string;
}

export interface Settings {
  queueDepth: number;
  refillTrigger: number;
}

export type QuestionType = "multiple_choice" | "single_choice" | "fill_blank" | "true_false";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
}

export interface DailyGoal {
  target: number;
  progress: number;
  date: string;
}

export interface SessionHistoryEntry {
  date: string;
  correctCount: number;
  totalCount: number;
  xpEarned: number;
  topicId: string;
}

// Onboarding types

export interface OnboardingCard {
  id: string;
  label: string;
  description?: string;
  icon?: string;
}

export interface OnboardingTurn {
  question: string;
  subtitle?: string;
  multiSelect: boolean;
  cards: OnboardingCard[];
  allowFreeText: boolean;
  freeTextPlaceholder?: string;
}

export interface OnboardingMessage {
  role: "assistant" | "user";
  content: string;
  selectedCards?: string[];
}

export interface OnboardingSummary {
  topic: string;
  [key: string]: string | undefined;
}

export interface OnboardingChatResponse {
  turn: OnboardingTurn | null;
  summary: OnboardingSummary;
  readyToCreate: boolean;
  onboardingContext?: string;
}

export interface OnboardingEntry {
  topic: string;
  context: string;
  createdAt: string;
}

export interface UserProfile {
  goals: string[];
  knowledgeLevels: Record<string, string>;
  timePerSession?: string;
  preferredLang: string;
  rawHistory?: OnboardingEntry[];
}
