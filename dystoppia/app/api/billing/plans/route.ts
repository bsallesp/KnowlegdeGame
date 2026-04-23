import { NextResponse } from "next/server";

export const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    hourlyLimit: 5,
    curriculumPerWeek: 2,
    audiobook: false,
    description: "Experience the app with a lightweight hourly cap",
    features: ["5 questions/hour", "2 curricula/week"],
  },
  {
    id: "learner",
    name: "Learner",
    price: 7.99,
    hourlyLimit: 30,
    curriculumPerWeek: 10,
    audiobook: true,
    description: "For consistent learners who want longer sessions",
    features: ["30 questions/hour", "10 curricula/week", "Audiobook generation"],
  },
  {
    id: "master",
    name: "Master",
    price: 16.99,
    hourlyLimit: 100,
    curriculumPerWeek: 9999,
    audiobook: true,
    description: "For power users who want the least friction",
    features: ["100 questions/hour", "Unlimited curricula", "Audiobook generation"],
  },
];

export async function GET() {
  return NextResponse.json({ plans: PLANS });
}
