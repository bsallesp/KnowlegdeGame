import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("framer-motion", () => ({
  motion: {
    p: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <p {...(p as object)}>{children}</p>
    ),
    button: ({
      children,
      type,
      disabled,
      onClick,
      ...p
    }: React.PropsWithChildren<
      Record<string, unknown> & { type?: string; disabled?: boolean; onClick?: () => void }
    >) => (
      <button type={type as "button" | "submit"} disabled={disabled} onClick={onClick} {...(p as object)}>
        {children}
      </button>
    ),
  },
}));

import WaitlistForm from "@/components/WaitlistForm";

beforeEach(() => {
  global.fetch = vi.fn();
});

describe("WaitlistForm", () => {
  test("submits email and shows success copy", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<WaitlistForm source="test" />);
    fireEvent.change(screen.getByPlaceholderText("your@email.com"), {
      target: { value: "hi@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Join$/i }));

    await waitFor(() => {
      expect(screen.getByText(/you're on the list/i)).toBeTruthy();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/waitlist",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "hi@example.com", source: "test" }),
      }),
    );
  });
});
