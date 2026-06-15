#!/usr/bin/env node
// Read-only smoke check against the configured VK Ads account.
// Run locally with your own token in the environment — it makes no writes.
import { VkAdsClient } from "./client.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new VkAdsClient(config);
  console.log("VK Ads smoke check (read-only)\n");

  const user = await client.get<{ id?: number; username?: string; additional_info?: { client_name?: string } }>(
    "v3/user.json",
    { fields: "id,username,additional_info" },
  );
  const name = user.additional_info?.client_name ?? "?";
  console.log(`account:   ${user.username ?? "?"} (id ${user.id ?? "?"}, ${name})`);

  const throttling = await client.get<Record<string, unknown>>("v2/throttling.json");
  console.log(`throttling: ${JSON.stringify(throttling)}`);

  const plans = await client.get<{ count?: number; items?: { id: number; name?: string }[] }>(
    "v2/ad_plans.json",
    { fields: "id,name,status", limit: 5 },
  );
  const list = plans.items ?? [];
  console.log(`ad_plans:  ${list.length} of ${plans.count ?? "?"} returned`);
  for (const plan of list) console.log(`           - [${plan.id}] ${plan.name ?? ""}`);

  console.log("\nSmoke check passed.");
}

main().catch((err) => {
  console.error(`\nSmoke check FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
