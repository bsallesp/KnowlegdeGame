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
  },
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

  test("renders chat-style home and builder history for master users", async () => {
    render(<PrivateHomeDashboard />);

    expect(screen.getByRole("heading", { name: /what are we learning today/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /dystoppia prompt/i })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /^learn$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: /^build$/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^govern$/i })).toBeTruthy();

    expect(await screen.findByText(/420 credits/i)).toBeTruthy();
    expect(await screen.findByText(/Analyze a competitor app/i)).toBeTruthy();
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

    await waitFor(() => expect(screen.getByText(/What are we learning today/i)).toBeTruthy());
    expect(screen.queryByText(/Recent Builder requests/i)).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
