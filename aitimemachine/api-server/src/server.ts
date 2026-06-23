#!/usr/bin/env node
/**
 * Server entry point - loads environment first, then starts the app
 */

// Load environment variables BEFORE importing anything else
import "./env.js";

// Now dynamically import the main app
const { default: app } = await import("./index.js");
