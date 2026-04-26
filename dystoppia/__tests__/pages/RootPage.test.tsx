import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/lib/useRequireUser", () => ({
  useRequireUser: () => ({ loading: false }),
}));

vi.mock("@/components/NeuralTransition", () => ({
  default: () => null,
}));

vi.mock("@/components/TopicApprovalScreen", () => ({
  default: () => null,
}));

vi.mock("@/store/useAppStore", () => ({
  default: () => ({
    setCurrentTopic: vi.fn(),
    addItemToCurrentTopic: vi.fn(),
    resetSession: vi.fn(),
    toggleItemMute: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...(p as object)}>{children}</div>
    ),
    form: ({ children, onSubmit, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <form onSubmit={onSubmit as React.FormEventHandler} {...(p as object)}>
        {children}
      </form>
    ),
    button: ({ children, onClick, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <button onClick={onClick as React.MouseEventHandler} {...(p as object)}>
        {children}
      </button>
    ),
    p: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <p {...(p as object)}>{children}</p>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ topics: [] }) }),
  ) as typeof fetch;
});

import RootPage from "@/app/page";

describe("RootPage", () => {
  test("renders Dystoppia heading", () => {
    render(<RootPage />);
    expect(screen.getByRole("heading", { name: /Dystoppia/i })).toBeTruthy();
  });

  test("renders search input with placeholder", () => {
    render(<RootPage />);
    expect(screen.getByPlaceholderText(/What do you want to learn today/i)).toBeTruthy();
  });

  test("renders suggestion chips when no history", () => {
    render(<RootPage />);
    expect(screen.getByText("Quantum Computing")).toBeTruthy();
  });
});
