import { describe, expect, test } from "vitest";
import { evaluateExecutionPolicy } from "@/lib/executionPolicy";

describe("evaluateExecutionPolicy", () => {
  test("allows read-only research requests for the first executor", () => {
    const policy = evaluateExecutionPolicy({
      prompt: "Scan an app and collect Reddit sentiment and competitor opinions.",
      actionClass: "analysis_only",
      role: "master",
    });

    expect(policy.policyStatus).toBe("allowed");
    expect(policy.executorType).toBe("external_research_executor");
    expect(policy.target).toBe("research_read_only");
  });

  test("blocks infrastructure mutation in the MVP", () => {
    const policy = evaluateExecutionPolicy({
      prompt: "Create a VM and provision a production database.",
      actionClass: "privileged_execution",
      role: "master",
    });

    expect(policy.policyStatus).toBe("blocked");
    expect(policy.allowedInMvp).toBe(false);
    expect(policy.target).toBe("infrastructure_mutation");
  });

  test("keeps ordinary builder generation in manual planning mode", () => {
    const policy = evaluateExecutionPolicy({
      prompt: "Create an implementation backlog for a SaaS MVP.",
      actionClass: "billable_generation",
      role: "master",
    });

    expect(policy.policyStatus).toBe("manual_only");
    expect(policy.executorType).toBe("none");
  });
});
