import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockPush = vi.fn();
const mockResetSession = vi.fn();
const mockSetCurrentTopic = vi.fn();

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string } & Record<string, unknown>>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/store/useAppStore", () => ({
  default: () => ({
    resetSession: mockResetSession,
    setCurrentTopic: mockSetCurrentTopic,
  }),
}));

import BookReader from "@/components/BookReader";

describe("BookReader", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/books/book-1") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            book: {
              id: "book-1",
              title: "Microsoft_Press_ebook_Introducing_Power_BI_PDF_mobile",
              author: null,
              mimeType: "application/pdf",
              pageCount: 407,
              status: "ready",
              extractionMode: "native",
              createdAt: "2026-04-22T00:00:00.000Z",
              chapters: [
                {
                  id: "chapter-2",
                  parentId: null,
                  title: "Chapter 2: Sharing the dashboard",
                  order: 0,
                  startPage: 71,
                  endPage: 90,
                },
              ],
            },
          }),
        });
      }

      if (url === "/api/books/book-1/pages/1") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            page: {
              pageNumber: 1,
              source: "native",
              confidence: null,
              charCount: 245,
              text: [
                "C H A P T E R 2 | Sharing the dashboard",
                "Creating a group",
                "workspace in Power BI",
                "",
                "Let's return to David and Wendy.",
                "After David invited Wendy, he realizes that he will need to repeat the same share operation.",
              ].join("\n"),
            },
          }),
        });
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as typeof fetch;
  });

  test("renders a cleaner reading view and allows switching to raw text", async () => {
    const user = userEvent.setup();

    render(<BookReader bookId="book-1" />);

    await screen.findAllByText("Microsoft Press ebook Introducing Power BI PDF mobile");
    await screen.findByText("CHAPTER 2 | Sharing the dashboard");

    expect(screen.getByTestId("reader-sidebar")).toHaveClass(
      "xl:max-h-[calc(100vh-3rem)]",
      "xl:overflow-y-auto",
    );
    expect(screen.getByTestId("chapters-panel")).not.toHaveClass("xl:flex-1");
    expect(screen.getByTestId("chapters-list")).not.toHaveClass("overflow-y-auto");
    expect(screen.getByText("Creating a group")).toBeTruthy();
    expect(screen.getByText("workspace in Power BI")).toBeTruthy();
    expect(screen.getAllByText("Native text").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Raw text" }));

    const rawReader = await screen.findByTestId("raw-reader");
    expect(rawReader).toHaveTextContent("C H A P T E R 2 | Sharing the dashboard");
    expect(rawReader).toHaveTextContent("After David invited Wendy");

    await user.click(screen.getByRole("button", { name: "Clean view" }));

    await waitFor(() => {
      expect(screen.queryByTestId("raw-reader")).toBeNull();
    });
    expect(screen.getByText("Creating a group")).toBeTruthy();
  });

  test("starts study mode and routes the reader flow to /game", async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const baseImplementation = fetchMock.getMockImplementation();

    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/books/book-1/to-topic") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            topic: {
              id: "topic-1",
              name: "Power BI Fundamentals",
              slug: "power-bi-fundamentals",
              createdAt: "2026-04-22T00:00:00.000Z",
              teachingProfile: null,
              items: [],
            },
          }),
        });
      }

      if (!baseImplementation) {
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }

      return baseImplementation(url, undefined);
    });

    render(<BookReader bookId="book-1" />);

    await screen.findByRole("button", { name: "Study this book" });
    await user.click(screen.getByRole("button", { name: "Study this book" }));

    await waitFor(() => {
      expect(mockResetSession).toHaveBeenCalledOnce();
      expect(mockSetCurrentTopic).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "topic-1",
          slug: "power-bi-fundamentals",
        }),
      );
      expect(mockPush).toHaveBeenCalledWith("/game");
    });
  });
});
