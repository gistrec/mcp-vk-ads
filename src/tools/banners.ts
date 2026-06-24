import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { VkAdsClient } from "../client.js";
import { ACTION_TO_STATUS, compact, csv, fail, ok, READ_ONLY, setStatusForIds, WRITE_CREATE, WRITE_DELETE, WRITE_UPDATE } from "./util.js";

const DEFAULT_FIELDS = [
  "id",
  "name",
  "status",
  "ad_group_id",
  "delivery",
  "issues",
  "moderation_status",
  "moderation_reasons",
  "textblocks",
  "urls",
  "content",
  "ord_marker",
  "created",
  "updated",
];

export function registerBannerTools(server: McpServer, client: VkAdsClient): void {
  server.registerTool(
    "list_banners",
    {
      title: "List banners (ads)",
      annotations: READ_ONLY,
      description:
        "Lists banners (the VK Ads creative/ad object) with optional filtering by id, parent ad group and status. moderation_status (pending/allowed/banned) and delivery show why an ad is or isn't showing.",
      inputSchema: {
        ids: z.array(z.number().int()).optional().describe("Filter by banner ids."),
        adGroupIds: z.array(z.number().int()).optional().describe("Filter by parent ad group ids."),
        statuses: z
          .array(z.enum(["active", "blocked", "deleted"]))
          .optional()
          .describe("Filter by status."),
        fields: z.array(z.string()).optional().describe("Banner fields to return."),
        limit: z.number().int().min(1).max(250).optional().describe("Max objects per page (<=250)."),
        offset: z.number().int().min(0).optional().describe("Pagination offset (objects to skip)."),
        autoPaginate: z
          .boolean()
          .optional()
          .describe("Fetch all pages by following offset/count (ignores limit as a total cap)."),
      },
    },
    async ({ ids, adGroupIds, statuses, fields, limit, offset, autoPaginate }) => {
      try {
        const query = compact({
          fields: (fields?.length ? fields : DEFAULT_FIELDS).join(","),
          _id__in: csv(ids),
          _ad_group_id__in: csv(adGroupIds),
          _status__in: csv(statuses),
          limit,
          offset,
        });
        const result = autoPaginate
          ? await client.getAll("v2/banners.json", query)
          : await client.get("v2/banners.json", query);
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "create_banner",
    {
      title: "Create banner (ad)",
      annotations: WRITE_CREATE,
      description:
        "Creates a banner inside an ad group. Creative content references uploaded media via `content`, ad copy goes in `textblocks` and links in `urls`. These structures are sent verbatim; consult the VK Ads docs for the exact shape per ad format.",
      inputSchema: {
        adGroupId: z.number().int().describe("Parent ad group id."),
        name: z.string().min(1).optional().describe("Banner name."),
        textblocks: z
          .record(z.any())
          .optional()
          .describe("Text blocks, e.g. {\"title\":{\"text\":\"...\"},\"text\":{\"text\":\"...\"}}."),
        urls: z.record(z.any()).optional().describe("Link objects, e.g. {\"primary\":{\"url\":\"https://...\"}}."),
        content: z.record(z.any()).optional().describe("Creative content references (uploaded media ids)."),
        extra: z.record(z.any()).optional().describe("Extra banner fields merged into the body verbatim."),
      },
    },
    async ({ adGroupId, name, textblocks, urls, content, extra }) => {
      try {
        const body = compact({
          ad_group_id: adGroupId,
          name,
          textblocks,
          urls,
          content,
          ...extra,
        });
        const result = await client.post("v2/banners.json", body);
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "update_banner",
    {
      title: "Update banner (ad)",
      annotations: WRITE_UPDATE,
      description:
        "Updates a banner's name, text blocks or links. Use banner_action to change status. Structures are sent verbatim.",
      inputSchema: {
        id: z.number().int().describe("Banner id to update."),
        name: z.string().min(1).optional().describe("New name."),
        textblocks: z.record(z.any()).optional().describe("Replacement text blocks, sent verbatim."),
        urls: z.record(z.any()).optional().describe("Replacement link objects, sent verbatim."),
        extra: z.record(z.any()).optional().describe("Extra fields merged into the body verbatim."),
      },
    },
    async ({ id, name, textblocks, urls, extra }) => {
      try {
        const body = compact({ name, textblocks, urls, ...extra });
        if (Object.keys(body).length === 0) {
          return fail("Provide at least one field to update.");
        }
        const result = await client.post(`v2/banners/${id}.json`, body);
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "banner_action",
    {
      title: "Banner action",
      annotations: WRITE_DELETE,
      description:
        "Changes the lifecycle status of banners by id: activate (status=active), stop (status=blocked) or delete (status=deleted).",
      inputSchema: {
        action: z.enum(["activate", "stop", "delete"]),
        ids: z.array(z.number().int()).min(1).describe("Banner ids to act on."),
      },
    },
    async ({ action, ids }) => {
      try {
        return await setStatusForIds(client, "banners", ids, ACTION_TO_STATUS[action]);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
