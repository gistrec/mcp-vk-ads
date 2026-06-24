import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { VkAdsClient } from "../client.js";
import { ACTION_TO_STATUS, compact, csv, fail, isoDate, ok, READ_ONLY, setStatusForIds, WRITE_CREATE, WRITE_DELETE, WRITE_UPDATE } from "./util.js";

const DEFAULT_FIELDS = [
  "id",
  "name",
  "status",
  "vkads_status",
  "autobidding_mode",
  "budget_limit",
  "budget_limit_day",
  "date_start",
  "date_end",
  "max_price",
  "objective",
  "created",
  "updated",
];

export function registerAdPlanTools(server: McpServer, client: VkAdsClient): void {
  server.registerTool(
    "list_ad_plans",
    {
      title: "List ad plans (campaigns)",
      annotations: READ_ONLY,
      description:
        "Lists ad plans (the top-level VK Ads campaign object) with optional filtering by id and status. Money fields (budget_limit, budget_limit_day, max_price) are in the account currency.",
      inputSchema: {
        ids: z.array(z.number().int()).optional().describe("Filter by ad plan ids."),
        statuses: z
          .array(z.enum(["active", "blocked", "deleted"]))
          .optional()
          .describe("Filter by status."),
        fields: z.array(z.string()).optional().describe("Ad plan fields to return."),
        limit: z.number().int().min(1).max(250).optional().describe("Max objects per page (<=250)."),
        offset: z.number().int().min(0).optional().describe("Pagination offset (objects to skip)."),
        autoPaginate: z
          .boolean()
          .optional()
          .describe("Fetch all pages by following offset/count (ignores limit as a total cap)."),
      },
    },
    async ({ ids, statuses, fields, limit, offset, autoPaginate }) => {
      try {
        const query = compact({
          fields: (fields?.length ? fields : DEFAULT_FIELDS).join(","),
          _id__in: csv(ids),
          _status__in: csv(statuses),
          limit,
          offset,
        });
        const result = autoPaginate
          ? await client.getAll("v2/ad_plans.json", query)
          : await client.get("v2/ad_plans.json", query);
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "create_ad_plan",
    {
      title: "Create ad plan (campaign)",
      annotations: WRITE_CREATE,
      description:
        "Creates an ad plan (campaign). Money fields are in account currency. Pass complex or less common fields via `extra` (merged into the request body verbatim).",
      inputSchema: {
        name: z.string().min(1).describe("Ad plan name."),
        objective: z
          .string()
          .optional()
          .describe("Campaign objective, e.g. site_conversions, leadads, traffic."),
        autobiddingMode: z
          .string()
          .optional()
          .describe("Auction strategy, e.g. max_goals, fixed, second_price_mean."),
        budgetLimit: z.number().positive().optional().describe("Total budget in account currency."),
        budgetLimitDay: z.number().positive().optional().describe("Daily budget in account currency."),
        maxPrice: z.number().positive().optional().describe("Bid cap in account currency."),
        dateStart: isoDate.optional().describe("Start date YYYY-MM-DD."),
        dateEnd: isoDate.optional().describe("End date YYYY-MM-DD."),
        extra: z
          .record(z.any())
          .optional()
          .describe("Extra ad plan fields merged into the body (e.g. priced_goal, pricelist_id)."),
      },
    },
    async ({ name, objective, autobiddingMode, budgetLimit, budgetLimitDay, maxPrice, dateStart, dateEnd, extra }) => {
      try {
        const body = compact({
          name,
          objective,
          autobidding_mode: autobiddingMode,
          budget_limit: budgetLimit,
          budget_limit_day: budgetLimitDay,
          max_price: maxPrice,
          date_start: dateStart,
          date_end: dateEnd,
          ...extra,
        });
        const result = await client.post("v2/ad_plans.json", body);
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "update_ad_plan",
    {
      title: "Update ad plan (campaign)",
      annotations: WRITE_UPDATE,
      description:
        "Updates an ad plan's name, budgets, bid cap or dates. Money fields are in account currency. Use ad_plan_action to change status.",
      inputSchema: {
        id: z.number().int().describe("Ad plan id to update."),
        name: z.string().min(1).optional().describe("New name."),
        budgetLimit: z.number().positive().optional().describe("Total budget in account currency."),
        budgetLimitDay: z.number().positive().optional().describe("Daily budget in account currency."),
        maxPrice: z.number().positive().optional().describe("Bid cap in account currency."),
        dateEnd: isoDate.optional().describe("New end date YYYY-MM-DD."),
        extra: z.record(z.any()).optional().describe("Extra fields merged into the body verbatim."),
      },
    },
    async ({ id, name, budgetLimit, budgetLimitDay, maxPrice, dateEnd, extra }) => {
      try {
        const body = compact({
          name,
          budget_limit: budgetLimit,
          budget_limit_day: budgetLimitDay,
          max_price: maxPrice,
          date_end: dateEnd,
          ...extra,
        });
        if (Object.keys(body).length === 0) {
          return fail("Provide at least one field to update.");
        }
        const result = await client.post(`v2/ad_plans/${id}.json`, body);
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "ad_plan_action",
    {
      title: "Ad plan action",
      annotations: WRITE_DELETE,
      description:
        "Changes the lifecycle status of ad plans by id: activate (status=active), stop (status=blocked) or delete (status=deleted).",
      inputSchema: {
        action: z.enum(["activate", "stop", "delete"]),
        ids: z.array(z.number().int()).min(1).describe("Ad plan ids to act on."),
      },
    },
    async ({ action, ids }) => {
      try {
        return await setStatusForIds(client, "ad_plans", ids, ACTION_TO_STATUS[action]);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
