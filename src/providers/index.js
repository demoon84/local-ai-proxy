import { advertisedModels } from "../config.js";
import { renderPrompt } from "../lib/prompt.js";
import { ProviderError } from "./base.js";
import { ClaudeProvider } from "./claude.js";
import { CodexProvider } from "./codex.js";
import { GeminiProvider } from "./gemini.js";

export function createProviders(runtimeConfig) {
  return {
    codex: new CodexProvider(runtimeConfig),
    claude: new ClaudeProvider(runtimeConfig),
    gemini: new GeminiProvider(runtimeConfig)
  };
}

export function listModels() {
  return Object.entries(advertisedModels).flatMap(([providerName, ids]) =>
    ids.map((id) => ({
      id,
      object: "model",
      created: 0,
      owned_by: providerName
    }))
  );
}

export function resolveProviderModel(modelId, runtimeConfig, providers) {
  if (!modelId || typeof modelId !== "string") {
    return {
      provider: runtimeConfig.defaultProvider,
      providerModel: null,
      modelId: `${runtimeConfig.defaultProvider}:default`
    };
  }

  if (modelId.includes(":")) {
    const [provider, ...rest] = modelId.split(":");
    const providerModel = rest.join(":") || null;
    if (!providers[provider]) {
      throw new ProviderError(`Unknown provider: ${provider}`, {
        statusCode: 400,
        code: "unknown_provider",
        provider
      });
    }
    return {
      provider,
      providerModel,
      modelId
    };
  }

  return {
    provider: runtimeConfig.defaultProvider,
    providerModel: modelId,
    modelId: `${runtimeConfig.defaultProvider}:${modelId}`
  };
}

export async function createProviderCompletion({ provider, providerModel, messages, cwd, providers }) {
  const adapter = providers[provider];
  if (!adapter) {
    throw new ProviderError(`Unsupported provider: ${provider}`, {
      statusCode: 400,
      code: "unknown_provider",
      provider
    });
  }

  const prompt = renderPrompt(messages);
  return adapter.createCompletion({
    prompt,
    model: providerModel,
    cwd
  });
}
