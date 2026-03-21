import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

// ─── Store mock ───────────────────────────────────────────────────────────────
const mockSetCredits = vi.hoisted(() => vi.fn());
const mockSetPlan = vi.hoisted(() => vi.fn());

vi.mock("@/store/useAppStore", () => ({
  default: (selector: (s: any) => any) =>
    selector({ setCredits: mockSetCredits, setPlan: mockSetPlan }),
}));

// ─── fetch mock ───────────────────────────────────────────────────────────────
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import Paywall from "@/components/Paywall";

beforeEach(() => vi.clearAllMocks());

describe("Paywall — rendering", () => {
  test("renders 'Out of credits' heading", () => {
    render(<Paywall onClose={vi.fn()} />);
    expect(screen.getByText("Out of credits")).toBeTruthy();
  });

  test("renders Learner plan option", () => {
    render(<Paywall onClose={vi.fn()} />);
    expect(screen.getByText(/Learner/i)).toBeTruthy();
    expect(screen.getByText(/\$4\.99/)).toBeTruthy();
  });

  test("renders Master plan option", () => {
    render(<Paywall onClose={vi.fn()} />);
    expect(screen.getByText(/Master/i)).toBeTruthy();
    expect(screen.getByText(/\$9\.99/)).toBeTruthy();
  });

  test("renders Cancel button", () => {
    render(<Paywall onClose={vi.fn()} />);
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  test("does not show error message initially", () => {
    render(<Paywall onClose={vi.fn()} />);
    expect(screen.queryByText(/upgrade failed/i)).toBeNull();
  });
});

describe("Paywall — interactions", () => {
  test("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    render(<Paywall onClose={onClose} />);
    await userEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  test("calls purchase API with learner plan on click", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ user: { credits: 500, plan: "learner" } }),
    });
    render(<Paywall onClose={vi.fn()} />);
    await userEvent.click(screen.getByText(/Learner — \$4\.99/i));
    expect(mockFetch).toHaveBeenCalledWith("/api/billing/purchase", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ plan: "learner" }),
    }));
  });

  test("calls purchase API with master plan on click", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ user: { credits: 2000, plan: "master" } }),
    });
    render(<Paywall onClose={vi.fn()} />);
    await userEvent.click(screen.getByText(/Master — \$9\.99/i));
    expect(mockFetch).toHaveBeenCalledWith("/api/billing/purchase", expect.objectContaining({
      body: JSON.stringify({ plan: "master" }),
    }));
  });

  test("updates store credits and plan on successful upgrade", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ user: { credits: 500, plan: "learner" } }),
    });
    render(<Paywall onClose={vi.fn()} />);
    await userEvent.click(screen.getByText(/Learner/i));
    await waitFor(() => expect(mockSetCredits).toHaveBeenCalledWith(500));
    expect(mockSetPlan).toHaveBeenCalledWith("learner");
  });

  test("calls onClose after successful upgrade", async () => {
    const onClose = vi.fn();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ user: { credits: 500, plan: "learner" } }),
    });
    render(<Paywall onClose={onClose} />);
    await userEvent.click(screen.getByText(/Learner/i));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test("shows error message when API returns non-ok", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<Paywall onClose={vi.fn()} />);
    await userEvent.click(screen.getByText(/Learner/i));
    await waitFor(() => expect(screen.getByText(/upgrade failed/i)).toBeTruthy());
  });

  test("shows error message when fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    render(<Paywall onClose={vi.fn()} />);
    await userEvent.click(screen.getByText(/Learner/i));
    await waitFor(() => expect(screen.getByText(/upgrade failed/i)).toBeTruthy());
  });

  test("buttons are disabled while loading", async () => {
    let resolve: (v: any) => void;
    mockFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Paywall onClose={vi.fn()} />);
    await userEvent.click(screen.getByText(/Learner/i));
    const buttons = screen.getAllByRole("button");
    const planButtons = buttons.filter((b) => b.hasAttribute("disabled"));
    expect(planButtons.length).toBeGreaterThan(0);
    // cleanup
    resolve!({ ok: true, json: async () => ({ user: { credits: 500, plan: "learner" } }) });
  });
});
