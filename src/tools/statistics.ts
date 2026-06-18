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
        "Fetches performance statistics from the VK Ads v3 statistics service for ad plans, ad groups or banners. By default the grouping is `summary` — one aggregated row per object over the whole period; use day/week/month ONLY for daily dynamics or trend questions (each adds a row per object per period). Rank objects server-side with sortBy (e.g. base.spent) + order; the response also carries `total` — the summary across ALL objects for the period (use it for «сколько всего», no need to sum rows). Metrics live under `base` (shows, clicks, spent, ...); spent is in account currency.",
      inputSchema: {
        entity: z.enum(ENTITIES).optional().describe("Object type to report on. Default banners."),
        period: z
          .enum(PERIODS)
          .optional()
          .describe("Grouping: summary (whole range, default), or day/week/month for trends."),
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
        sortBy: z
          .string()
          .optional()
          .describe("Server-side sort field, e.g. base.spent / base.clicks / base.shows (top-N by metric)."),
        order: z.enum(["asc", "desc"]).optional().describe("Sort direction for sortBy. Default desc."),
        limit: z.number().int().min(1).max(250).optional().describe("Max objects per page (<=250)."),
        offset: z.number().int().min(0).optional().describe("Pagination offset (objects to skip)."),
        autoPaginate: z.boolean().optional().describe("Fetch all pages by following offset/count."),
      },
    },
    async ({ entity, period, ids, dateFrom, dateTo, metrics, sortBy, order, limit, offset, autoPaginate }) => {
      try {
        const ent = entity ?? "banners";
        const grp = period ?? "summary";
        if (grp !== "summary" && (!dateFrom || !dateTo)) {
          return fail(`The "${grp}" grouping requires both dateFrom and dateTo (YYYY-MM-DD).`);
        }
        const path = `v3/statistics/${ent}/${grp}.json`;
        const query = compact({
          id: csv(ids),
          date_from: dateFrom,
          date_to: dateTo,
          metrics: csv(metrics),
          sort_by: sortBy,
          d: order, // VK direction param (asc|desc); passing sort_by selects v3 sorting
          limit,
          offset,
        });
        const result = autoPaginate ? await client.getAll(path, query) : await client.get(path, query);
        // fail-loud: явный фильтр по ids, но 0 объектов — почти всегда неверный id/период.
        // Пустой ответ провоцирует модель снять фильтр; явная ошибка заставляет его починить.
        const items = (result as { items?: unknown[] } | undefined)?.items;
        if (ids?.length && Array.isArray(items) && items.length === 0) {
          return fail(
            `Statistics returned 0 objects for ids [${ids.join(", ")}] (entity ${ent}, grouping ${grp}). ` +
              "Check the ids and the date range — do not broaden the filter blindly.",
          );
        }
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
