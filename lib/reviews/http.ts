import { getCustomerSession } from "@/lib/auth/customer-session";
import { enforceApiRateLimit, rejectInvalidJsonRequest } from "@/lib/security/api-protection";
import { ReviewError } from "./service";

export async function reviewMutation(request: Request, write: (userId: string, input: unknown) => Promise<unknown>, status = 200) {
  try {
    const session = await getCustomerSession();
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin)) {
      return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
    }
    const invalid = rejectInvalidJsonRequest(request, 16 * 1024);
    if (invalid) return invalid;
    const limited = await enforceApiRateLimit(request, "product-review", { limit: 30, windowMs: 15 * 60_000 }, session.user.id);
    if (limited) return limited;
    // Bound actual bytes too, including chunked requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new ReviewError("A JSON review is required.", 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16 * 1024) { await reader.cancel(); throw new ReviewError("Request body is too large.", 413); }
      chunks.push(value);
    }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new ReviewError("Invalid JSON.", 400); }
    const review = await write(session.user.id, input);
    return Response.json({ review }, { status, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return reviewErrorResponse(error); }
}

export function reviewErrorResponse(error: unknown) {
  if (error instanceof ReviewError) return Response.json({ error: error.message }, { status: error.status });
  console.error("[reviews] Request failed", error);
  return Response.json({ error: "Reviews are temporarily unavailable. Please try again." }, { status: 503 });
}
