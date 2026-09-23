// File: web/src/lib/fetch-with-timeout.ts

/**
 * `fetch` with no timeout. A Discord/bot upstream that accepts a connection
 * but never responds hangs the request indefinitely - and for callers that
 * single-flight concurrent requests through one shared promise (see
 * `getBotGuilds` in `server/bot-guilds.ts`), that hang blocks every other
 * caller too, with no way to recover short of restarting the process.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
