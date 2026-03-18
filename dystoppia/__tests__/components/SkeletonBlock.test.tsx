import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SkeletonBlock from "@/components/ui/SkeletonBlock";

describe("SkeletonBlock", () => {
  test("renders without crashing", () => {
    const { container } = render(<SkeletonBlock />);
    expect(container.firstChild).toBeTruthy();
  });

  test("applies default width of 100%", () => {
    const { container } = render(<SkeletonBlock />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("100%");
  });

  test("applies default height of 1rem", () => {
    const { container } = render(<SkeletonBlock />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.height).toBe("1rem");
  });

  test("applies custom width", () => {
    const { container } = render(<SkeletonBlock width="200px" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("200px");
  });

  test("applies custom height", () => {
    const { container } = render(<SkeletonBlock height="3rem" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.height).toBe("3rem");
  });

  test("applies custom className", () => {
    const { container } = render(<SkeletonBlock className="my-class" />);
    const el = container.firstChild as HTMLElement;
    expect(el.classList.contains("my-class")).toBe(true);
  });

  test("always has rounded class", () => {
    const { container } = render(<SkeletonBlock />);
    const el = container.firstChild as HTMLElement;
    expect(el.classList.contains("rounded")).toBe(true);
  });

  test("applies background color", () => {
    const { container } = render(<SkeletonBlock />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.backgroundColor).toBe("rgb(28, 28, 40)");
  });

  test("renders as div element", () => {
    const { container } = render(<SkeletonBlock />);
    expect(container.firstChild?.nodeName).toBe("DIV");
  });

  test("renders with combined className and defaults", () => {
    const { container } = render(<SkeletonBlock className="extra" width="50%" height="2rem" />);
    const el = container.firstChild as HTMLElement;
    expect(el.classList.contains("extra")).toBe(true);
    expect(el.style.width).toBe("50%");
    expect(el.style.height).toBe("2rem");
  });

  test("renders multiple SkeletonBlocks independently", () => {
    const { container } = render(
      <div>
        <SkeletonBlock width="100px" />
        <SkeletonBlock width="200px" />
      </div>
    );
    const children = container.firstChild?.childNodes;
    expect(children?.length).toBe(2);
  });

  test("empty className does not break render", () => {
    const { container } = render(<SkeletonBlock className="" />);
    expect(container.firstChild).toBeTruthy();
  });

  test("percentage width works correctly", () => {
    const { container } = render(<SkeletonBlock width="75%" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("75%");
  });

  test("viewport-relative height works", () => {
    const { container } = render(<SkeletonBlock height="4vh" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.height).toBe("4vh");
  });
});
