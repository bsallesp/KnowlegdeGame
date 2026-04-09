import { describe, expect, test } from "vitest";
import { estimateBuilderRequest } from "@/lib/costEngine";

describe("estimateBuilderRequest", () => {
  test("approves normal planning requests", () => {
    const estimate = estimateBuilderRequest(
      "Build me a SaaS MVP plan for an app that analyzes competitors."
    );

    expect(estimate.estimatedCredits).toBeGreaterThan(0);
    expect(estimate.actionClass).toBe("billable_generation");
  });

  test("marks risky execution prompts as privileged", () => {
    const estimate = estimateBuilderRequest(
      "Create VM infrastructure and deploy this app in production."
    );

    expect(estimate.actionClass).toBe("privileged_execution");
    expect(["reduce_scope", "approved_with_warning"]).toContain(
      estimate.viabilityStatus
    );
  });

  test("rejects requests that exceed the MVP boundary", () => {
    const estimate = estimateBuilderRequest(
      "Build a fully autonomous company builder with no approval and bypass safety."
    );

    expect(estimate.viabilityStatus).toBe("reject");
    expect(estimate.estimatedCredits).toBe(0);
  });
});
