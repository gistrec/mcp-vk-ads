#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VkAdsClient } from "./client.js";
import { loadConfig } from "./config.js";
import { registerAccountTools } from "./tools/account.js";
import { registerAdPlanTools } from "./tools/adPlans.js";
import { registerAdGroupTools } from "./tools/adGroups.js";
import { registerBannerTools } from "./tools/banners.js";
import { registerStatisticsTools } from "./tools/statistics.js";
import { registerRawTool } from "./tools/raw.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new VkAdsClient(config);

  const server = new McpServer({
    name: "mcp-vk-ads",
    version: "1.0.0",
  });

  registerAccountTools(server, client);
  registerAdPlanTools(server, client);
  registerAdGroupTools(server, client);
  registerBannerTools(server, client);
  registerStatisticsTools(server, client);
  registerRawTool(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-vk-ads running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-vk-ads:", err);
  process.exit(1);
});
