// Idempotent seed for Health Informatics professional formation track.
// Mirrors seed-ged.mjs pattern — runs on every container boot from startup.sh.
// Creates the full HIT topic tree in English with a professional case-study teaching profile.

import pg from "pg";

const { Client } = pg;

const ANON_USER_ID = "anon-default-user";
const HIT_TOPIC_ID = "topic-health-informatics-career-roadmap";
const HIT_SLUG = "health-informatics-career-roadmap";

const hitTeachingProfile = {
  style: "competency_based",
  register: "clear_concise_instructional",
  questionPatterns: [
    "A lab result interface sends an OBX segment with an unexpected code. What is your first validation step?",
    "A clinic wants to expose patient allergies in an API. Which FHIR resource and mapping rule should be used?",
    "Two systems store diagnosis labels differently. Which terminology mapping strategy keeps reporting consistent?",
    "An analyst must build a readmission dashboard from EHR data. Which SQL joins and quality checks are essential first?",
    "A security review finds broad chart access. Which minimum-necessary HIPAA control should be implemented now?",
    "A new team member must choose a platform path. Which skills belong to Epic workflow analysis versus Cerner workflow analysis?",
  ],
  contextHint:
    "Prioritize role-ready HIT skills: clinical workflow understanding, interoperability, terminology integrity, EHR operations, analytics, compliance, and practical implementation decisions.",
  exampleDomain:
    "Epic and Cerner workflows, HL7 v2, FHIR R4, ICD-10/SNOMED/LOINC/CPT coding, SQL and Python analytics, data quality, HIPAA controls, and healthcare KPI reporting.",
  assessmentFocus: "mastery_progression_and_application",
};

