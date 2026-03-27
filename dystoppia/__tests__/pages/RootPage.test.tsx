import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const mockUseCheckUser = vi.hoisted(() =>
  vi.fn(() => ({ loading: false, authenticated: false })),
);

vi.mock("@/lib/useCheckUser", () => ({
  useCheckUser: () => mockUseCheckUser(),
}));

vi.mock("@/components/LandingPage", () => ({
  default: () => <div data-testid="landing-mock" />,
}));

vi.mock("@/lib/useRequireUser", () => ({
  useRequireUser: () => ({ loading: false }),
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
    button: ({
      children,
      onClick,
      ...p
    }: React.PropsWithChildren<Record<string, unknown> & { onClick?: () => void }>) => (
      <button onClick={onClick} {...(p as object)}>
        {children}
      </button>
    ),
    main: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <main {...(p as object)}>{children}</main>
    ),
    p: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <p {...(p as object)}>{children}</p>
    ),
    footer: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <footer {...(p as object)}>{children}</footer>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
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

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ topics: [] }) }),
  ) as typeof fetch;
});

import RootPage from "@/app/page";

describe("RootPage", () => {
  beforeEach(() => {
    mockUseCheckUser.mockReset();
  });

  test("shows loading shell while useCheckUser is loading", () => {
    mockUseCheckUser.mockReturnValue({ loading: true, authenticated: false });
    const { container } = render(<RootPage />);
    expect(screen.queryByTestId("landing-mock")).toBeNull();
    expect(container.querySelector(".min-h-screen")).toBeTruthy();
  });

  test("renders LandingPage when not authenticated", () => {
    mockUseCheckUser.mockReturnValue({ loading: false, authenticated: false });
    render(<RootPage />);
    expect(screen.getByTestId("landing-mock")).toBeTruthy();
  });

  test("renders authenticated home when user is signed in", async () => {
    mockUseCheckUser.mockReturnValue({ loading: false, authenticated: true });
    render(<RootPage />);
    await screen.findByRole("heading", { name: /dystoppia/i });
  });
});
