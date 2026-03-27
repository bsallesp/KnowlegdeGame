import { NextResponse } from "next/server";

export const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    hourlyLimit: 5,
    weeklyLimit: 30,
    curriculumPerWeek: 2,
    audiobook: false,
    description: "Experience the app — ~2 full sessions/week",
    features: ["5 questions/hour", "30 questions/week", "2 curricula/week"],
  },
  {
    id: "learner",
    name: "Learner",
    price: 7.99,
    hourlyLimit: 30,
    weeklyLimit: 250,
    curriculumPerWeek: 10,
    audiobook: true,
    description: "Daily learner — ~35 questions/day",
    features: [
      "30 questions/hour",
      "250 questions/week",
      "10 curricula/week",
      "Audiobook generation",
    ],
  },
  {
    id: "master",
    name: "Master",
    price: 16.99,
    hourlyLimit: 100,
    weeklyLimit: 1000,
    curriculumPerWeek: 9999,
    audiobook: true,
    description: "Power user — ~140 questions/day",
    features: [
      "100 questions/hour",
      "1000 questions/week",
      "Unlimited curricula",
      "Audiobook generation",
    ],
  },
];

export async function GET() {
  return NextResponse.json({ plans: PLANS });
}
