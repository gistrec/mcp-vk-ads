import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { VkAdsClient } from "../client.js";
import { ACTION_TO_STATUS, compact, csv, fail, isoDate, ok, setStatusForIds } from "./util.js";

const DEFAULT_FIELDS = [
  "id",
  "name",
  "status",
  "ad_plan_id",
  "autobidding_mode",
  "budget_limit",
  "budget_limit_day",
  "date_start",
  "date_end",
  "delivery",
  "issues",
  "max_price",
  "objective",
  "price",
  "created",
  "updated",
];

export function registerAdGroupTools(server: McpServer, client: VkAdsClient): void {
  server.registerTool(
    "list_ad_groups",
    {
      title: "List ad groups",
      description:
        "Lists ad groups with optional filtering by id, parent ad plan and status. Money fields are in the account currency; `targetings` holds the geo/demographic/interest targeting structure.",
      inputSchema: {
        ids: z.array(z.number().int()).optional().describe("Filter by ad group ids."),
        adPlanIds: z.array(z.number().int()).optional().describe("Filter by parent ad plan ids."),
        statuses: z
          .array(z.enum(["active", "blocked", "deleted"]))
          .optional()
          .describe("Filter by status."),
        fields: z
          .array(z.string())
          .optional()
          .describe("Ad group fields to return (add \"targetings\" for the full targeting object)."),
        limit: z.number().int().min(1).max(250).optional().describe("Max objects per page (<=250)."),
        offset: z.number().int().min(0).optional().describe("Pagination offset (objects to skip)."),
        autoPaginate: z
          .boolean()
          .optional()
          .describe("Fetch all pages by following offset/count (ignores limit as a total cap)."),
      },
    },
    async ({ ids, adPlanIds, statuses, fields, limit, offset, autoPaginate }) => {
      try {
        const query = compact({
          fields: (fields?.length ? fields : DEFAULT_FIELDS).join(","),
          _id__in: csv(ids),
          _ad_plan_id__in: csv(adPlanIds),
          _status__in: csv(statuses),
          limit,
          offset,
        });
        const result = autoPaginate
          ? await client.getAll("v2/ad_groups.json", query)
          : await client.get("v2/ad_groups.json", query);
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "create_ad_group",
    {
      title: "Create ad group",
      description:
        "Creates an ad group inside an ad plan. Targeting goes in `targetings` (e.g. {\"geo\":{\"regions\":[188]},\"age\":{\"age_list\":[25,26]}}). Money fields are in account currency. Use `extra` for any other field.",
      inputSchema: {
        adPlanId: z.number().int().describe("Parent ad plan id."),
        name: z.string().min(1).describe("Ad group name."),
        objective: z
          .string()
          .optional()
          .describe("Group objective, e.g. site_conversions, leadads, traffic."),
        autobiddingMode: z.string().optional().describe("Auction strategy, e.g. max_goals."),
        budgetLimit: z.number().positive().optional().describe("Total budget in account currency."),
        budgetLimitDay: z.number().positive().optional().describe("Daily budget in account currency."),
        maxPrice: z.number().positive().optional().describe("Bid cap in account currency."),
        price: z.number().positive().optional().describe("Price per optimized event, in account currency."),
        dateStart: isoDate.optional().describe("Start date YYYY-MM-DD."),
        dateEnd: isoDate.optional().describe("End date YYYY-MM-DD."),
        targetings: z.record(z.any()).optional().describe("Targeting structure, sent verbatim."),
        extra: z.record(z.any()).optional().describe("Extra fields merged into the body verbatim."),
      },
    },
    async (args) => {
      try {
        const body = compact({
          ad_plan_id: args.adPlanId,
          name: args.name,
          objective: args.objective,
          autobidding_mode: args.autobiddingMode,
          budget_limit: args.budgetLimit,
          budget_limit_day: args.budgetLimitDay,
          max_price: args.maxPrice,
          price: args.price,
          date_start: args.dateStart,
          date_end: args.dateEnd,
          targetings: args.targetings,
          ...args.extra,
        });
        const result = await client.post("v2/ad_groups.json", body);
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "update_ad_group",
    {
      title: "Update ad group",
      description:
        "Updates an ad group's name, budgets, bid cap, dates or targeting. Money fields are in account currency. Use ad_group_action to change status.",
      inputSchema: {
        id: z.number().int().describe("Ad group id to update."),
        name: z.string().min(1).optional().describe("New name."),
        budgetLimit: z.number().positive().optional().describe("Total budget in account currency."),
        budgetLimitDay: z.number().positive().optional().describe("Daily budget in account currency."),
        maxPrice: z.number().positive().optional().describe("Bid cap in account currency."),
        dateEnd: isoDate.optional().describe("New end date YYYY-MM-DD."),
        targetings: z.record(z.any()).optional().describe("Replacement targeting structure, sent verbatim."),
        extra: z.record(z.any()).optional().describe("Extra fields merged into the body verbatim."),
      },
    },
    async ({ id, name, budgetLimit, budgetLimitDay, maxPrice, dateEnd, targetings, extra }) => {
      try {
        const body = compact({
          name,
          budget_limit: budgetLimit,
          budget_limit_day: budgetLimitDay,
          max_price: maxPrice,
          date_end: dateEnd,
          targetings,
          ...extra,
        });
        if (Object.keys(body).length === 0) {
          return fail("Provide at least one field to update.");
        }
        const result = await client.post(`v2/ad_groups/${id}.json`, body);
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "ad_group_action",
    {
      title: "Ad group action",
      description:
        "Changes the lifecycle status of ad groups by id: activate (status=active), stop (status=blocked) or delete (status=deleted).",
      inputSchema: {
        action: z.enum(["activate", "stop", "delete"]),
        ids: z.array(z.number().int()).min(1).describe("Ad group ids to act on."),
      },
    },
    async ({ action, ids }) => {
      try {
        return await setStatusForIds(client, "ad_groups", ids, ACTION_TO_STATUS[action]);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
