import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const mockUsePathname = vi.fn();

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

import SlaMenu from "@/components/SlaMenu";

describe("SlaMenu", () => {
  test("renders the canonical app navigation", () => {
    mockUsePathname.mockReturnValue("/game");

    render(<SlaMenu />);

    expect(screen.getByRole("link", { name: "Game" })).toHaveAttribute("href", "/game");
    expect(screen.getByRole("link", { name: "Books" })).toHaveAttribute("href", "/books");
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  test("keeps Game active for the legacy /session path", () => {
    mockUsePathname.mockReturnValue("/session");

    render(<SlaMenu />);

    expect(screen.getByRole("link", { name: "Game" })).toHaveAttribute("aria-current", "page");
  });

  test("keeps Books active for nested reader routes", () => {
    mockUsePathname.mockReturnValue("/books/book-1");

    render(<SlaMenu />);

    expect(screen.getByRole("link", { name: "Books" })).toHaveAttribute("aria-current", "page");
  });
});
