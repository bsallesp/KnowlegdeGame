import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ─── Framer-motion stub ───────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = p as any;
      return <div {...rest}>{children}</div>;
    },
    button: ({
      children,
      onClick,
      disabled,
      ...p
    }: React.PropsWithChildren<Record<string, unknown> & { onClick?: () => void }>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = p as any;
      return (
        <button onClick={onClick as any} disabled={disabled as any} {...rest}>
          {children}
        </button>
      );
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// ─── fetch mock ───────────────────────────────────────────────────────────────
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import Paywall from "@/components/Paywall";

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom often makes location read-only; replace with a minimal stub.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).location;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).location = { href: "" };
});

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

  test("calls checkout API with learner plan on click", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://stripe.test/checkout_learner" }),
    });
    render(<Paywall onClose={vi.fn()} />);
    await userEvent.click(screen.getByText(/Learner — \$4\.99/i));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ plan: "learner" }),
      }),
    );
  });

  test("calls checkout API with master plan on click", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://stripe.test/checkout_master" }),
    });
    render(<Paywall onClose={vi.fn()} />);
    await userEvent.click(screen.getByText(/Master — \$9\.99/i));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({
        body: JSON.stringify({ plan: "master" }),
      }),
    );
  });

  test("redirects to Stripe checkout url on successful upgrade", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://stripe.test/checkout_learner" }),
    });
    render(<Paywall onClose={vi.fn()} />);
    await userEvent.click(screen.getByText(/Learner/i));
    await waitFor(() =>
      expect(window.location.href).toBe("https://stripe.test/checkout_learner"),
    );
  });

  test("does not call onClose after successful upgrade", async () => {
    const onClose = vi.fn();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://stripe.test/checkout_learner" }),
    });
    render(<Paywall onClose={onClose} />);
    await userEvent.click(screen.getByText(/Learner/i));
    await waitFor(() =>
      expect(window.location.href).toBe("https://stripe.test/checkout_learner"),
    );
    expect(onClose).not.toHaveBeenCalled();
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

  test("plan buttons are disabled while loading", async () => {
    let resolve: (v: any) => void;
    mockFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Paywall onClose={vi.fn()} />);
    await userEvent.click(screen.getByText(/Learner/i));

    const buttons = screen.getAllByRole("button");
    const learnerBtn = buttons.find((b) => (b.textContent || "").includes("Learner"));
    const masterBtn = buttons.find((b) => (b.textContent || "").includes("Master"));

    expect(learnerBtn?.hasAttribute("disabled") || masterBtn?.hasAttribute("disabled")).toBe(true);

    // cleanup
    resolve!({ ok: true, json: async () => ({ url: "https://stripe.test/checkout_learner" }) });
  });
});
