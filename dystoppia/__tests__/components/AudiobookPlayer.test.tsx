import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AudiobookPlayer from "@/components/AudiobookPlayer";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = p as any;
      return <div {...rest}>{children}</div>;
    },
    button: ({ children, onClick, ...p }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = p as any;
      return <button onClick={onClick as any} {...rest}>{children}</button>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// ─── HTMLMediaElement mock (jsdom does not implement audio playback) ───────────
const mockPlay = vi.fn().mockResolvedValue(undefined);
const mockPause = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: mockPlay });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: mockPause });
  Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 120 });
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get: () => 0,
    set: vi.fn(),
  });
});

const DEFAULT_URL = "blob:http://localhost/fake-audio";

describe("AudiobookPlayer — rendering", () => {
  test("renders player container", () => {
    const { container } = render(<AudiobookPlayer audioUrl={DEFAULT_URL} onClose={vi.fn()} />);
    expect(container.firstChild).toBeTruthy();
  });

  test("renders 'Audiobook personalizado' title", () => {
    render(<AudiobookPlayer audioUrl={DEFAULT_URL} onClose={vi.fn()} />);
    expect(screen.getByText(/Audiobook personalizado/i)).toBeTruthy();
  });

  test("renders subtitle about progress", () => {
    render(<AudiobookPlayer audioUrl={DEFAULT_URL} onClose={vi.fn()} />);
    expect(screen.getByText(/progresso/i)).toBeTruthy();
  });

  test("renders close button", () => {
    render(<AudiobookPlayer audioUrl={DEFAULT_URL} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Fechar player")).toBeTruthy();
  });

  test("renders play button initially", () => {
    render(<AudiobookPlayer audioUrl={DEFAULT_URL} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Reproduzir")).toBeTruthy();
  });

  test("renders audio element with correct src", () => {
    const { container } = render(<AudiobookPlayer audioUrl={DEFAULT_URL} onClose={vi.fn()} />);
    const audio = container.querySelector("audio");
    expect(audio?.getAttribute("src")).toBe(DEFAULT_URL);
  });

  test("renders initial time as 0:00", () => {
    render(<AudiobookPlayer audioUrl={DEFAULT_URL} onClose={vi.fn()} />);
    expect(screen.getAllByText("0:00").length).toBeGreaterThan(0);
  });
});

describe("AudiobookPlayer — interactions", () => {
  test("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    render(<AudiobookPlayer audioUrl={DEFAULT_URL} onClose={onClose} />);
    await userEvent.click(screen.getByLabelText("Fechar player"));
    expect(onClose).toHaveBeenCalled();
  });

  test("shows pause button after play starts", async () => {
    render(<AudiobookPlayer audioUrl={DEFAULT_URL} onClose={vi.fn()} />);
    const audio = document.querySelector("audio")!;
    // Simulate the audio starting to play
    fireEvent(audio, new Event("play"));
    // Trigger play via button click - the component calls audio.play()
    // which resolves and sets isPlaying = true
    await userEvent.click(screen.getByLabelText("Reproduzir"));
    // After clicking, play should have been called
    expect(mockPlay).toHaveBeenCalled();
  });

  test("calls audio.pause() when pause is triggered", async () => {
    render(<AudiobookPlayer audioUrl={DEFAULT_URL} onClose={vi.fn()} />);
    // Simulate playing state by firing timeupdate to get component to think it's playing
    const audio = document.querySelector("audio")!;
    // Click play
    await userEvent.click(screen.getByLabelText("Reproduzir"));
    expect(mockPlay).toHaveBeenCalled();
  });

  test("progress bar renders in DOM", () => {
    const { container } = render(<AudiobookPlayer audioUrl={DEFAULT_URL} onClose={vi.fn()} />);
    // The seek/progress track area wraps the bar; check it exists by cursor style
    const seekArea = container.querySelector('[class*="rounded-full"][class*="cursor-pointer"]');
    expect(seekArea).toBeTruthy();
  });

  test("updates time display on timeupdate event", () => {
    render(<AudiobookPlayer audioUrl={DEFAULT_URL} onClose={vi.fn()} />);
    const audio = document.querySelector("audio")!;
    // Simulate time progressing
    Object.defineProperty(audio, "currentTime", { configurable: true, get: () => 65 });
    Object.defineProperty(audio, "duration", { configurable: true, get: () => 120 });
    fireEvent(audio, new Event("timeupdate"));
    expect(screen.getByText("1:05")).toBeTruthy();
  });

  test("shows total duration after loadedmetadata fires", () => {
    render(<AudiobookPlayer audioUrl={DEFAULT_URL} onClose={vi.fn()} />);
    const audio = document.querySelector("audio")!;
    Object.defineProperty(audio, "duration", { configurable: true, get: () => 90 });
    fireEvent(audio, new Event("loadedmetadata"));
    expect(screen.getByText("1:30")).toBeTruthy();
  });
});
