import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { VkAdsClient } from "../client.js";
import { compact, csv, fail, isoDate, ok } from "./util.js";

const ENTITIES = ["ad_plans", "ad_groups", "banners"] as const;
const PERIODS = ["day", "week", "month", "summary"] as const;

export function registerStatisticsTools(server: McpServer, client: VkAdsClient): void {
  server.registerTool(
    "get_statistics",
    {
      title: "Get statistics",
      description:
        "Fetches performance statistics from the VK Ads v3 statistics service for ad plans, ad groups or banners. Returns JSON with per-object `rows` (per period) and `total`; metrics live under `base` (shows, clicks, spent, ...). Spent is in account currency.",
      inputSchema: {
        entity: z.enum(ENTITIES).optional().describe("Object type to report on. Default banners."),
        period: z
          .enum(PERIODS)
          .optional()
          .describe("Grouping: day, week, month or summary (whole range). Default day."),
        ids: z
          .array(z.number().int())
          .optional()
          .describe("Limit the report to these object ids (of the chosen entity)."),
        dateFrom: isoDate.optional().describe("Start date YYYY-MM-DD (required for day/week/month)."),
        dateTo: isoDate.optional().describe("End date YYYY-MM-DD (required for day/week/month)."),
        metrics: z
          .array(z.string())
          .optional()
          .describe("Metric groups to include, e.g. base, events, video. Defaults to the API default."),
        limit: z.number().int().min(1).max(250).optional().describe("Max objects per page (<=250)."),
        offset: z.number().int().min(0).optional().describe("Pagination offset (objects to skip)."),
        autoPaginate: z.boolean().optional().describe("Fetch all pages by following offset/count."),
      },
    },
    async ({ entity, period, ids, dateFrom, dateTo, metrics, limit, offset, autoPaginate }) => {
      try {
        const ent = entity ?? "banners";
        const grp = period ?? "day";
        if (grp !== "summary" && (!dateFrom || !dateTo)) {
          return fail(`The "${grp}" grouping requires both dateFrom and dateTo (YYYY-MM-DD).`);
        }
        const path = `v3/statistics/${ent}/${grp}.json`;
        const query = compact({
          id: csv(ids),
          date_from: dateFrom,
          date_to: dateTo,
          metrics: csv(metrics),
          limit,
          offset,
        });
        const result = autoPaginate ? await client.getAll(path, query) : await client.get(path, query);
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
