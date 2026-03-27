import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    >) => (
      <button onClick={onClick} disabled={disabled} {...(p as object)}>
        {children}
      </button>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import StudioActionsDialog from "@/components/StudioActionsDialog";

describe("StudioActionsDialog", () => {
  test("renders nothing when closed", () => {
    const { container } = render(
      <StudioActionsDialog open={false} onClose={vi.fn()} actions={[]} />,
    );
    expect(screen.queryByText("Studio Actions")).toBeNull();
    expect(container.textContent || "").toBe("");
  });

  test("invokes action and closes when item clicked", () => {
    const onClose = vi.fn();
    const onAct = vi.fn();
    render(
      <StudioActionsDialog
        open
        onClose={onClose}
        actions={[
          {
            id: "a1",
            icon: "🎧",
            label: "Audiobook",
            description: "Listen",
            onClick: onAct,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /audiobook/i }));
    expect(onAct).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test("backdrop click closes dialog", () => {
    const onClose = vi.fn();
    const { container } = render(
      <StudioActionsDialog
        open
        onClose={onClose}
        actions={[
          {
            id: "a1",
            icon: "x",
            label: "One",
            description: "Desc",
            onClick: vi.fn(),
          },
        ]}
      />,
    );

    const backdrop = container.querySelector(".fixed.inset-0.z-40");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });
});
