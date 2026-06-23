/**
 * Environment configuration loader
 * This file MUST be imported before any other modules that access env vars
 */
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { logger } from "./lib/monitoring.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from the api-server directory
const result = dotenv.config({ path: resolve(__dirname, "../.env") });

if (result.error) {
  logger.warn("Could not load .env file", { error: result.error.message });
}

export const envLoaded = true;
