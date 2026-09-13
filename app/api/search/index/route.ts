import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/auth/require-admin";
import { ensureSearchIndexSettings, isMeilisearchConfigured, pingMeilisearch } from "@/lib/search/meilisearch-http";

/**
 * Admin-only, POST-only. Applies the index's searchable/filterable/sortable
 * settings (creating the index if it doesn't exist yet) — it deliberately
 * never seeds or bulk-writes documents. A full document rebuild from the
 * live database is a scripted, operational task instead (see
 * scripts/reindex-meilisearch.ts and Fix 8 item 9) rather than something a
 * public/admin HTTP call can trigger.
 */
export async function POST() {
  const email = await getAdminEmail();
  if (!email) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const result = await ensureSearchIndexSettings();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

/** Read-only status check — GET must never mutate the index. */
export async function GET() {
  const email = await getAdminEmail();
  if (!email) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const online = await pingMeilisearch();
  return NextResponse.json({ configured: isMeilisearchConfigured(), online });
}
