const appUrl = process.env.APP_URL ?? "http://localhost:3000";

async function main() {
  const response = await fetch(`${appUrl}/api/platform/health`, {
    cache: "no-store",
  });
  const payload = await response.json();

  console.log(JSON.stringify(payload, null, 2));

  if (!response.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
