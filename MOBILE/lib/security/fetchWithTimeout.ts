/**
 * Fetch with explicit timeout. Aborts the request after ms.
 * Use for all external HTTP calls (OpenAI REST, etc.) for production resilience.
 */
const DEFAULT_TIMEOUT_MS = 60_000;

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}