const hitItems = [
  {
    name: "Clinical Foundations for Informatics",
    subItems: [
      { name: "Clinical Documentation Lifecycle", difficulty: 1 },
      { name: "Care Settings, Workflows, and Stakeholders", difficulty: 1 },
      { name: "Patient Safety and Data Accuracy Principles", difficulty: 2 },
      { name: "Core Medical Terminology for HIT Analysts", difficulty: 2 },
    ],
  },
  {
    name: "Interoperability and Terminology",
    subItems: [
      { name: "HL7 v2 Message Structure and Common Segments", difficulty: 2 },
      { name: "FHIR Resources and REST Patterns", difficulty: 3 },
      { name: "Terminology Systems: ICD-10, SNOMED CT, LOINC, CPT", difficulty: 3 },
      { name: "Crosswalks, Value Sets, and Mapping Quality", difficulty: 3 },
    ],
  },
  {
    name: "EHR Platforms and Workflow Operations",
    subItems: [
      { name: "Epic Workflow Fundamentals and Build Concepts", difficulty: 3 },
      { name: "Cerner/Oracle Health Workflow Fundamentals", difficulty: 3 },
      { name: "Orders, Results, Medication, and Billing Flows", difficulty: 3 },
      { name: "Change Requests, UAT, and Go-Live Support", difficulty: 3 },
    ],
  },
  {
    name: "Healthcare Analytics and Reporting",
    subItems: [
      { name: "SQL for Clinical and Operational Queries", difficulty: 2 },
      { name: "Data Quality Checks and Reconciliation", difficulty: 3 },
      { name: "Healthcare KPI Design and Interpretation", difficulty: 3 },
      { name: "Dashboards for Clinical and Executive Audiences", difficulty: 2 },
    ],
  },
  {
    name: "Privacy, Security, and Governance",
    subItems: [
      { name: "HIPAA Privacy and Security Essentials", difficulty: 2 },
      { name: "Role-Based Access and Audit Trails", difficulty: 3 },
      { name: "Data Stewardship and Change Governance", difficulty: 3 },
      { name: "Incident Response and Risk Mitigation Basics", difficulty: 4 },
    ],
  },
  {
    name: "HIT Professional Practice and Career Execution",
    subItems: [
      { name: "Capstone: HL7/FHIR + EHR + KPI Implementation Scenario", difficulty: 4 },
      { name: "Documentation and Stakeholder Communication", difficulty: 2 },
      { name: "Certification Strategy: RHIT/RHIA/CHDA/CPHIMS", difficulty: 2 },
      { name: "Portfolio and Interview Readiness for HIT Roles", difficulty: 2 },
    ],
  },
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes(".postgres.database.azure.com")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await client.connect();

  try {
    // Ensure anon user exists (shared with seed-ged)
    await client.query(
      `
        INSERT INTO "User" ("id", "email", "emailVerified", "role", "status", "isInternal", "plan")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT ("id")
        DO UPDATE SET
          "status" = EXCLUDED."status",
          "plan"   = EXCLUDED."plan",
          "isInternal" = EXCLUDED."isInternal"
      `,
      [ANON_USER_ID, "anon@dystoppia.local", true, "customer", "active", true, "master"]
    );
    console.log("[seed-hit] anon user ok");

    const existing = await client.query(
      `SELECT "id" FROM "Topic" WHERE "slug" = $1 LIMIT 1`,
      [HIT_SLUG]
    );

    await client.query("BEGIN");

    if (existing.rowCount > 0) {
      // Reconcile in place: remove previous topic tree content, then reinsert canonical track.
      await client.query(
        `
          DELETE FROM "UserAnswer"
          WHERE "subItemId" IN (
            SELECT s."id"
            FROM "SubItem" s
            JOIN "Item" i ON i."id" = s."itemId"
            WHERE i."topicId" = $1
          )
        `,
        [existing.rows[0].id]
      );
      await client.query(
        `
          DELETE FROM "Question"
          WHERE "subItemId" IN (
            SELECT s."id"
            FROM "SubItem" s
            JOIN "Item" i ON i."id" = s."itemId"
            WHERE i."topicId" = $1
          )
        `,
        [existing.rows[0].id]
      );
      await client.query(
        `
          DELETE FROM "SubItem"
          WHERE "itemId" IN (
            SELECT "id" FROM "Item" WHERE "topicId" = $1
          )
        `,
        [existing.rows[0].id]
      );
      await client.query(`DELETE FROM "Item" WHERE "topicId" = $1`, [existing.rows[0].id]);
      await client.query(
        `UPDATE "Topic" SET "name" = $2, "teachingProfile" = $3 WHERE "id" = $1`,
        [existing.rows[0].id, "Health Informatics Professional Formation Track", JSON.stringify(hitTeachingProfile)]
      );
    } else {
      await client.query(
        `INSERT INTO "Topic" ("id", "name", "slug", "teachingProfile")
         VALUES ($1, $2, $3, $4)`,
        [
          HIT_TOPIC_ID,
          "Health Informatics Professional Formation Track",
          HIT_SLUG,
          JSON.stringify(hitTeachingProfile),
        ]
      );
    }
    const resolvedTopicId = existing.rowCount > 0 ? existing.rows[0].id : HIT_TOPIC_ID;

    let totalSubItems = 0;

    for (const [itemIndex, item] of hitItems.entries()) {
      const itemId = `item-hit-${slugify(item.name)}`;
      await client.query(
        `INSERT INTO "Item" ("id", "topicId", "name", "order", "muted")
         VALUES ($1, $2, $3, $4, $5)`,
        [itemId, resolvedTopicId, item.name, itemIndex, false]
      );

      for (const [subIndex, sub] of item.subItems.entries()) {
        const subItemId = `subitem-hit-${slugify(item.name)}-${String(subIndex + 1).padStart(2, "0")}`;
        await client.query(
          `INSERT INTO "SubItem" ("id", "itemId", "name", "order", "muted", "difficulty", "easeFactor", "reviewInterval")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [subItemId, itemId, sub.name, subIndex, false, sub.difficulty, 2.5, 1]
        );
        totalSubItems++;
      }
    }

    await client.query("COMMIT");
    console.log(
      `[seed-hit] HIT topic created — ${hitItems.length} items, ${totalSubItems} sub-items`
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("[seed-hit] FAILED:", e);
  process.exit(0); // don't fail startup — app can still run
});
