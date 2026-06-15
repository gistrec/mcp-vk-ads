import { test } from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { VkAdsClient } from "../client.js";
import { isReadMethod, registerRawTool } from "./raw.js";

type Handler = (args: Record<string, unknown>) => Promise<CallToolResult>;

function captureRawTool(client: VkAdsClient): Handler {
  let handler: Handler | undefined;
  const server = {
    registerTool: (_name: string, _def: unknown, h: Handler) => {
      handler = h;
    },
  } as unknown as McpServer;
  registerRawTool(server, client);
  if (!handler) throw new Error("raw_request was not registered");
  return handler;
}

function text(result: CallToolResult): string {
  return (result.content[0] as { text: string }).text;
}

test("isReadMethod is true only for GET", () => {
  assert.equal(isReadMethod("GET"), true);
  assert.equal(isReadMethod("get"), true);
  assert.equal(isReadMethod("POST"), false);
  assert.equal(isReadMethod("DELETE"), false);
});

test("raw_request blocks a POST without confirmWrite", async () => {
  const calls: unknown[][] = [];
  const client = {
    request: async (...args: unknown[]) => {
      calls.push(args);
      return {};
    },
  } as unknown as VkAdsClient;

  const raw = captureRawTool(client);
  const result = await raw({ path: "v2/ad_plans/1.json", method: "POST", body: { status: "blocked" } });

  assert.equal(result.isError, true);
  assert.match(text(result), /confirmWrite=true/);
  assert.equal(calls.length, 0);
});

test("raw_request runs a POST when confirmWrite is true", async () => {
  const calls: unknown[][] = [];
  const client = {
    request: async (...args: unknown[]) => {
      calls.push(args);
      return { ok: true };
    },
  } as unknown as VkAdsClient;

  const raw = captureRawTool(client);
  const result = await raw({ path: "v2/ad_plans.json", method: "POST", body: { name: "X" }, confirmWrite: true });

  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "POST");
});

test("raw_request runs a GET without confirmWrite", async () => {
  const calls: unknown[][] = [];
  const client = {
    request: async (...args: unknown[]) => {
      calls.push(args);
      return { count: 0, items: [] };
    },
  } as unknown as VkAdsClient;

  const raw = captureRawTool(client);
  const result = await raw({ path: "v2/ad_plans.json" });

  assert.equal(result.isError, undefined);
  assert.equal(calls[0][0], "GET");
});
