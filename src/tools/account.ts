import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { VkAdsClient } from "../client.js";
import { fail, ok, READ_ONLY } from "./util.js";

export function registerAccountTools(server: McpServer, client: VkAdsClient): void {
  server.registerTool(
    "get_user_info",
    {
      title: "Get account info",
      annotations: READ_ONLY,
      description:
        "Returns information about the current VK Ads account (user.json), including additional_info.client_name. Use it to confirm which advertiser account the token points at.",
      inputSchema: {
        fields: z
          .array(z.string())
          .optional()
          .describe("User fields to return. Defaults to a common set."),
      },
    },
    async ({ fields }) => {
      try {
        const result = await client.get("v3/user.json", {
          fields: (fields?.length ? fields : ["id", "username", "additional_info"]).join(","),
        });
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_throttling",
    {
      title: "Get API rate limits",
      annotations: READ_ONLY,
      description:
        "Returns the current VK Ads request limits and remaining budget (throttling.json), so you can avoid hitting the rate limit.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.get("v2/throttling.json");
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_regions",
    {
      title: "Get regions",
      annotations: READ_ONLY,
      description:
        "Lists VK Ads geo regions (id, name, type), optionally filtered by a name substring. Region ids are needed for ad group geo targeting.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe("Case-insensitive substring to filter region names (e.g. \"Москва\")."),
        limit: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Max regions to return after filtering. Default 50."),
      },
    },
    async ({ query, limit }) => {
      try {
        const { items } = await client.getAll<{ id: number; name: string; type: string }>(
          "v2/regions.json",
          { fields: "id,name,type" },
        );
        const needle = query?.trim().toLowerCase();
        const filtered = needle
          ? items.filter((r) => typeof r.name === "string" && r.name.toLowerCase().includes(needle))
          : items;
        return ok(filtered.slice(0, limit ?? 50));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
