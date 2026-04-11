import { describe, expect, test } from "vitest";
import { estimateBuilderRequest } from "@/lib/costEngine";
import {
  buildBuilderVerification,
  formatVerificationWarnings,
  normalizeBuilderPayload,
} from "@/lib/builderValidation";

describe("builderValidation", () => {
  test("passes a plausible monolith architecture with strong confidence", () => {
    const normalized = normalizeBuilderPayload({
      requestUnderstanding: "Build a CRUD SaaS MVP.",
      assumptions: ["Single tenant for MVP"],
      recommendedScope: "Ship the core web app first.",
      architecture: {
        classification: "monolith",
        summary: "A single Next.js app backed by PostgreSQL keeps the MVP simple.",
        principles: ["Keep ops light", "Prefer mainstream components"],
        resources: [
          {
            id: "web-app",
            name: "Web App",
            category: "compute",
            technology: "Next.js 15 on Vercel",
            purpose: "Serve the product UI and API routes",
            tier: "essential",
            scalingStrategy: "Scale horizontally through the hosting platform",
            estimatedMonthlyCostUsd: { min: 20, max: 40 },
            notes: "Single production deployment",
          },
          {
            id: "primary-db",
            name: "Primary Database",
            category: "database",
            technology: "PostgreSQL 16 on AWS RDS",
            purpose: "Store application data",
            tier: "essential",
            scalingStrategy: "Start small and vertically scale, then add read replicas if needed",
            estimatedMonthlyCostUsd: { min: 25, max: 60 },
            notes: "Automated backups enabled",
          },
          {
            id: "app-monitoring",
            name: "Monitoring",
            category: "monitoring",
            technology: "Datadog APM",
            purpose: "Capture errors and performance metrics",
            tier: "recommended",
            scalingStrategy: "Usage-based",
            estimatedMonthlyCostUsd: { min: 10, max: 20 },
            notes: "Alerting on API latency and DB saturation",
          },
        ],
        dataFlows: [
          {
            from: "browser",
            to: "web-app",
            protocol: "HTTPS",
            description: "Users load the application and send CRUD actions",
            dataType: "JSON",
            async: false,
          },
          {
            from: "web-app",
            to: "primary-db",
            protocol: "PostgreSQL",
            description: "The application persists domain data",
            dataType: "SQL",
            async: false,
          },
        ],
        environments: [
          {
            name: "production",
            purpose: "Live traffic",
            resources: ["web-app", "primary-db", "app-monitoring"],
            estimatedMonthlyCostUsd: { min: 55, max: 120 },
          },
        ],
        securityBoundaries: [],
        failureModes: [
          {
            component: "primary-db",
            failureScenario: "The primary instance becomes unavailable.",
            impact: "Writes are delayed until failover completes.",
            mitigationStrategy: "Restore from automated backups or fail over to a standby.",
            rto: "1 hour",
            rpo: "15 minutes",
          },
        ],
        costBreakdown: [],
        totalEstimatedMonthlyCostUsd: { min: 55, max: 120 },
        scalingNotes: "Scale the app tier first and add DB replicas as read load increases.",
        tradeoffs: ["Simpler operations over fine-grained service isolation"],
      },
      developmentPlan: [
        {
          phase: 1,
          name: "Foundation",
          deliverables: ["Auth", "CRUD flows", "Deployable monolith"],
          estimatedWeeks: 4,
          dependencies: [],
        },
        {
          phase: 2,
          name: "Hardening",
          deliverables: ["Monitoring", "Backups", "Admin reports"],
          estimatedWeeks: 4,
          dependencies: ["Foundation"],
        },
      ],
      devopsPlan: ["Enable monitoring and backups"],
      businessNotes: [],
      competitiveAssessment: "",
      warnings: [],
      nextSteps: ["Implement the MVP"],
    });

    const verification = buildBuilderVerification({
      prompt: "Build a CRUD SaaS MVP with auth, dashboards, billing, admin tools, customer onboarding, and reporting.",
      estimate: estimateBuilderRequest(
        "Build a CRUD SaaS MVP with auth, dashboards, billing, admin tools, customer onboarding, and reporting.",
      ),
      payload: normalized.payload,
      schemaFindings: normalized.findings,
    });

    expect(verification.status).toBe("passed");
    expect(verification.confidence).toBe("high");
    expect(verification.findings).toHaveLength(0);
  });

  test("flags incompatible stack and unrealistic delivery assumptions", () => {
    const normalized = normalizeBuilderPayload({
      requestUnderstanding: "Build a realtime event platform.",
      assumptions: [],
      recommendedScope: "Ship everything at once.",
      architecture: {
        classification: "serverless",
        summary: "A serverless Next.js app handles realtime collaboration directly.",
        principles: ["Move fast"],
        resources: [
          {
            id: "web-app",
            name: "Web App",
            category: "compute",
            technology: "Next.js 15 on Vercel Functions with Prisma",
            purpose: "Serve UI and realtime APIs",
            tier: "essential",
            scalingStrategy: "Serverless auto-scaling",
            estimatedMonthlyCostUsd: { min: 1, max: 3 },
            notes: "Native WebSocket handling in the same deployment",
          },
          {
            id: "primary-db",
            name: "Primary Data Store",
            category: "database",
            technology: "Amazon DynamoDB",
            purpose: "Store app state",
            tier: "essential",
            scalingStrategy: "On-demand",
            estimatedMonthlyCostUsd: { min: 1, max: 2 },
            notes: "",
          },
        ],
        dataFlows: [
          {
            from: "browser",
            to: "web-app",
            protocol: "WebSocket",
            description: "Realtime updates",
            dataType: "JSON",
            async: false,
          },
        ],
        environments: [
          {
            name: "production",
            purpose: "Live traffic",
            resources: ["web-app", "primary-db"],
            estimatedMonthlyCostUsd: { min: 1, max: 4 },
          },
        ],
        securityBoundaries: [],
        failureModes: [],
        costBreakdown: [],
        totalEstimatedMonthlyCostUsd: { min: 1, max: 4 },
        scalingNotes: "This globally scales out of the box.",
        tradeoffs: [],
      },
      developmentPlan: [
        {
          phase: 1,
          name: "Full build",
          deliverables: ["Realtime app", "Global scale", "Launch"],
          estimatedWeeks: 1,
          dependencies: [],
        },
      ],
      devopsPlan: [],
      businessNotes: [],
      competitiveAssessment: "",
      warnings: [],
      nextSteps: [],
    });

    const verification = buildBuilderVerification({
      prompt: "Build a realtime event platform with global scale, collaboration feeds, customer dashboards, and launch support.",
      estimate: estimateBuilderRequest(
        "Build a realtime event platform with global scale, collaboration feeds, customer dashboards, and launch support.",
      ),
      payload: normalized.payload,
      schemaFindings: normalized.findings,
    });

    expect(verification.status).toBe("failed");
    expect(verification.confidence).toBe("low");
    expect(verification.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "prisma_dynamodb_incompatibility",
        "serverless_websocket_mismatch",
        "cost_benchmark_outlier_low",
        "timeline_benchmark_outlier_low",
      ]),
    );
  });

  test("formats verification warnings with their source", () => {
    const warnings = formatVerificationWarnings({
      status: "passed_with_warnings",
      confidence: "medium",
      findings: [
        {
          code: "cost_benchmark_outlier_low",
          severity: "warning",
          source: "rule",
          message: "Estimated monthly cost looks too low.",
        },
        {
          code: "audit_missing_component_1",
          severity: "critical",
          source: "audit",
          message: "The architecture is missing a durable queue.",
        },
      ],
      metrics: {
        totalChecks: 10,
        flaggedChecks: 2,
        criticalFindings: 1,
        warningFindings: 1,
        auditFindings: 1,
      },
    });

    expect(warnings).toEqual([
      "Architecture validation (warning): Estimated monthly cost looks too low.",
      "Audit (critical): The architecture is missing a durable queue.",
    ]);
  });
});
