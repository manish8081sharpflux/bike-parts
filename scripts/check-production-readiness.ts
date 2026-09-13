async function main() {
  process.loadEnvFile?.(".env.local");
  const { checkProductionReadiness } = await import("@/lib/security/production-config");
  const checks = checkProductionReadiness(process.env);
  for (const check of checks) console.log(`${check.ok ? "✓" : "✗"} ${check.message}`);
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

void main();
