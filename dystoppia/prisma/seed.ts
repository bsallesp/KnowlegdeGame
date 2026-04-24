import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── Provider Pricing Snapshots (current as of 2026-04) ──

  const pricingSnapshots = [
    // Anthropic — Claude Sonnet 4.6
    {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      serviceType: "llm",
      inputPricePerUnit: 3.0 / 1_000_000,   // $3.00 per 1M input tokens
      outputPricePerUnit: 15.0 / 1_000_000,  // $15.00 per 1M output tokens
      unit: "token",
      notes: "Sonnet 4.6 — primary builder model",
    },
    // Anthropic — Claude Opus 4.6
    {
      provider: "anthropic",
      model: "claude-opus-4-6",
      serviceType: "llm",
      inputPricePerUnit: 15.0 / 1_000_000,   // $15.00 per 1M input tokens
      outputPricePerUnit: 75.0 / 1_000_000,   // $75.00 per 1M output tokens
      unit: "token",
      notes: "Opus 4.6 — premium model, used sparingly",
    },
    // Anthropic — Claude Haiku 4.5
    {
      provider: "anthropic",
      model: "claude-haiku-4-5",
      serviceType: "llm",
      inputPricePerUnit: 0.80 / 1_000_000,   // $0.80 per 1M input tokens
      outputPricePerUnit: 4.0 / 1_000_000,    // $4.00 per 1M output tokens
      unit: "token",
      notes: "Haiku 4.5 — fast/cheap model for classification and small tasks",
    },
    {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      serviceType: "llm",
      inputPricePerUnit: 0.80 / 1_000_000,
      outputPricePerUnit: 4.0 / 1_000_000,
      unit: "token",
      notes: "Haiku 4.5 dated variant",
    },
    // OpenAI LLM
    {
      provider: "openai",
      model: "gpt-4o-mini",
      serviceType: "llm",
      inputPricePerUnit: 0.15 / 1_000_000,   // $0.15 per 1M input tokens
      outputPricePerUnit: 0.60 / 1_000_000,  // $0.60 per 1M output tokens
      unit: "token",
      notes: "OpenAI GPT-4o mini — primary for question generation d0-d2",
    },
    {
      provider: "openai",
      model: "gpt-4o",
      serviceType: "llm",
      inputPricePerUnit: 2.50 / 1_000_000,
      outputPricePerUnit: 10.0 / 1_000_000,
      unit: "token",
      notes: "OpenAI GPT-4o",
    },
    // OpenAI TTS
    {
      provider: "openai",
      model: "openai-tts",
      serviceType: "tts",
      inputPricePerUnit: 0.015 / 1_000,  // $0.015 per 1000 chars
      outputPricePerUnit: 0,
      unit: "character",
      notes: "OpenAI TTS-1",
    },
    // Azure TTS
    {
      provider: "azure",
      model: "azure-tts",
      serviceType: "tts",
      inputPricePerUnit: 0.016 / 1_000,  // $0.016 per 1000 chars
      outputPricePerUnit: 0,
      unit: "character",
      notes: "Azure Cognitive Services TTS",
    },
  ];

  for (const snapshot of pricingSnapshots) {
    // Expire any existing active snapshot for the same provider+model
    await prisma.providerPricingSnapshot.updateMany({
      where: {
        provider: snapshot.provider,
        model: snapshot.model,
        effectiveTo: null,
      },
      data: {
        effectiveTo: new Date(),
      },
    });

    await prisma.providerPricingSnapshot.create({
      data: {
        ...snapshot,
        effectiveFrom: new Date(),
        effectiveTo: null,
      },
    });
  }

  console.log(`Seeded ${pricingSnapshots.length} pricing snapshots.`);

  // ── Platform Config ──

  const configs: Record<string, unknown> = {
    // How much we charge per 1 credit in USD
    "pricing.credit_value_usd": 0.01,

    // Multipliers applied on top of raw provider cost
    "pricing.multipliers": {
      planning: 4.0,        // Builder planning, onboarding refine
      generation: 5.0,      // Code generation, artifact creation
      execution: 1.8,       // Azure resource passthrough
      research: 3.0,        // Reddit/web research
      tts: 3.0,             // Text-to-speech
    },

    // Minimum credits charged per request regardless of actual cost
    "pricing.floor_credits": {
      builder: 5,           // Min 5 credits per builder request
      onboarding: 2,        // Min 2 credits per onboarding refinement
      research: 3,          // Min 3 credits per research execution
      tts: 1,               // Min 1 credit per TTS request
      default: 1,           // Fallback minimum
    },

    // Maximum extra credits that can be charged above the estimate (cap)
    // Expressed as a fraction: 0.3 = up to 30% more than estimated
    "pricing.settlement_cap_fraction": 0.3,

    // Buffer added to estimates to reduce settlement adjustments
    // Expressed as a fraction: 0.15 = 15% safety buffer on estimates
    "pricing.estimate_buffer_fraction": 0.15,
  };

  for (const [key, value] of Object.entries(configs)) {
    await prisma.platformConfig.upsert({
      where: { key },
      update: {
        value: typeof value === "string" ? value : JSON.stringify(value),
      },
      create: {
        key,
        value: typeof value === "string" ? value : JSON.stringify(value),
      },
    });
  }

  console.log(`Seeded ${Object.keys(configs).length} platform config entries.`);

  // ── Anonymous default user (used when DISABLE_AUTH=1) ──

  const ANON_USER_ID = "anon-default-user";
  await prisma.user.upsert({
    where: { id: ANON_USER_ID },
    update: { plan: "master", status: "active" },
    create: {
      id: ANON_USER_ID,
      email: "anon@dystoppia.local",
      plan: "master",
      status: "active",
      emailVerified: true,
      isInternal: true,
    },
  });
  console.log("Seeded anonymous default user.");

  // ── GED Mathematical Reasoning topic ──

  const gedTeachingProfile = {
    style: "scenario_based",
    register: "instructional_practical",
    questionPatterns: [
      "A shopper buys X items for $Y each with a Z% discount — how much do they pay?",
      "A rectangular garden measures A feet by B feet — what is its area/perimeter?",
      "If f(x) = ..., what is f(n)?",
      "Solve for x: 2x + 5 = 17",
      "The bar chart shows ... — which category has the highest/lowest value?",
      "A recipe calls for 2/3 cup of flour — how much is needed to double/halve the recipe?",
      "If a car travels X miles in Y hours, what is its average speed?",
      "What percent of A is B?",
      "A savings account earns simple interest — compute the balance after N years.",
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

  const gedSlug = "ged-mathematical-reasoning";
  const existingGed = await prisma.topic.findUnique({ where: { slug: gedSlug } });
  if (!existingGed) {
    await prisma.topic.create({
      data: {
        name: "GED Mathematical Reasoning",
        slug: gedSlug,
        teachingProfile: JSON.stringify(gedTeachingProfile),
        items: {
          create: gedItems.map((item, itemIndex) => ({
            name: item.name,
            order: itemIndex,
            subItems: {
              create: item.subItems.map((subName, subIndex) => ({
                name: subName,
                order: subIndex,
                difficulty: 1,
              })),
            },
          })),
        },
      },
    });
    console.log(`Seeded GED Mathematical Reasoning topic with ${gedItems.length} items.`);
  } else {
    console.log("GED Mathematical Reasoning topic already exists — skipping.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
