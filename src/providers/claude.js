import { BaseProvider, parseLastJsonObject, runCommand } from "./base.js";

export class ClaudeProvider extends BaseProvider {
  constructor(runtimeConfig) {
    super("claude", runtimeConfig.claude, runtimeConfig);
  }

  getAuthInstructions() {
    return {
      provider: this.name,
      state: "needs_login",
      oauth_supported: true,
      auth_kind: "claude_oauth_or_api_key",
      login_command: "claude auth login",
      status_command: "claude auth status",
      docs_url: "https://code.claude.com/docs/en/authentication",
      instructions: [
        "Run `claude auth login`.",
        "Complete the browser sign-in flow for your Claude account.",
        "Retry the API request after `claude auth status` shows `loggedIn: true`."
      ],
      alternatives: [
        "Teams and enterprise setups can also use Claude Console, Bedrock, Vertex AI, or Foundry auth."
      ]
    };
  }

  async getAuthStatus({ cwd = this.runtimeConfig.defaultCwd } = {}) {
    const base = this.getAuthInstructions();

    try {
      const result = await runCommand(this.providerConfig.command, ["auth", "status"], {
        cwd,
        timeoutMs: this.runtimeConfig.timeoutMs
      });
      const payload = parseLastJsonObject(result.stdout || result.stderr);

      if (payload?.loggedIn) {
        return {
          ...base,
          state: "authenticated",
          auth_method: payload.authMethod || "unknown",
          email: payload.email || null,
          api_provider: payload.apiProvider || null
        };
      }

      return {
        ...base,
        state: "needs_login"
      };
    } catch (error) {
      return {
        ...base,
        state: "unknown",
        status_text: error.message
      };
    }
  }

  async createCompletion({ prompt, model, cwd, permissionMode, addDir }) {
    const effectivePermissionMode = permissionMode || this.providerConfig.permissionMode;
    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--permission-mode",
      effectivePermissionMode
    ];

    if (model) {
      args.push("--model", model);
    }

    if (Array.isArray(addDir)) {
      for (const dir of addDir) {
        if (typeof dir === "string" && dir.trim()) {
          args.push("--add-dir", dir);
        }
      }
    }

    const result = await runCommand(this.providerConfig.command, args, {
      cwd,
      timeoutMs: this.runtimeConfig.timeoutMs
    });

    const payload = parseLastJsonObject(result.stdout || result.stderr);

    if (payload?.result && String(payload.result).includes("Not logged in")) {
      throw this.createAuthError("Claude Code is not logged in.", await this.getAuthStatus({ cwd }));
    }

    if (payload?.is_error && !payload?.result) {
      throw this.createRuntimeError("Claude Code returned an error response.", payload);
    }

    return {
      text: String(payload?.result || "").trim(),
      usage: {
        input_tokens: payload?.usage?.input_tokens ?? 0,
        output_tokens: payload?.usage?.output_tokens ?? 0
      },
      providerSessionId: payload?.session_id || null
    };
  }
}
