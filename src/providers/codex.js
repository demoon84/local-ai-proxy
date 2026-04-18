import { BaseProvider, ProviderError, parseJsonLines, runCommand } from "./base.js";

export class CodexProvider extends BaseProvider {
  constructor(runtimeConfig) {
    super("codex", runtimeConfig.codex, runtimeConfig);
  }

  getAuthInstructions() {
    return {
      provider: this.name,
      state: "needs_login",
      oauth_supported: true,
      auth_kind: "chatgpt_oauth_or_api_key",
      login_command: "codex login",
      status_command: "codex login status",
      docs_url: "https://developers.openai.com/codex/cli",
      instructions: [
        "Run `codex login` or start `codex` interactively.",
        "Choose ChatGPT sign-in in the browser flow.",
        "Retry the API request after the CLI shows that login completed."
      ],
      alternatives: [
        "API key login is also supported via `printenv OPENAI_API_KEY | codex login --with-api-key`."
      ]
    };
  }

  async getAuthStatus({ cwd = this.runtimeConfig.defaultCwd } = {}) {
    const base = this.getAuthInstructions();

    try {
      const result = await runCommand(this.providerConfig.command, ["login", "status"], {
        cwd,
        timeoutMs: this.runtimeConfig.timeoutMs
      });
      const output = `${result.stdout}\n${result.stderr}`.trim();

      if (result.code === 0 && /logged in/i.test(output)) {
        return {
          ...base,
          state: "authenticated",
          auth_method: /chatgpt/i.test(output) ? "chatgpt_oauth" : "stored_credentials",
          status_text: output
        };
      }

      if (/not logged in|logged out/i.test(output)) {
        return {
          ...base,
          state: "needs_login",
          status_text: output
        };
      }

      return {
        ...base,
        state: "unknown",
        status_text: output || `Exit code ${result.code}`
      };
    } catch (error) {
      return {
        ...base,
        state: "unknown",
        status_text: error.message
      };
    }
  }

  async createCompletion({ prompt, model, cwd }) {
    const selectedModel =
      model && model !== "default"
        ? model
        : this.providerConfig.model || null;
    const args = [
      "exec",
      "--json",
      "--ephemeral",
      "--skip-git-repo-check",
      "-C",
      cwd,
      "-s",
      this.providerConfig.sandbox,
      prompt
    ];

    if (selectedModel) {
      args.splice(args.length - 1, 0, "-m", selectedModel);
    }

    if (this.providerConfig.modelReasoningEffort) {
      args.splice(
        args.length - 1,
        0,
        "-c",
        `model_reasoning_effort="${this.providerConfig.modelReasoningEffort}"`
      );
    }

    const result = await runCommand(this.providerConfig.command, args, {
      cwd,
      timeoutMs: this.runtimeConfig.timeoutMs
    });

    const events = parseJsonLines(result.stdout);
    const messageTexts = [];
    let providerSessionId = null;
    let usage = {};

    for (const event of events) {
      if (event.type === "thread.started") {
        providerSessionId = event.thread_id || providerSessionId;
      }
      if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") {
        messageTexts.push(event.item.text);
      }
      if (event.type === "turn.completed" && event.usage) {
        usage = {
          input_tokens: event.usage.input_tokens ?? 0,
          output_tokens: event.usage.output_tokens ?? 0
        };
      }
    }

    const text = messageTexts.join("\n\n").trim();
    if (!text) {
      const authStatus = await this.getAuthStatus({ cwd });
      const combinedOutput = `${result.stdout}\n${result.stderr}`;

      if (
        authStatus.state === "needs_login" ||
        /not logged in|log in|login required|authentication/i.test(combinedOutput)
      ) {
        throw this.createAuthError("Codex CLI is not logged in.", authStatus);
      }

      throw new ProviderError("Codex returned no assistant message.", {
        statusCode: result.code === 0 ? 502 : 500,
        code: "provider_empty_response",
        provider: this.name,
        details: {
          stdout: result.stdout.slice(-4000),
          stderr: result.stderr.slice(-4000)
        }
      });
    }

    return {
      text,
      usage,
      providerSessionId
    };
  }
}
