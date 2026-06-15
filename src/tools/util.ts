import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { VkAdsClient } from "../client.js";

/** A date in YYYY-MM-DD form, validated before the request reaches the API. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a date in YYYY-MM-DD format");

export function ok(data: unknown): CallToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

export function fail(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/** Drops keys whose value is `undefined` so they are not sent to the API. */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

/** Joins a list into a comma-separated filter value, or undefined when empty. */
export function csv(values?: Array<string | number>): string | undefined {
  return values && values.length ? values.join(",") : undefined;
}

/** Lifecycle status of an ad plan / group / banner that the API lets you set. */
export const SETTABLE_STATUS = ["active", "blocked", "deleted"] as const;

/** Maps a friendly action verb to the VK Ads status it sets. */
export const ACTION_TO_STATUS = {
  activate: "active",
  stop: "blocked",
  delete: "deleted",
} as const;

export type EntityAction = keyof typeof ACTION_TO_STATUS;

/**
 * Applies a status change to many objects of one entity. VK Ads mutates a
 * single object per POST to `{entity}/{id}.json`, so this loops and reports a
 * per-id outcome, flagging the result as an error if any object failed.
 */
export async function setStatusForIds(
  client: VkAdsClient,
  entity: "ad_plans" | "ad_groups" | "banners",
  ids: number[],
  status: string,
): Promise<CallToolResult> {
  const results: Array<{ id: number; ok: boolean; error?: string }> = [];
  let failed = 0;
  for (const id of ids) {
    try {
      await client.post(`v2/${entity}/${id}.json`, { status });
      results.push({ id, ok: true });
    } catch (e) {
      failed++;
      results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const body = JSON.stringify(results, null, 2);
  if (failed === 0) return ok(body);
  return {
    content: [{ type: "text", text: `${failed} of ${ids.length} object(s) failed:\n${body}` }],
    isError: true,
  };
}
