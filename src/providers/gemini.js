import fs from "node:fs";
import { BaseProvider, parseLastJsonObject, runCommand } from "./base.js";

export class GeminiProvider extends BaseProvider {
  constructor(runtimeConfig) {
    super("gemini", runtimeConfig.gemini, runtimeConfig);
  }

  getAuthInstructions() {
    return {
      provider: this.name,
      state: "needs_login",
      oauth_supported: true,
      auth_kind: "google_oauth_or_api_key",
      login_command: "gemini",
      status_command: null,
      docs_url: "https://geminicli.com/docs/get-started/authentication/",
      instructions: [
        "Run `gemini` interactively.",
        "Choose `Sign in with Google` in the authentication prompt.",
        "Complete the browser flow, then retry the API request."
      ],
      alternatives: [
        "For headless use, set `GEMINI_API_KEY`, or configure Vertex AI credentials."
      ]
    };
  }

  getAuthStatus() {
    const base = this.getAuthInstructions();

    if (process.env.GEMINI_API_KEY) {
      return {
        ...base,
        state: "authenticated",
        auth_method: "api_key"
      };
    }

    if (fs.existsSync(this.providerConfig.oauthCredsPath)) {
      return {
        ...base,
        state: "authenticated",
        auth_method: "google_oauth_cached",
        credentials_path: this.providerConfig.oauthCredsPath
      };
    }

    return base;
  }

  hasAuthConfigured() {
    return this.getAuthStatus().state === "authenticated";
  }

  async createCompletion({ prompt, model, cwd }) {
    if (!this.hasAuthConfigured()) {
      throw this.createAuthError("Gemini CLI authentication is not configured.", this.getAuthStatus());
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
