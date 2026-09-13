async function main() {
  process.loadEnvFile?.(".env.local");
  const { checkProductionReadiness } = await import("@/lib/security/production-config");
  const checks = checkProductionReadiness(process.env);

  for (const check of checks) {
    // Required: pass/fail (✓/✗). Optional: configured-or-not is informational only (✓/⚠) — it never fails readiness.
    const symbol = check.required ? (check.ok ? "✓" : "✗") : check.configured ? "✓" : "⚠";
    console.log(`${symbol} ${check.message}`);
  }

  const hasRequiredFailure = checks.some((check) => check.required && !check.ok);
  if (hasRequiredFailure) process.exitCode = 1;
}

void main();
