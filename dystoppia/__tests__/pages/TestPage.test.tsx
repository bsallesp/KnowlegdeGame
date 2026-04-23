import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const mockHeaders = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

import TestPage from "@/app/test/page";

describe("TestPage", () => {
  beforeEach(() => {
    mockHeaders.mockReset();
    mockHeaders.mockResolvedValue(
      new Headers({
        host: "localhost:3100",
        "x-forwarded-proto": "http",
      }),
    );
    global.fetch = vi.fn() as typeof fetch;
  });

  test("shows backend and database as accessible when health endpoint is healthy", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ ok: true, db: "up" }),
    });

    render(await TestPage());

    expect(screen.getByText("Backend accessible")).toBeInTheDocument();
    expect(screen.getByText("Database accessible")).toBeInTheDocument();
    expect(screen.getByText(/Health endpoint HTTP status:/)).toHaveTextContent("200");
    expect(global.fetch).toHaveBeenCalledWith("http://localhost:3100/api/health", { cache: "no-store" });
  });

  test("keeps backend accessible when the endpoint responds but the database is down", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 503,
      json: () => Promise.resolve({ ok: false, db: "down" }),
    });

    render(await TestPage());

    expect(screen.getByText("Backend accessible")).toBeInTheDocument();
    expect(screen.getByText("Database unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Health endpoint HTTP status:/)).toHaveTextContent("503");
    expect(
      screen.getByText("The backend replied, but the database health probe failed."),
    ).toBeInTheDocument();
  });

  test("shows backend as unavailable when the health endpoint cannot be reached", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("connect ECONNREFUSED"));

    render(await TestPage());

    expect(screen.getByText("Backend unavailable")).toBeInTheDocument();
    expect(screen.getByText("Database not confirmed")).toBeInTheDocument();
    expect(screen.getByText(/Health endpoint HTTP status:/)).toHaveTextContent("no response");
    expect(
      screen.getByText(/The page could not reach the backend health endpoint: connect ECONNREFUSED/),
    ).toBeInTheDocument();
  });
});
