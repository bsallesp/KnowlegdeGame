import "@testing-library/jest-dom";
import { beforeEach } from "vitest";

// Reset localStorage between tests
beforeEach(() => {
  localStorage.clear();
});
