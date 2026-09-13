// One shared low-level Meilisearch HTTP client — base URL + index path
// construction, the bearer key, a hard timeout on every call, and error
// normalization. Every other search module (sync, search, settings,
// reindex) goes through this instead of hand-rolling fetch calls, so a
// storefront request can never hang on a slow/unreachable search engine and
// a caller can never accidentally leak the API key or a raw provider error
// to an end user. See Fix 8.
import { platformEnv, getMeilisearchBaseUrl } from "@/lib/platform/service-env";

export class MeilisearchError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "MeilisearchError";
    this.status = status;
  }
}

export function isMeilisearchConfigured(): boolean {
  return Boolean(getMeilisearchBaseUrl() && platformEnv.MEILISEARCH_API_KEY);
}

/** The configured index's uid — every path helper below is scoped to it. */
export function getIndexUid(): string {
  return platformEnv.MEILISEARCH_INDEX;
}

export function indexPath(suffix = ""): string {
  return `/indexes/${encodeURIComponent(getIndexUid())}${suffix}`;
}

type MeiliFetchOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
};

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Lowest-level call — returns the raw Response so callers that need custom
 * status handling (e.g. a delete where 404 already means "done") can decide
 * for themselves. Only throws for configuration problems, network failures,
 * and the timeout firing; never throws on a non-2xx HTTP response.
 */
export async function meiliFetch(path: string, options: MeiliFetchOptions = {}): Promise<Response> {
  const baseUrl = getMeilisearchBaseUrl();
  if (!baseUrl || !platformEnv.MEILISEARCH_API_KEY) {
    throw new MeilisearchError("Meilisearch is not configured.");
  }

  const timeoutMs = options.timeoutMs ?? platformEnv.MEILISEARCH_HTTP_TIMEOUT_MS;

  try {
    return await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        // Never sent to the browser — every caller of this module is
        // server-only (route handlers, server actions, scripts).
        Authorization: `Bearer ${platformEnv.MEILISEARCH_API_KEY}`,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    // Network/DNS failure or the AbortSignal timeout — normalize away the
    // raw error, which can otherwise include the request URL (and thus the
    // index name / host) in its message.
    throw new MeilisearchError(
      error instanceof Error && error.name === "TimeoutError"
        ? "Meilisearch request timed out."
        : "Meilisearch request failed."
    );
  }
}

/** JSON-parsing convenience wrapper — throws MeilisearchError on any non-2xx response. */
export async function meiliRequest<T = unknown>(path: string, options: MeiliFetchOptions = {}): Promise<T> {
  const response = await meiliFetch(path, options);
  const text = await response.text();
  const data = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    throw new MeilisearchError(`Meilisearch returned ${response.status}.`, response.status);
  }

  return data as T;
}

type MeiliTask = { taskUid: number; status: string };

/**
 * Meilisearch writes are asynchronous — a 202 with a taskUid doesn't mean
 * the documents are searchable yet. Scripts/tests that need to observe the
 * result (reindex, reconciliation, tests) should await this; individual
 * admin product saves intentionally don't (see syncListingSearch) since
 * eventual consistency there is an acceptable, documented tradeoff.
 */
export async function waitForMeiliTask(
  taskUid: number,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<{ ok: boolean; status: string }> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const task = await meiliRequest<MeiliTask>(`/tasks/${taskUid}`);
    if (task.status === "succeeded") return { ok: true, status: task.status };
    if (task.status === "failed" || task.status === "canceled") {
      return { ok: false, status: task.status };
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return { ok: false, status: "timeout" };
}
