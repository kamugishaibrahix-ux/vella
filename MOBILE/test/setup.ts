// Test setup: Mock localStorage for all tests; enable log guard so tests do not log sensitive data.
import { beforeEach } from "vitest";
import { installLogGuardForTests } from "@/lib/security/logGuard";

installLogGuardForTests();

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

// Patch localStorage on the existing jsdom window — never replace global.window itself.
beforeEach(() => {
  localStorageMock.clear();
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
});

// Patch only the missing randomUUID on the existing crypto object.
if (typeof globalThis.crypto === "undefined") {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      randomUUID: () =>
        "test-uuid-" + Math.random().toString(36).substring(2, 15),
    },
    writable: true,
    configurable: true,
  });
} else if (typeof globalThis.crypto.randomUUID !== "function") {
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: () =>
      "test-uuid-" + Math.random().toString(36).substring(2, 15),
    writable: true,
    configurable: true,
  });
}
