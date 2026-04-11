// Minimal, idempotent seed used in GED deployment.
// Creates: anonymous default user + GED Mathematical Reasoning topic tree.
// Runs on every container boot from startup.sh - safe to re-run.

import pg from "pg";

const { Client } = pg;

const ANON_USER_ID = "anon-default-user";
const GED_TOPIC_ID = "topic-ged-mathematical-reasoning";
const GED_SLUG = "ged-mathematical-reasoning";

const gedTeachingProfile = {
  style: "scenario_based",
  register: "instructional_practical",
  questionPatterns: [
    "A shopper buys X items for $Y each with a Z% discount - how much do they pay?",
    "A rectangular garden measures A feet by B feet - what is its area/perimeter?",
    "If f(x) = ..., what is f(n)?",
    "Solve for x: 2x + 5 = 17",
    "The bar chart shows ... - which category has the highest/lowest value?",
    "A recipe calls for 2/3 cup of flour - how much is needed to double/halve the recipe?",
    "If a car travels X miles in Y hours, what is its average speed?",
    "What percent of A is B?",
    "A savings account earns simple interest - compute the balance after N years.",
    "Which equation represents the line shown on the graph?",
  ],
  contextHint:
    "Frame every question as a real-world word problem typical of the GED Mathematical Reasoning test: shopping, budgeting, recipes, travel, home improvement, work schedules, simple finance, or interpreting charts. Keep numbers realistic and calculator-friendly. Prioritize applied problem solving over abstract symbol manipulation.",
  exampleDomain:
    "Everyday GED-style scenarios: groceries, wages, discounts, distances, basic geometry, bar/line/pie charts, and simple algebraic equations.",
  assessmentFocus: "application",
};

const gedItems = [
  {
    name: "Basic Arithmetic",
    subItems: [
      "Order of operations (PEMDAS)",
      "Fractions and mixed numbers",
      "Decimals and rounding",
      "Percentages and percent change",
      "Ratios and proportions",
    ],
  },
  {
    name: "Quantitative Problem Solving",
    subItems: [
      "Real-world word problems",
      "Unit conversions and rates",
      "Simple and compound interest",
      "Mean, median, mode, and range",
      "Probability of simple events",
    ],
  },
  {
    name: "Algebraic Problem Solving",
    subItems: [
      "Linear equations in one variable",
      "Linear inequalities",
      "Systems of linear equations",
      "Exponents and scientific notation",
      "Quadratic expressions and factoring",
    ],
  },
  {
    name: "Graphs and Functions",
    subItems: [
      "Interpreting bar, line, and pie charts",
      "Coordinate plane and slope",
      "Linear functions and equations of lines",
      "Function notation and evaluation",
      "Reading tables and two-variable data",
    ],
  },
  {
    name: "Geometry",
    subItems: [
      "Perimeter and area of polygons",
      "Circumference and area of circles",
      "Volume and surface area of solids",
      "Pythagorean theorem",
      "Similar figures and scale",
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
    await client.query(
      `
        INSERT INTO "User" ("id", "email", "emailVerified", "role", "status", "isInternal", "plan")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT ("id")
        DO UPDATE SET
          "status" = EXCLUDED."status",
          "plan" = EXCLUDED."plan",
          "isInternal" = EXCLUDED."isInternal"
      `,
      [ANON_USER_ID, "anon@dystoppia.local", true, "customer", "active", true, "master"]
    );
    console.log("[seed-ged] anon user ok");

    const existing = await client.query(`SELECT "id" FROM "Topic" WHERE "slug" = $1 LIMIT 1`, [GED_SLUG]);
    if (existing.rowCount > 0) {
      console.log("[seed-ged] GED topic already exists - skipping");
      return;
    }

    await client.query("BEGIN");

    await client.query(
      `
        INSERT INTO "Topic" ("id", "name", "slug", "teachingProfile")
        VALUES ($1, $2, $3, $4)
      `,
      [
        GED_TOPIC_ID,
        "GED Mathematical Reasoning",
        GED_SLUG,
        JSON.stringify(gedTeachingProfile),
      ]
    );

    for (const [itemIndex, item] of gedItems.entries()) {
      const itemId = `item-${slugify(item.name)}`;
      await client.query(
        `
          INSERT INTO "Item" ("id", "topicId", "name", "order", "muted")
          VALUES ($1, $2, $3, $4, $5)
        `,
        [itemId, GED_TOPIC_ID, item.name, itemIndex, false]
      );

      for (const [subIndex, subName] of item.subItems.entries()) {
        const subItemId = `subitem-${slugify(item.name)}-${String(subIndex + 1).padStart(2, "0")}`;
        await client.query(
          `
            INSERT INTO "SubItem" ("id", "itemId", "name", "order", "muted", "difficulty", "easeFactor", "reviewInterval")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [subItemId, itemId, subName, subIndex, false, 1, 2.5, 1]
        );
      }
    }

    await client.query("COMMIT");
    console.log(`[seed-ged] GED topic created with ${gedItems.length} items`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("[seed-ged] FAILED:", e);
  process.exit(0); // don't fail startup - app can still run
});
