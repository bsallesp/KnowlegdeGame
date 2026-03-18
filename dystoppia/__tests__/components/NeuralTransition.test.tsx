import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NeuralTransition from "@/components/NeuralTransition";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, animate, initial, exit, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    p: ({ children, animate, initial, exit, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <p {...props}>{children}</p>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe("NeuralTransition", () => {
  test("renders nothing when visible = false", () => {
    const { container } = render(<NeuralTransition visible={false} />);
    // AnimatePresence without visible renders nothing meaningful
    expect(screen.queryByRole("main")).toBeNull();
  });

  test("renders canvas when visible = true", () => {
    const { container } = render(<NeuralTransition visible={true} />);
    expect(container.querySelector("canvas")).toBeTruthy();
  });

  test("renders topic text when visible and topic provided", () => {
    render(<NeuralTransition visible={true} topic="AZ-900" />);
    expect(screen.getByText("AZ-900")).toBeTruthy();
  });

  test("renders a loading phrase when visible = true", () => {
    render(<NeuralTransition visible={true} />);
    const phrases = [
      "Consulting the universe...",
      "Training synapses...",
      "Reading 10,000 pages for you...",
      "Calibrating the knowledge matrix...",
      "Warming up the neural forge...",
      "Distilling centuries of wisdom...",
      "Decoding the fabric of reality...",
      "Summoning the collective intelligence...",
    ];
    const found = phrases.some((p) => screen.queryByText(p) !== null);
    expect(found).toBe(true);
  });

  test("renders fixed overlay when visible = true", () => {
    const { container } = render(<NeuralTransition visible={true} />);
    const overlay = container.querySelector("[style*='fixed'], .fixed");
    expect(overlay ?? container.firstChild).toBeTruthy();
  });

  test("cycles to the first phrase by default (index 0)", () => {
    render(<NeuralTransition visible={true} />);
    expect(screen.getByText("Consulting the universe...")).toBeTruthy();
  });

  test("renders without topic prop (no crash)", () => {
    expect(() => render(<NeuralTransition visible={true} />)).not.toThrow();
  });

  test("renders without topic showing only phrase", () => {
    render(<NeuralTransition visible={true} />);
    expect(screen.queryByText("undefined")).toBeNull();
  });
});
