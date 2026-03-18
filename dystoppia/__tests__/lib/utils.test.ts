import { describe, test, expect } from "vitest";
import { slugify } from "@/lib/utils";

describe("slugify", () => {
  test("converts uppercase to lowercase", () => {
    expect(slugify("AZ-900")).toBe("az-900");
  });

  test("replaces spaces with hyphens", () => {
    expect(slugify("car mechanics")).toBe("car-mechanics");
  });

  test("removes special characters", () => {
    expect(slugify("C# & .NET Programming!")).toBe("c-net-programming");
  });

  test("collapses multiple consecutive hyphens into one", () => {
    expect(slugify("hello   world")).toBe("hello-world");
  });

  test("trims leading and trailing whitespace", () => {
    expect(slugify("  azure fundamentals  ")).toBe("azure-fundamentals");
  });

  test("handles numbers correctly", () => {
    expect(slugify("AZ 900 Certification")).toBe("az-900-certification");
  });

  test("handles already-slugified input unchanged", () => {
    expect(slugify("az-900")).toBe("az-900");
  });
});
