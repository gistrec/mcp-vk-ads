import type { VkAdsConfig } from "./types.js";
import { VkAdsError } from "./types.js";

export type HttpMethod = "GET" | "POST" | "DELETE";

/** A query string value; undefined and empty-string values are dropped. */
export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
}

/** A VK Ads list response: a page of `items` plus the total `count`. */
export interface ListPage<T = unknown> {
  count: number;
  items: T[];
}

/** Largest page size the VK Ads list endpoints accept. */
export const MAX_PAGE_LIMIT = 250;

export class VkAdsClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;

  constructor(private readonly config: VkAdsConfig) {
    // Normalize to a trailing slash so relative paths ("v2/ad_plans.json") resolve.
    this.base = config.apiBase.endsWith("/") ? config.apiBase : config.apiBase + "/";
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseMs = config.retryBaseMs ?? 500;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.token}`,
      "Accept-Language": this.config.lang,
      ...extra,
    };
  }

  /** Backoff before a retry: honors Retry-After when present, else exponential (capped at 30s). */
  private backoffMs(attempt: number, res?: Response): number {
    const retryAfter = res ? Number(res.headers.get("Retry-After")) : NaN;
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, 30) * 1000;
    return Math.min(this.retryBaseMs * 2 ** attempt, 30_000);
  }

  /** fetch with an AbortController timeout so a hung connection can't hang the tool forever. */
  private async fetchWithTimeout(url: string, init: RequestInit, label: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Request to "${label}" timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(path.replace(/^\//, ""), this.base);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === "") continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  /**
   * Issues a request to a VK Ads endpoint (path includes the version segment,
   * e.g. "v2/ad_plans.json") and returns the parsed JSON body. Retries 429 and
   * 5xx with backoff; any other non-2xx status throws a {@link VkAdsError}.
   */
  async request<T = unknown>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    const hasBody = opts.body !== undefined && method !== "GET";

    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchWithTimeout(
        url,
        {
          method,
          headers: this.headers(hasBody ? { "Content-Type": "application/json" } : undefined),
          body: hasBody ? JSON.stringify(opts.body) : undefined,
        },
        path,
      );

      const text = await res.text();

      const transient = res.status === 429 || (res.status >= 500 && res.status < 600);
      if (transient && attempt < this.maxRetries) {
        await delay(this.backoffMs(attempt, res));
        continue;
      }

      let data: unknown = undefined;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!res.ok) throw new VkAdsError(res.status, data);
      return data as T;
    }
  }

  async get<T = unknown>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  async post<T = unknown>(path: string, body?: unknown, query?: Record<string, QueryValue>): Promise<T> {
    return this.request<T>("POST", path, { body, query });
  }

  async delete<T = unknown>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    return this.request<T>("DELETE", path, { query });
  }

  /**
   * Reads a list endpoint, following offset/count to fetch every page and
   * merging the `items` arrays, so large accounts are not silently truncated.
   * Bounded by maxPages.
   */
  async getAll<T = unknown>(
    path: string,
    query: Record<string, QueryValue> = {},
    maxPages = 100,
  ): Promise<ListPage<T>> {
    const limit = clampLimit(Number(query.limit ?? MAX_PAGE_LIMIT));
    let offset = Number(query.offset ?? 0);
    const items: T[] = [];
    let count = 0;

    for (let page = 0; page < maxPages; page++) {
      const data = await this.get<ListPage<T> & { offset?: number }>(path, { ...query, limit, offset });
      const batch = data.items ?? [];
      items.push(...batch);
      count = typeof data.count === "number" ? data.count : items.length;
      offset += batch.length;
      if (batch.length === 0 || batch.length < limit || offset >= count) break;
    }

    return { count, items };
  }
}

/** Clamps a requested page size into the 1..MAX_PAGE_LIMIT range the API accepts. */
export function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return MAX_PAGE_LIMIT;
  return Math.min(Math.floor(limit), MAX_PAGE_LIMIT);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
