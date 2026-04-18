import http from "node:http";
import path from "node:path";
import { createConfig } from "./config.js";
import { errorPayload, createChatCompletion, sendBufferedChatCompletionStream, sendJson, sendSseHeaders } from "./lib/openai.js";
import { normalizeMessages } from "./lib/prompt.js";
import { SessionStore } from "./lib/session-store.js";
import { listModels, resolveProviderModel, createProviderCompletion, createProviders } from "./providers/index.js";
import { ProviderError } from "./providers/base.js";

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body exceeds 1MB."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function handleError(res, error) {
  if (error instanceof ProviderError) {
    sendJson(res, error.statusCode, errorPayload(error.message, "provider_error", error.code));
    return;
  }

  sendJson(res, 400, errorPayload(error.message || "Request failed."));
}

function buildAttachmentSummary(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return "";
  }

  const lines = [];

  for (const [index, attachment] of attachments.entries()) {
    if (!attachment || typeof attachment !== "object") {
      continue;
    }

    const name = String(
      attachment.relativePath ||
        attachment.name ||
        attachment.id ||
        `attachment-${index + 1}`
    ).trim();

    lines.push(`- ${name}`);

    if (typeof attachment.textContentPreview === "string" && attachment.textContentPreview.trim()) {
      lines.push(`  Preview: ${attachment.textContentPreview.trim()}`);
    }
  }

  return lines.length ? `Attachments:\n${lines.join("\n")}` : "";
}

function normalizeBridgeMessages(messages = [], systemInstruction = "") {
  const normalized = [];

  if (typeof systemInstruction === "string" && systemInstruction.trim()) {
    normalized.push({
      role: "system",
      content: systemInstruction.trim()
    });
  }

  for (const [index, message] of (Array.isArray(messages) ? messages : []).entries()) {
    if (!message || typeof message !== "object") {
      throw new Error(`Bridge message at index ${index} must be an object.`);
    }

    const role = typeof message.role === "string" ? message.role : "user";
    const baseText =
      typeof message.text === "string"
        ? message.text.trim()
        : typeof message.content === "string"
          ? message.content.trim()
          : "";

    const attachmentSummary = buildAttachmentSummary(message.attachments);
    const content = [baseText, attachmentSummary].filter(Boolean).join("\n\n").trim();

    normalized.push({
      role,
      content
    });
  }

  return normalizeMessages(normalized);
}

export function createAiProxyServer(overrides = {}) {
  const runtimeConfig = createConfig(overrides);
  const sessionStore = new SessionStore(runtimeConfig.dataDir);
  const providers = createProviders(runtimeConfig);

  function getRequestCwd(body) {
    const requested = body.cwd || body.metadata?.cwd || runtimeConfig.defaultCwd;
    return path.resolve(requested);
  }

  async function runCompletion({ body, incomingMessages, providerOverride = null }) {
    const { provider, providerModel, modelId } = resolveProviderModel(
      body.model,
      {
        ...runtimeConfig,
        defaultProvider: providerOverride || runtimeConfig.defaultProvider
      },
      providers
    );
    const cwd = getRequestCwd(body);
    const session = sessionStore.prepareSession({
      sessionId: body.session_id || body.conversation_id || null,
      provider,
      model: modelId,
      cwd,
      messages: incomingMessages
    });

    const providerResult = await createProviderCompletion({
      provider,
      providerModel,
      messages: session.messages,
      cwd,
      providers
    });

    sessionStore.completeSession(
      session.id,
      {
        role: "assistant",
        content: providerResult.text
      },
      providerResult.providerSessionId
    );

    const completion = createChatCompletion({
      model: modelId,
      content: providerResult.text,
      usage: providerResult.usage,
      sessionId: session.id,
      provider,
      providerSessionId: providerResult.providerSessionId
    });

    return {
      completion,
      providerResult
    };
  }

  async function handleChatCompletions(req, res) {
    const body = await readJsonBody(req);
    const incomingMessages = normalizeMessages(body.messages);
    const { completion } = await runCompletion({
      body,
      incomingMessages
    });

    if (body.stream) {
      sendSseHeaders(res);
      sendBufferedChatCompletionStream(res, completion);
      return;
    }

    sendJson(res, 200, completion);
  }

  async function handleBridgeChat(req, res) {
    const body = await readJsonBody(req);
    const incomingMessages = normalizeBridgeMessages(body.messages, body.systemInstruction);
    const providerOverride =
      typeof body.provider === "string" && body.provider.trim()
        ? body.provider.trim().toLowerCase()
        : "codex";

    const { completion } = await runCompletion({
      body,
      incomingMessages,
      providerOverride
    });

    sendJson(res, 200, {
      model: completion.model,
      outputText: completion.choices[0]?.message?.content || "",
      functionCalls: [],
      provider: completion.provider,
      sessionId: completion.session_id
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        sendJson(res, 404, errorPayload("Not found."));
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host || `${runtimeConfig.host}:${runtimeConfig.port}`}`);

      if (req.method === "GET" && url.pathname === "/healthz") {
        sendJson(res, 200, {
          ok: true,
          default_provider: runtimeConfig.defaultProvider
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/models") {
        sendJson(res, 200, {
          object: "list",
          data: listModels()
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        await handleChatCompletions(req, res);
        return;
      }

      if (req.method === "POST" && url.pathname === "/chat") {
        await handleBridgeChat(req, res);
        return;
      }

      sendJson(res, 404, errorPayload("Not found."));
    } catch (error) {
      handleError(res, error);
    }
  });

  return {
    config: runtimeConfig,
    server,
    listen(port = runtimeConfig.port, host = runtimeConfig.host) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve(server);
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

export async function startAiProxyServer(overrides = {}) {
  const proxy = createAiProxyServer(overrides);
  await proxy.listen();
  return proxy;
}
