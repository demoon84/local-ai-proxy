# local-ai-proxy

`local-ai-proxy` exposes your locally installed `codex`, `claude`, and `gemini` CLIs through a small OpenAI-compatible HTTP server.

It is useful when you want an existing app, local tool, or frontend dev server to talk to local AI agents over a simple HTTP interface instead of shelling out directly.

## What It Does

- Exposes `GET /v1/models`
- Exposes `POST /v1/chat/completions`
- Exposes `GET /auth/providers` for provider login guidance
- Exposes `POST /chat` for simple bridge-style integrations
- Persists lightweight file-based sessions for follow-up requests
- Supports `codex`, `claude`, and `gemini` as backing providers

## Requirements

- Node.js 20 or newer
- At least one supported CLI installed and available on `PATH`
- The provider you want to use must already be authenticated locally

Examples:

- Codex: `codex login`
- Claude: `claude auth login`
- Gemini: sign in through `gemini`, or configure `GEMINI_API_KEY`

## Install

Run without installing:

```bash
npx local-ai-proxy
```

Install in a project:

```bash
npm install local-ai-proxy
```

Install globally:

```bash
npm install -g local-ai-proxy
```

## Quick Start

Start the server:

```bash
npx local-ai-proxy
```

Default address:

```text
http://127.0.0.1:8787
```

Choose a different default provider:

```bash
npx local-ai-proxy --default-provider codex
```

Check health:

```bash
curl http://127.0.0.1:8787/healthz
```

List advertised models:

```bash
curl http://127.0.0.1:8787/v1/models
```

## OpenAI-Compatible Example

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "codex:default",
    "messages": [
      { "role": "user", "content": "Reply with exactly OK." }
    ]
  }'
```

Example with session continuity:

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "gemini:auto",
    "session_id": "demo-session",
    "messages": [
      { "role": "user", "content": "Remember that my project codename is Aurora." }
    ]
  }'
```

## Bridge Endpoint

For apps that expect a simpler bridge response shape, use `POST /chat`.

Example:

```bash
curl http://127.0.0.1:8787/chat \
  -H 'content-type: application/json' \
  -d '{
    "provider": "codex",
    "messages": [
      {
        "role": "user",
        "text": "Summarize this repository in one sentence."
      }
    ]
  }'
```

## Routes

- `GET /healthz`
- `GET /v1/models`
- `GET /auth/providers`
- `GET /v1/auth/providers`
- `POST /v1/chat/completions`
- `POST /chat`

## CLI Options

```text
local-ai-proxy [options]

--host <host>                   Host to listen on
--port <port>                   Port to listen on
--default-provider <provider>   Default provider (codex|claude|gemini)
--data-dir <path>               Session data directory
--help                          Show this help
```

## Library Usage

```js
import { createAiProxyServer } from "local-ai-proxy";

const proxy = createAiProxyServer({
  port: 8787,
  defaultProvider: "gemini"
});

await proxy.listen();

console.log(`Listening on http://${proxy.config.host}:${proxy.config.port}`);
```

Close the server:

```js
await proxy.close();
```

You can also start it directly:

```js
import { startAiProxyServer } from "local-ai-proxy";

const proxy = await startAiProxyServer({
  defaultProvider: "codex"
});
```

## Model Naming

Model IDs are advertised as `provider:model`.

Examples:

- `codex:default`
- `codex:gpt-5.4`
- `claude:sonnet`
- `claude:opus`
- `gemini:auto`
- `gemini:gemini-3-pro-preview`
- `gemini:gemini-3-flash-preview`
- `gemini:gemini-3.1-pro-preview`
- `gemini:gemini-2.5-pro`
- `gemini:gemini-2.5-flash`

If you omit the provider prefix, the server uses `AI_PROXY_DEFAULT_PROVIDER`.

## Authentication Endpoint

You can inspect provider authentication state and login instructions with:

```bash
curl http://127.0.0.1:8787/auth/providers
```

Or for a single provider:

```bash
curl 'http://127.0.0.1:8787/auth/providers?provider=claude'
```

When a provider is not authenticated, the proxy returns a `401` error with provider-specific guidance such as:

- login command
- status command when available
- docs URL
- suggested next steps

## Environment Variables

- `HOST`: listen host, default `127.0.0.1`
- `PORT`: listen port, default `8787`
- `AI_PROXY_DEFAULT_PROVIDER`: default provider, default `gemini`
- `AI_PROXY_DEFAULT_CWD`: default working directory for provider commands
- `AI_PROXY_DATA_DIR`: session storage directory, default `./.local-ai-proxy`
- `AI_PROXY_TIMEOUT_MS`: provider timeout in milliseconds, default `300000`
- `AI_PROXY_CODEX_COMMAND`: override the Codex CLI command
- `AI_PROXY_CODEX_SANDBOX`: Codex sandbox mode, default `read-only`
- `AI_PROXY_CODEX_MODEL`: Codex default model, default `gpt-5.4`
- `AI_PROXY_CODEX_MODEL_REASONING_EFFORT`: Codex reasoning effort, default `high`
- `AI_PROXY_CLAUDE_COMMAND`: override the Claude CLI command
- `AI_PROXY_CLAUDE_PERMISSION_MODE`: Claude permission mode, default `plan`
- `AI_PROXY_GEMINI_COMMAND`: override the Gemini CLI command
- `AI_PROXY_GEMINI_APPROVAL_MODE`: Gemini approval mode, default `plan`

## Frontend Dev Proxy Use

This package works well as a local sidecar process behind a frontend dev proxy.

Typical setup:

1. Run `local-ai-proxy --port 8787`
2. Configure your frontend dev server to proxy a local route to `http://127.0.0.1:8787`
3. Keep your app talking to a same-origin path such as `/api/codex/chat`

Example mapping:

```text
/api/codex/chat -> http://127.0.0.1:8787/chat
```

## Current Limitations

- `stream: true` currently uses buffered streaming, not true incremental provider streaming
- Message content is currently text-focused
- Sessions are stored on the local filesystem
- Provider behavior depends on the installed CLI versions and local auth state

## Development

Run the syntax checks used by the release workflow:

```bash
npm run check
```
