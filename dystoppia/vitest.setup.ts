import "@testing-library/jest-dom";
import { beforeEach } from "vitest";

// Reset localStorage between tests (not available in Node environment)
beforeEach(() => {
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }
});
