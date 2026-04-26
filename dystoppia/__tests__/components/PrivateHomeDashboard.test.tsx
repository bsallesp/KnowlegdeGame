import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

const mockPush = vi.hoisted(() => vi.fn());
const mockUseRequireUser = vi.hoisted(() => vi.fn(() => ({ loading: false })));
const mockStore = vi.hoisted(() =>
  vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      userRole: "master",
      userEmail: "master@dystoppia.com",
      plan: "builder_pro",
    })
  )
);

vi.mock("@/lib/useRequireUser", () => ({
  useRequireUser: () => mockUseRequireUser(),
}));

vi.mock("@/store/useAppStore", () => ({
  default: (selector: (state: Record<string, unknown>) => unknown) => mockStore(selector),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>,
    aside: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <aside {...props}>{children}</aside>,
    p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <p {...props}>{children}</p>,
    h1: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h1 {...props}>{children}</h1>,
    h2: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h2 {...props}>{children}</h2>,
    button: ({ children, onClick, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <button onClick={onClick as React.MouseEventHandler} {...props}>{children}</button>
    ),
    form: ({ children, onSubmit, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <form onSubmit={onSubmit as React.FormEventHandler} {...props}>{children}</form>
    ),
    textarea: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <textarea {...props}>{children}</textarea>,
    section: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <section {...props}>{children}</section>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import PrivateHomeDashboard from "@/components/PrivateHomeDashboard";

describe("PrivateHomeDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockReset();
    mockUseRequireUser.mockReturnValue({ loading: false });
    mockStore.mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        userRole: "master",
        userEmail: "master@dystoppia.com",
        plan: "builder_pro",
      })
    );

    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/credits/balance")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ balance: 420 }),
        });
      }
      if (url.includes("/api/builder/requests")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              requests: [
                {
                  id: "req-1",
                  prompt: "Analyze a competitor app and estimate market difficulty",
                  viabilityStatus: "approved_with_warning",
                  estimatedCredits: 36,
                  status: "completed",
                  createdAt: "2026-04-08T10:00:00.000Z",
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as typeof fetch;
  });

  test("renders Dystoppia heading", async () => {
    render(<PrivateHomeDashboard />);
    await waitFor(() => expect(screen.getAllByText(/Dystoppia/i).length).toBeGreaterThan(0));
  });

  test("renders describe what you want to build prompt", async () => {
    render(<PrivateHomeDashboard />);
    await waitFor(() => expect(screen.getByText(/Describe what you want to build/i)).toBeTruthy());
  });

  test("does not request builder history for non-master users", async () => {
    mockStore.mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        userRole: "customer",
        userEmail: "user@dystoppia.com",
        plan: "free",
      })
    );

    render(<PrivateHomeDashboard />);

    await waitFor(() => expect(screen.getAllByText(/Dystoppia/i).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Recent Builder requests/i)).toBeNull();
  });
});
