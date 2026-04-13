import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isItemSoloActive, isSubItemSoloActive } from "@/lib/topicFocus";
import { logger } from "@/lib/logger";

type ScopeType = "item" | "subitem";

function hasValidScopeType(type: unknown): type is ScopeType {
  return type === "item" || type === "subitem";
}

export async function POST(req: NextRequest) {
  try {
    const { id, type } = await req.json();

    if (!id || !hasValidScopeType(type)) {
      logger.warn("solo", "Missing or invalid solo payload", { id, type });
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (type === "item") {
      const item = await prisma.item.findUnique({
        where: { id },
        include: {
          topic: {
            include: {
              items: {
                orderBy: { order: "asc" },
                include: {
                  subItems: {
                    orderBy: { order: "asc" },
                  },
                },
              },
            },
          },
        },
      });

      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      const itemIds = item.topic.items.map((topicItem) => topicItem.id);
      const alreadySolo = isItemSoloActive(item.topic.items, id);

      await prisma.$transaction([
        prisma.item.updateMany({
          where: { topicId: item.topicId },
          data: { muted: alreadySolo ? false : true },
        }),
        prisma.subItem.updateMany({
          where: { itemId: { in: itemIds } },
          data: { muted: alreadySolo ? false : true },
        }),
        ...(!alreadySolo
          ? [
              prisma.item.update({
                where: { id },
                data: { muted: false },
              }),
              prisma.subItem.updateMany({
                where: { itemId: id },
                data: { muted: false },
              }),
            ]
          : []),
      ]);

      logger.info("solo", `Updated item solo mode to ${alreadySolo ? "all" : "solo"}`, { id });
      return NextResponse.json({ mode: alreadySolo ? "all" : "solo" });
    }

    const subItem = await prisma.subItem.findUnique({
      where: { id },
      include: {
        item: {
          include: {
            topic: {
              include: {
                items: {
                  orderBy: { order: "asc" },
                  include: {
                    subItems: {
                      orderBy: { order: "asc" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!subItem) {
      return NextResponse.json({ error: "SubItem not found" }, { status: 404 });
    }

    const itemIds = subItem.item.topic.items.map((topicItem) => topicItem.id);
    const alreadySolo = isSubItemSoloActive(subItem.item.topic.items, id);

    await prisma.$transaction([
      prisma.item.updateMany({
        where: { topicId: subItem.item.topicId },
        data: { muted: alreadySolo ? false : true },
      }),
      prisma.subItem.updateMany({
        where: { itemId: { in: itemIds } },
        data: { muted: alreadySolo ? false : true },
      }),
      ...(!alreadySolo
        ? [
            prisma.item.update({
              where: { id: subItem.itemId },
              data: { muted: false },
            }),
            prisma.subItem.update({
              where: { id },
              data: { muted: false },
            }),
          ]
        : []),
    ]);

    logger.info("solo", `Updated subitem solo mode to ${alreadySolo ? "all" : "solo"}`, { id });
    return NextResponse.json({ mode: alreadySolo ? "all" : "solo" });
  } catch (error) {
    logger.error("solo", "Failed to update solo focus", error);
    return NextResponse.json(
      { error: "Failed to update solo focus", details: String(error) },
      { status: 500 }
    );
  }
}
