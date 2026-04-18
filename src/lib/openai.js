import crypto from "node:crypto";

function unixTimestamp() {
  return Math.floor(Date.now() / 1000);
}

function completionId() {
  return `chatcmpl_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function toOpenAiUsage(usage = {}) {
  const promptTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const completionTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens
  };
}

export function createChatCompletion({
  model,
  content,
  usage,
  sessionId,
  provider,
  providerSessionId
}) {
  return {
    id: completionId(),
    object: "chat.completion",
    created: unixTimestamp(),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content
        },
        finish_reason: "stop"
      }
    ],
    usage: toOpenAiUsage(usage),
    session_id: sessionId,
    provider,
    provider_session_id: providerSessionId || null
  };
}

function writeSseFrame(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function sendBufferedChatCompletionStream(res, completion) {
  const created = unixTimestamp();
  const streamId = completion.id;

  writeSseFrame(res, {
    id: streamId,
    object: "chat.completion.chunk",
    created,
    model: completion.model,
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant"
        },
        finish_reason: null
      }
    ]
  });

  writeSseFrame(res, {
    id: streamId,
    object: "chat.completion.chunk",
    created,
    model: completion.model,
    choices: [
      {
        index: 0,
        delta: {
          content: completion.choices[0].message.content
        },
        finish_reason: null
      }
    ]
  });

  writeSseFrame(res, {
    id: streamId,
    object: "chat.completion.chunk",
    created,
    model: completion.model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop"
      }
    ],
    usage: completion.usage
  });

  res.write("data: [DONE]\n\n");
  res.end();
}

export function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload, null, 2));
}

export function sendSseHeaders(res) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });
}

export function errorPayload(message, type = "invalid_request_error", code = null) {
  return {
    error: {
      message,
      type,
      param: null,
      code
    }
  };
}
