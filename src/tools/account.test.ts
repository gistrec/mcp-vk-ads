import { test } from "node:test";
import assert from "node:assert/strict";
import { registerAccountTools } from "./account.js";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;

/** Fake server + mock client (getAll) so the handler runs without network. */
function harness(regions: Array<{ id: number; name: string; type: string }>) {
  let getAllCalls = 0;
  const getAllArgs: unknown[][] = [];
  const client = {
    get: async () => ({}),
    getAll: async (...args: unknown[]) => {
      getAllCalls++;
      getAllArgs.push(args);
      return { count: regions.length, items: regions };
    },
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerAccountTools(server as never, client as never);
  return { tools, getAllCalls: () => getAllCalls, getAllArgs };
}

test("get_regions caches the dictionary and does not re-fetch on the second call", async () => {
  const regions = [
    { id: 1, name: "Москва", type: "region" },
    { id: 2, name: "Санкт-Петербург", type: "region" },
  ];
  const { tools, getAllCalls } = harness(regions);

  const first = await tools.get_regions({ query: "москва" });
  assert.match(first.content[0].text, /Москва/);
  assert.equal(getAllCalls(), 1);

  // Second call is served from cache — the region dictionary is static per process.
  const second = await tools.get_regions({});
  assert.match(second.content[0].text, /Санкт-Петербург/);
  assert.equal(getAllCalls(), 1);
});

test("get_regions fetches the FULL dictionary (opts out of the MAX_AUTO_ITEMS cap)", async () => {
  const { tools, getAllArgs } = harness([{ id: 1, name: "Москва", type: "region" }]);
  await tools.get_regions({});
  // getAll(path, query, maxPages, maxItems) — the 4th arg lifts the item cap so a
  // dictionary larger than MAX_AUTO_ITEMS is not silently truncated for local search.
  assert.equal(getAllArgs[0][0], "v2/regions.json");
  assert.equal(getAllArgs[0][3], Number.POSITIVE_INFINITY);
});
