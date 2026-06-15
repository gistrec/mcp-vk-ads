import type { VkAdsConfig } from "./types.js";

/** Builds the client config from environment variables, exiting if the token is missing. */
export function loadConfig(): VkAdsConfig {
  const token = process.env.VK_ADS_TOKEN;
  if (!token) {
    console.error("Error: VK_ADS_TOKEN environment variable is required.");
    process.exit(1);
  }
  const timeoutMs = Number(process.env.VK_ADS_TIMEOUT_MS);
  const maxRetries = Number(process.env.VK_ADS_MAX_RETRIES);
  return {
    token,
    lang: process.env.VK_ADS_LANG || "ru",
    apiBase: process.env.VK_ADS_API_BASE || "https://ads.vk.com/api",
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
    maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : 3,
  };
}
