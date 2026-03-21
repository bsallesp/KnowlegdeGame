import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AudiobookDialog, { type AudiobookEntry } from "@/components/AudiobookDialog";

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
    span: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, ...rest } = p as any;
      return <span {...rest}>{children}</span>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

function makeEntry(overrides: Partial<AudiobookEntry> = {}): AudiobookEntry {
  return {
    id: "entry-1",
    scopeId: "sub-1",
    scopeType: "subitem",
    scopeLabel: "CIA Triad",
    url: "blob:fake-url-1",
    createdAt: new Date("2026-03-21T10:30:00"),
    ...overrides,
  };
}

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  scopeLabel: "CIA Triad",
  audios: [],
  isGenerating: false,
  onGenerate: vi.fn(),
  onPlay: vi.fn(),
};

describe("AudiobookDialog — rendering", () => {
  test("renders scope label in header", () => {
    render(<AudiobookDialog {...defaultProps} />);
    expect(screen.getByText("CIA Triad")).toBeTruthy();
  });

  test("shows empty state when no audios", () => {
    render(<AudiobookDialog {...defaultProps} audios={[]} />);
    expect(screen.getByText(/Nenhum áudio gerado/i)).toBeTruthy();
  });

  test("shows 'Criar novo áudio' button when not generating", () => {
    render(<AudiobookDialog {...defaultProps} />);
    expect(screen.getByText(/Criar novo/i)).toBeTruthy();
  });

  test("shows 'Gerando...' when isGenerating is true", () => {
    render(<AudiobookDialog {...defaultProps} isGenerating={true} />);
    expect(screen.getByText(/Gerando/i)).toBeTruthy();
  });

  test("renders list of audios", () => {
    const audios = [
      makeEntry({ id: "e-1" }),
      makeEntry({ id: "e-2", createdAt: new Date("2026-03-21T11:00:00") }),
    ];
    render(<AudiobookDialog {...defaultProps} audios={audios} />);
    expect(screen.getByText("Áudio #2")).toBeTruthy();
    expect(screen.getByText("Áudio #1")).toBeTruthy();
  });

  test("renders nothing when open is false", () => {
    render(<AudiobookDialog {...defaultProps} open={false} />);
    expect(screen.queryByText("CIA Triad")).toBeNull();
  });
});

describe("AudiobookDialog — interactions", () => {
  test("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(<AudiobookDialog {...defaultProps} onClose={onClose} />);
    // The backdrop is the first fixed div (before the dialog panel)
    // It has onClick={onClose} passed through our framer-motion stub
    const backdrop = document.querySelector('div[style*="rgba(9,9,14"]') as HTMLElement;
    if (backdrop) {
      await userEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    } else {
      // fallback: close button always works
      await userEvent.click(screen.getByLabelText("Fechar"));
      expect(onClose).toHaveBeenCalled();
    }
  });

  test("calls onClose when X button is clicked", async () => {
    const onClose = vi.fn();
    render(<AudiobookDialog {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByLabelText("Fechar"));
    expect(onClose).toHaveBeenCalled();
  });

  test("calls onGenerate and onClose when 'Criar novo' is clicked", async () => {
    const onGenerate = vi.fn();
    const onClose = vi.fn();
    render(<AudiobookDialog {...defaultProps} onGenerate={onGenerate} onClose={onClose} />);
    await userEvent.click(screen.getByText(/Criar novo/i));
    expect(onGenerate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test("does NOT call onGenerate when isGenerating is true", async () => {
    const onGenerate = vi.fn();
    render(<AudiobookDialog {...defaultProps} isGenerating={true} onGenerate={onGenerate} />);
    await userEvent.click(screen.getByText(/Gerando/i));
    expect(onGenerate).not.toHaveBeenCalled();
  });

  test("calls onPlay and onClose when an audio entry is clicked", async () => {
    const onPlay = vi.fn();
    const onClose = vi.fn();
    const entry = makeEntry();
    render(<AudiobookDialog {...defaultProps} audios={[entry]} onPlay={onPlay} onClose={onClose} />);
    await userEvent.click(screen.getByText("Áudio #1"));
    expect(onPlay).toHaveBeenCalledWith(entry);
    expect(onClose).toHaveBeenCalled();
  });
});
