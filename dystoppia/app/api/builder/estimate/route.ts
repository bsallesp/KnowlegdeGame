import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { estimateBuilderRequest } from "@/lib/costEngine";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(req, "master");
    if (auth instanceof NextResponse) return auth;

    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 4) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const estimate = estimateBuilderRequest(prompt);

    return NextResponse.json({
      ok: true,
      estimate,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to estimate builder request", details: String(error) },
      { status: 500 }
    );
  }
}
