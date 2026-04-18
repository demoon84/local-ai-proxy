import { BaseProvider, ProviderError, parseJsonLines, runCommand } from "./base.js";

export class CodexProvider extends BaseProvider {
  constructor(runtimeConfig) {
    super("codex", runtimeConfig.codex, runtimeConfig);
  }

  async createCompletion({ prompt, model, cwd }) {
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

    if (model && model !== "default") {
      args.splice(args.length - 1, 0, "-m", model);
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
