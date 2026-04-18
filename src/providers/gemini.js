import fs from "node:fs";
import { BaseProvider, parseLastJsonObject, runCommand } from "./base.js";

export class GeminiProvider extends BaseProvider {
  constructor(runtimeConfig) {
    super("gemini", runtimeConfig.gemini, runtimeConfig);
  }

  hasAuthConfigured() {
    return Boolean(process.env.GEMINI_API_KEY || fs.existsSync(this.providerConfig.oauthCredsPath));
  }

  async createCompletion({ prompt, model, cwd }) {
    if (!this.hasAuthConfigured()) {
      throw this.createAuthError("Gemini CLI authentication is not configured.");
    }

    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--approval-mode",
      this.providerConfig.approvalMode
    ];

    if (model) {
      args.push("--model", model);
    }

    const result = await runCommand(this.providerConfig.command, args, {
      cwd,
      timeoutMs: this.runtimeConfig.timeoutMs
    });

    const payload = parseLastJsonObject(result.stdout || result.stderr);
    if (payload?.error) {
      throw this.createRuntimeError("Gemini CLI returned an error response.", payload.error);
    }

    return {
      text: String(payload?.response || "").trim(),
      usage: {
        input_tokens: payload?.stats?.inputTokens ?? 0,
        output_tokens: payload?.stats?.outputTokens ?? 0
      },
      providerSessionId: payload?.sessionId || null
    };
  }
}
