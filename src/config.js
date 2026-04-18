import os from "node:os";
import path from "node:path";

const cwd = process.cwd();

export const defaultConfig = {
  host: process.env.HOST || "127.0.0.1",
  port: Number.parseInt(process.env.PORT || "8787", 10),
  defaultProvider: process.env.AI_PROXY_DEFAULT_PROVIDER || "gemini",
  defaultCwd: process.env.AI_PROXY_DEFAULT_CWD || cwd,
  dataDir: process.env.AI_PROXY_DATA_DIR || path.join(cwd, ".local-ai-proxy"),
  timeoutMs: Number.parseInt(process.env.AI_PROXY_TIMEOUT_MS || "300000", 10),
  codex: {
    command: process.env.AI_PROXY_CODEX_COMMAND || "codex",
    sandbox: process.env.AI_PROXY_CODEX_SANDBOX || "read-only"
  },
  claude: {
    command: process.env.AI_PROXY_CLAUDE_COMMAND || "claude",
    permissionMode: process.env.AI_PROXY_CLAUDE_PERMISSION_MODE || "plan"
  },
  gemini: {
    command: process.env.AI_PROXY_GEMINI_COMMAND || "gemini",
    approvalMode: process.env.AI_PROXY_GEMINI_APPROVAL_MODE || "plan",
    oauthCredsPath: path.join(os.homedir(), ".gemini", "oauth_creds.json")
  }
};

export const advertisedModels = {
  codex: ["codex:default"],
  claude: ["claude:sonnet", "claude:opus"],
  gemini: [
    "gemini:auto",
    "gemini:gemini-3-pro-preview",
    "gemini:gemini-3-flash-preview",
    "gemini:gemini-3.1-pro-preview",
    "gemini:gemini-2.5-pro",
    "gemini:gemini-2.5-flash"
  ]
};

export function createConfig(overrides = {}) {
  return {
    ...defaultConfig,
    ...overrides,
    codex: {
      ...defaultConfig.codex,
      ...(overrides.codex || {})
    },
    claude: {
      ...defaultConfig.claude,
      ...(overrides.claude || {})
    },
    gemini: {
      ...defaultConfig.gemini,
      ...(overrides.gemini || {})
    }
  };
}

export const config = createConfig();
