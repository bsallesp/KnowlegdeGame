export type LearningStageKey = "recognize" | "explain" | "apply" | "compare" | "transfer";

export interface LearningStage {
  key: LearningStageKey;
  label: string;
  learnerGoal: string;
  promptFocus: string;
  primerGuidance: string;
  correctCoaching: string;
  incorrectCoaching: string;
  nextStepLabel: string;
}

const STAGES: Record<LearningStageKey, LearningStage> = {
  recognize: {
    key: "recognize",
    label: "Recognize",
    learnerGoal: "spot the core signal or definition without extra noise",
    promptFocus: "Use plain wording, basic recall, simple definitions, and short cue-recognition questions. Avoid layered scenarios unless the concept cannot be asked without one.",
    primerGuidance: "Write 3-5 sentences in plain language. Name the cue the learner should notice, give one simple worked example, mention the most common confusion, and end with a one-line heuristic.",
    correctCoaching: "You recognized the core cue. Keep locking in the wording that tells you what rule to use.",
    incorrectCoaching: "Slow down and look for the signal word or definition first. The next question should simplify the wording and contrast the common confusion.",
    nextStepLabel: "Next: explain the rule in your own words.",
  },
  explain: {
    key: "explain",
    label: "Explain",
    learnerGoal: "understand the rule well enough to explain why it works",
    promptFocus: "Keep the language direct. Ask for meaning, why a rule applies, or what distinguishes one concept from another before moving into longer scenarios.",
    primerGuidance: "Write 2-4 sentences. Name the rule in simple terms, give a compact example, and explain how to tell it apart from the closest confusion.",
    correctCoaching: "You understood why the rule fits. That is the bridge from recall into real understanding.",
    incorrectCoaching: "Focus on the difference between the rule and the tempting alternative. The next step should reinforce the contrast, not add more scenario detail.",
    nextStepLabel: "Next: apply the rule in one short scenario.",
  },
  apply: {
    key: "apply",
    label: "Apply",
    learnerGoal: "use the rule in a short practical scenario",
    promptFocus: "Use one compact scenario with one decision point. Test application of a known rule, not broad synthesis.",
    primerGuidance: "Write 2-3 sentences. Briefly restate the rule, then show a mini-example with different surface details from the question.",
    correctCoaching: "You applied the rule in context. The next step is to get faster and more consistent.",
    incorrectCoaching: "You likely know the rule but missed when to apply it. The next question should keep the same concept with a shorter scenario.",
    nextStepLabel: "Next: compare close cases and edge cues.",
  },
  compare: {
    key: "compare",
    label: "Compare",
    learnerGoal: "separate similar concepts and notice meaningful differences",
    promptFocus: "Use comparison, tradeoff, or exception questions. Keep the scenario concise and emphasize the discriminating detail.",
    primerGuidance: "Write 2-3 sentences. Name the deciding difference and give a compact comparison example without solving the actual question.",
    correctCoaching: "You separated similar options correctly. That is where deeper confidence starts to show.",
    incorrectCoaching: "The miss is probably in the differentiator, not the big idea. The next question should spotlight the deciding contrast.",
    nextStepLabel: "Next: transfer the concept to harder cases.",
  },
  transfer: {
    key: "transfer",
    label: "Transfer",
    learnerGoal: "transfer the concept to harder, less obvious situations",
    promptFocus: "Use nuanced application, edge cases, or synthesis. Assume the learner already owns the basics.",
    primerGuidance: "Write 1-2 sentences. State the abstract principle or edge case and let the learner do the transfer.",
    correctCoaching: "You transferred the concept beyond the obvious case. That is strong mastery behavior.",
    incorrectCoaching: "The concept is close, but the harder transfer broke down. The next question should narrow back to the critical differentiator.",
    nextStepLabel: "Next: reinforce with another non-obvious case.",
  },
};

export function getLearningStage(difficulty: number, correctRate?: number): LearningStage {
  const rate = typeof correctRate === "number" ? correctRate : null;

  if (difficulty <= 1 || (rate !== null && rate < 55)) {
    return STAGES.recognize;
  }
  if (difficulty <= 2 || (rate !== null && rate < 70)) {
    return STAGES.explain;
  }
  if (difficulty === 3) {
    return STAGES.apply;
  }
  if (difficulty === 4) {
    return STAGES.compare;
  }
  return STAGES.transfer;
}

export function getDifficultyDescription(difficulty: number): string {
  const stage = getLearningStage(difficulty);

  switch (stage.key) {
    case "recognize":
      return "recognition, simple definitions, core cues";
    case "explain":
      return "understanding concepts, explaining why";
    case "apply":
      return "short practical application";
    case "compare":
      return "analysis, comparison, nuanced understanding";
    case "transfer":
      return "synthesis, edge cases, expert transfer";
  }
}
