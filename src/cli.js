#!/usr/bin/env node

import { startAiProxyServer } from "./index.js";

function printHelp() {
  console.log(`local-ai-proxy

Usage:
  local-ai-proxy [options]

Options:
  --host <host>                   Host to listen on
  --port <port>                   Port to listen on
  --default-provider <provider>   Default provider (codex|claude|gemini)
  --data-dir <path>               Session data directory
  --help                          Show this help
`);
}

function parseArgs(argv = []) {
  const overrides = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--host" && next) {
      overrides.host = next;
      index += 1;
      continue;
    }

    if (arg === "--port" && next) {
      overrides.port = Number.parseInt(next, 10);
      index += 1;
      continue;
    }

    if (arg === "--default-provider" && next) {
      overrides.defaultProvider = next;
      index += 1;
      continue;
    }

    if (arg === "--data-dir" && next) {
      overrides.dataDir = next;
      index += 1;
    }
  }

  return overrides;
}

const proxy = await startAiProxyServer(parseArgs(process.argv.slice(2)));
console.log(`AI Proxy listening on http://${proxy.config.host}:${proxy.config.port}`);
