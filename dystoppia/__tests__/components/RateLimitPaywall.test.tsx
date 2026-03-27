import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, onClick, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div onClick={onClick as React.MouseEventHandler} {...(p as object)}>
        {children}
      </div>
    ),
    button: ({
      children,
      onClick,
      disabled,
      ...p
    }: React.PropsWithChildren<
      Record<string, unknown> & { onClick?: () => void; disabled?: boolean }
    >    ) => (
      <button onClick={onClick} disabled={disabled} {...(p as object)}>
        {children}
      </button>
    ),
  },
}));

import RateLimitPaywall from "@/components/RateLimitPaywall";

describe("RateLimitPaywall", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: "" };
  });

  test("calls onClose when user chooses to wait", () => {
    const onClose = vi.fn();
    render(
      <RateLimitPaywall window="hourly" resetsAt={new Date(Date.now() + 120_000).toISOString()} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /wait .+ for free/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test("redirects to Stripe checkout url on upgrade", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "https://checkout.test/x" }),
    });
    const onClose = vi.fn();
    render(<RateLimitPaywall window="weekly" resetsAt={null} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /^Learner/ }));

    await waitFor(() => {
      expect(window.location.href).toBe("https://checkout.test/x");
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
