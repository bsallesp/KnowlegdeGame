import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ─── Framer-motion stub ───────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = p as any;
      return <div {...rest}>{children}</div>;
    },
    button: ({ children, onClick, disabled, ...p }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = p as any;
      return <button onClick={onClick as any} disabled={disabled as any} {...rest}>{children}</button>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// ─── Router mock ──────────────────────────────────────────────────────────────
const mockRouterBack = vi.hoisted(() => vi.fn());
const mockRouterReplace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: mockRouterBack, replace: mockRouterReplace }),
}));

// ─── useRequireUser mock ──────────────────────────────────────────────────────
const mockUseRequireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/useRequireUser", () => ({ useRequireUser: mockUseRequireUser }));

// ─── Store mock ───────────────────────────────────────────────────────────────
const mockUseAppStore = vi.hoisted(() => vi.fn());
vi.mock("@/store/useAppStore", () => ({ default: mockUseAppStore }));

// ─── fetch mock ───────────────────────────────────────────────────────────────
global.fetch = vi.fn();

import ProfilePage from "@/app/profile/page";

const baseStore = { userEmail: "user@example.com", credits: 42, plan: "free" };

function setupStore(overrides: Partial<typeof baseStore> = {}) {
  const state = { ...baseStore, ...overrides };
  mockUseAppStore.mockImplementation((selector: (s: typeof state) => unknown) => selector(state));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRequireUser.mockReturnValue({ loading: false });
  setupStore();
  (global.fetch as any).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ profile: null }),
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────
describe("ProfilePage — auth loading", () => {
  test("renders nothing while auth is loading", () => {
    mockUseRequireUser.mockReturnValue({ loading: true });
    const { container } = render(<ProfilePage />);
    expect(container.textContent).toBe("");
  });

  test("does not fetch profile while auth is loading", () => {
    mockUseRequireUser.mockReturnValue({ loading: true });
    render(<ProfilePage />);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ─── Account info ─────────────────────────────────────────────────────────────
describe("ProfilePage — account info", () => {
  test("shows user email", () => {
    render(<ProfilePage />);
    expect(screen.getByText("user@example.com")).toBeTruthy();
  });

  test("shows credits", () => {
    setupStore({ credits: 99 });
    render(<ProfilePage />);
    expect(screen.getByText("99")).toBeTruthy();
  });

  test("shows Free badge for free plan", () => {
    render(<ProfilePage />);
    expect(screen.getByText("Free")).toBeTruthy();
  });

  test("shows Pro badge for pro plan", () => {
    setupStore({ plan: "pro" });
    render(<ProfilePage />);
    expect(screen.getByText("Pro")).toBeTruthy();
  });

  test("shows — when email is null", () => {
    setupStore({ userEmail: null as any });
    render(<ProfilePage />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});

// ─── Profile fetch ────────────────────────────────────────────────────────────
describe("ProfilePage — profile fetch", () => {
  test("fetches /api/user/profile on mount", async () => {
    render(<ProfilePage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/user/profile"));
  });

  test("does not show preferences section when profile is null", async () => {
    render(<ProfilePage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText("Learning Preferences")).toBeNull();
  });

  test("shows session duration when profile has timePerSession", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ profile: { timePerSession: "30min", preferredLang: "", goals: [] } }),
    });
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText("30min")).toBeTruthy());
  });

  test("shows 'Portuguese' for preferredLang pt", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ profile: { timePerSession: "", preferredLang: "pt", goals: [] } }),
    });
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText("Portuguese")).toBeTruthy());
  });

  test("shows 'English' for preferredLang en", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ profile: { timePerSession: "", preferredLang: "en", goals: [] } }),
    });
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText("English")).toBeTruthy());
  });

  test("renders each goal as a badge", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ profile: { timePerSession: "", preferredLang: "", goals: ["certification", "career"] } }),
    });
    render(<ProfilePage />);
    await waitFor(() => {
      expect(screen.getByText("certification")).toBeTruthy();
      expect(screen.getByText("career")).toBeTruthy();
    });
  });

  test("does not render goals section when goals array is empty", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ profile: { timePerSession: "10min", preferredLang: "en", goals: [] } }),
    });
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText("10min")).toBeTruthy());
    expect(screen.queryByText("Goals")).toBeNull();
  });

  test("silently handles fetch errors without crashing", async () => {
    (global.fetch as any).mockRejectedValue(new Error("network error"));
    const { container } = render(<ProfilePage />);
    await waitFor(() => expect(container.querySelector("main")).toBeTruthy());
    expect(screen.queryByText("Learning Preferences")).toBeNull();
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────
describe("ProfilePage — navigation", () => {
  test("calls router.back() when Back button is clicked", () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByText("Back"));
    expect(mockRouterBack).toHaveBeenCalledOnce();
  });

  test("shows page title 'Profile' in header", () => {
    render(<ProfilePage />);
    expect(screen.getAllByText("Profile").length).toBeGreaterThan(0);
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────
describe("ProfilePage — logout", () => {
  test("shows Sign out button", () => {
    render(<ProfilePage />);
    expect(screen.getByText("Sign out")).toBeTruthy();
  });

  test("calls POST /api/auth/logout on sign out click", async () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByText("Sign out"));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" })
    );
  });

  test("redirects to /login after logout", async () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByText("Sign out"));
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith("/login"));
  });

  test("shows 'Signing out...' while logout is in progress", async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url === "/api/auth/logout") return new Promise(() => {});
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ profile: null }) });
    });
    render(<ProfilePage />);
    fireEvent.click(screen.getByText("Sign out"));
    await waitFor(() => expect(screen.getByText("Signing out...")).toBeTruthy());
  });

  test("sign out button is disabled while logging out", async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url === "/api/auth/logout") return new Promise(() => {});
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ profile: null }) });
    });
    render(<ProfilePage />);
    fireEvent.click(screen.getByText("Sign out"));
    await waitFor(() => {
      const btn = screen.getByText("Signing out...").closest("button");
      expect(btn).toBeTruthy();
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
