// Launches the self-hosted Meilisearch binary (infra/meilisearch/meilisearch.exe)
// with the master key from .env.local — the Windows equivalent of `pnpm
// typesense:up`, but a native binary instead of Docker (Typesense has no
// Windows binary; this machine has neither Docker nor WSL set up for it).
//
// Usage: pnpm meilisearch:up
import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

try {
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile(".env");
  } catch {}
}

const binPath = path.join(process.cwd(), "infra", "meilisearch", "meilisearch.exe");
if (!existsSync(binPath)) {
  console.error(
    `Meilisearch binary not found at ${binPath}.\n` +
      "Download it first:\n" +
      '  Invoke-WebRequest -Uri "https://github.com/meilisearch/meilisearch/releases/latest/download/meilisearch-windows-amd64.exe" -OutFile "infra\\meilisearch\\meilisearch.exe"'
  );
  process.exit(1);
}

const masterKey = process.env.MEILISEARCH_API_KEY;
if (!masterKey) {
  console.error("Set MEILISEARCH_API_KEY in .env.local first.");
  process.exit(1);
}

const port = process.env.MEILISEARCH_PORT ?? "7700";
const child = spawn(
  binPath,
  [
    "--master-key",
    masterKey,
    "--db-path",
    path.join("infra", "meilisearch", "data.ms"),
    "--http-addr",
    `127.0.0.1:${port}`,
    "--no-analytics",
  ],
  { stdio: "inherit" }
);

child.on("exit", (code) => process.exit(code ?? 0));
