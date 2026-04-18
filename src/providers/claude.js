import { BaseProvider, parseLastJsonObject, runCommand } from "./base.js";

export class ClaudeProvider extends BaseProvider {
  constructor(runtimeConfig) {
    super("claude", runtimeConfig.claude, runtimeConfig);
  }

  async createCompletion({ prompt, model, cwd }) {
    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--permission-mode",
      this.providerConfig.permissionMode
    ];

    if (model) {
      args.push("--model", model);
    }

    const result = await runCommand(this.providerConfig.command, args, {
      cwd,
      timeoutMs: this.runtimeConfig.timeoutMs
    });

    const payload = parseLastJsonObject(result.stdout || result.stderr);

    if (payload?.result && String(payload.result).includes("Not logged in")) {
      throw this.createAuthError("Claude Code is not logged in.");
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
