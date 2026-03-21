import { NextResponse } from "next/server";

export const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    questionsPerMonth: 50,
    description: "Try the app — ~3 sessions",
  },
  {
    id: "learner",
    name: "Learner",
    price: 4.99,
    questionsPerMonth: 500,
    description: "Light user — ~17 questions/day",
  },
  {
    id: "master",
    name: "Master",
    price: 9.99,
    questionsPerMonth: 2000,
    description: "Power user — ~67 questions/day",
  },
];

export async function GET() {
  return NextResponse.json({ plans: PLANS });
}
