import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HttpMethod } from "../client.js";
import type { VkAdsClient } from "../client.js";
import { fail, ok } from "./util.js";

/** Only GET reads data; POST and DELETE mutate the account. */
export function isReadMethod(method: string): boolean {
  return method.toUpperCase() === "GET";
}

export function registerRawTool(server: McpServer, client: VkAdsClient): void {
  server.registerTool(
    "raw_request",
    {
      title: "Raw VK Ads API call",
      description:
        'Escape hatch to call any VK Ads API endpoint directly (e.g. path "v2/ad_plans.json", method GET). Use this for endpoints that have no dedicated tool. `query` becomes the query string; `body` is sent as JSON for POST. GET runs freely; POST and DELETE are writes and require confirmWrite=true.',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe('Versioned endpoint path, e.g. "v2/ad_plans.json", "v3/statistics/banners/day.json".'),
        method: z.enum(["GET", "POST", "DELETE"]).optional().describe("HTTP method. Default GET."),
        query: z
          .record(z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe("Query string parameters (filters, fields, pagination)."),
        body: z.record(z.any()).optional().describe("JSON body for POST requests."),
        confirmWrite: z
          .boolean()
          .optional()
          .describe("Must be true for a write (POST or DELETE)."),
      },
    },
    async ({ path, method, query, body, confirmWrite }) => {
      try {
        const m = (method ?? "GET") as HttpMethod;
        if (!isReadMethod(m) && confirmWrite !== true) {
          return fail(
            `"${m} ${path}" is a write operation. Re-run with confirmWrite=true to proceed.`,
          );
        }
        const result = await client.request(m, path, { query, body });
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
