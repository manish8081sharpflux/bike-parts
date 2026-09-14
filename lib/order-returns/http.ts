import { getCustomerSession } from "@/lib/auth/customer-session";
import { enforceApiRateLimit, rejectInvalidJsonRequest } from "@/lib/security/api-protection";
import { PartialReturnError } from "./service";

/** Mirrors lib/reviews/http.ts's reviewMutation exactly: auth, same-origin, size-bounded JSON, then a rate-limited write. */
export async function partialReturnMutation(request: Request, write: (userId: string, input: unknown) => Promise<unknown>, status = 200) {
  try {
    const session = await getCustomerSession();
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin)) {
      return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
    }
    const invalid = rejectInvalidJsonRequest(request, 16 * 1024);
    if (invalid) return invalid;
    const limited = await enforceApiRateLimit(request, "partial-return-request", { limit: 10, windowMs: 15 * 60_000 }, session.user.id);
    if (limited) return limited;
    const reader = request.body?.getReader();
    if (!reader) throw new PartialReturnError("A JSON return request is required.", 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16 * 1024) { await reader.cancel(); throw new PartialReturnError("Request body is too large.", 413); }
      chunks.push(value);
    }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new PartialReturnError("Invalid JSON.", 400); }
    const result = await write(session.user.id, input);
    return Response.json(result as object, { status, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof PartialReturnError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[order-returns] Request failed", error);
    return Response.json({ error: "Returns are temporarily unavailable. Please try again." }, { status: 503 });
  }
}
