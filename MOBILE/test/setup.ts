// Test setup: Mock localStorage for all tests; enable log guard so tests do not log sensitive data.
import { beforeEach } from "vitest";
import { installLogGuardForTests } from "@/lib/security/logGuard";

installLogGuardForTests();

// Create a mock localStorage that persists across tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
})();

// Mock window and localStorage before each test
beforeEach(() => {
  localStorageMock.clear();
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
  });
  Object.defineProperty(global, "window", {
    value: { localStorage: localStorageMock },
    writable: true,
  });
});

// Mock crypto.randomUUID for ensureUserId
Object.defineProperty(global, "crypto", {
  value: {
    randomUUID: () => {
      return "test-uuid-" + Math.random().toString(36).substring(2, 15);
    },
  },
  writable: true,
});

