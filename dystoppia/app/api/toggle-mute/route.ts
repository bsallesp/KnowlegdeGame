import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { id, type } = await req.json();

    if (!id || !type) {
      logger.warn("toggle-mute", "Missing required fields", { id, type });
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    logger.debug("toggle-mute", `Toggle mute for ${type}`, { id });

    if (type === "item") {
      const item = await prisma.item.findUnique({ where: { id } });
      if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
      const updated = await prisma.item.update({
        where: { id },
        data: { muted: !item.muted },
      });
      logger.info("toggle-mute", `Item muted=${updated.muted}`, { id });
      return NextResponse.json({ muted: updated.muted });
    } else if (type === "subitem") {
      const subItem = await prisma.subItem.findUnique({ where: { id } });
      if (!subItem) return NextResponse.json({ error: "SubItem not found" }, { status: 404 });
      const updated = await prisma.subItem.update({
        where: { id },
        data: { muted: !subItem.muted },
      });
      logger.info("toggle-mute", `SubItem muted=${updated.muted}`, { id });
      return NextResponse.json({ muted: updated.muted });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    logger.error("toggle-mute", "Failed to toggle mute", error);
    return NextResponse.json(
      { error: "Failed to toggle mute", details: String(error) },
      { status: 500 }
    );
  }
}
