# local-ai-proxy

로컬에 설치된 `codex`, `claude`, `gemini` CLI를 감싸는 로컬 AI 프록시 패키지입니다.

OpenAI 호환 `/v1/...` API를 로컬에서 열어, 기존 앱이나 프론트 프로젝트가 same-origin dev proxy 뒤에서 바로 붙을 수 있게 해줍니다.

## Quick Start

사전 조건:

- Node.js 20+
- `codex`, `claude`, `gemini` 중 하나 이상이 PATH 에 설치 및 로그인

바로 실행:

```bash
npx local-ai-proxy
```

기본 주소:

- `http://127.0.0.1:8787`

프로젝트에 dev dependency 로 설치:

```bash
npm install -D local-ai-proxy
```

로컬 checkout 을 직접 붙일 때:

```bash
npm install -D local-ai-proxy@file:../../local-ai-proxy
```

기본 용도:

- OpenAI 호환 `/v1/...` API 제공
- `ez/admin` 같은 프론트 프로젝트에서 same-origin dev proxy 뒤의 로컬 AI bridge로 사용

현재 MVP 범위:

- `/healthz`
- `/v1/models`
- `/v1/chat/completions`
- `/chat` (`ez/admin` 호환 응답 형식)
- 파일 기반 bridge session 저장
- OpenAI 스타일 SSE 응답

주의:

- 이 버전의 `stream: true` 는 provider 출력을 내부에서 모두 수집한 뒤 OpenAI SSE 형태로 내보내는 buffered streaming 입니다.
- 실제 incremental streaming 과 native provider session resume 는 다음 단계 확장 포인트로 남겨두었습니다.
- provider 인증 상태는 각 CLI 설치/로그인 상태에 의존합니다.

## Start

```bash
npm start
```

패키지 형태로는 CLI 또는 라이브러리 둘 다 사용할 수 있습니다.

```bash
npx local-ai-proxy
```

## Install

- npm 공개 패키지로 설치: `npm install -D local-ai-proxy`
- 로컬 checkout 으로 설치: `npm install -D local-ai-proxy@file:../../local-ai-proxy`
- 전역 실행이 필요하면: `npm install -g local-ai-proxy`

## Library Usage

```js
import { createAiProxyServer } from "local-ai-proxy";

const proxy = createAiProxyServer({
  port: 8787,
  defaultProvider: "gemini"
});

await proxy.listen();
```

종료:

```js
await proxy.close();
```

## Environment Variables

- `HOST`: 기본 `127.0.0.1`
- `PORT`: 기본 `8787`
- `AI_PROXY_DEFAULT_PROVIDER`: 기본 `gemini`
- `AI_PROXY_DEFAULT_CWD`: 기본 현재 프로젝트 디렉터리
- `AI_PROXY_DATA_DIR`: 기본 `./.local-ai-proxy`
- `AI_PROXY_TIMEOUT_MS`: 기본 `300000`
- `AI_PROXY_CODEX_SANDBOX`: 기본 `read-only`
- `AI_PROXY_CLAUDE_PERMISSION_MODE`: 기본 `plan`
- `AI_PROXY_GEMINI_APPROVAL_MODE`: 기본 `plan`

## Model Naming

OpenAI 호환 요청의 `model` 값은 `provider:model` 형식을 권장합니다.

예시:

- `codex:default`
- `claude:sonnet`
- `gemini:auto`
- `gemini:gemini-3-pro-preview`
- `gemini:gemini-3-flash-preview`
- `gemini:gemini-3.1-pro-preview`

provider prefix 가 없으면 `AI_PROXY_DEFAULT_PROVIDER` 를 사용합니다.

## Example

```bash
curl http://127.0.0.1:8787/v1/models
```

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

session continuity 가 필요하면 custom field `session_id` 를 함께 보낼 수 있습니다.

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

## Notes

- Claude 는 먼저 `claude auth login` 으로 OAuth 로그인을 완료해야 합니다.
- Gemini headless mode 는 cached auth 또는 `GEMINI_API_KEY` / Vertex AI 구성이 필요합니다.
- Gemini 3 계열은 현재 `gemini-3-pro-preview`, `gemini-3-flash-preview`, `gemini-3.1-pro-preview` 이름으로 광고합니다.
- Codex CLI 는 현재 환경에 따라 warning 로그를 stdout 으로 섞어 출력할 수 있어, 브리지는 JSON line 만 추려서 처리합니다.

## ez/admin Integration

`ez/admin` 같이 기존 프론트 앱이 `/api/codex/chat` 같은 same-origin 경로를 기대하면, 이 패키지를 별도 로컬 프로세스로 띄우고 dev-server proxy로 `/chat`에 연결하는 방식이 가장 자연스럽습니다.

예시:

```bash
local-ai-proxy --port 8787
```

`ez/admin` 기준 추천 연결 방식:

```json
{
  "devDependencies": {
    "local-ai-proxy": "file:../../local-ai-proxy"
  },
  "scripts": {
    "serve:local-ai": "local-ai-proxy --port 8787"
  }
}
```

실행 순서:

1. `npm install`
2. `npm run serve:local-ai`
3. `npm run serve:admin`

프론트 dev-server:

- `/api/codex/chat` -> `http://127.0.0.1:8787/chat`

이 방식의 장점:

- 프론트 번들에 Node 런타임 의존성을 넣지 않아도 된다.
- Codex/Claude/Gemini 전환을 환경 변수와 모델명으로 처리할 수 있다.
- 나중에 npm registry/private registry 배포로 바꾸기 쉽다.
- 실제 `ez/admin` 이식 검증 기준으로도 `/api/codex/chat` 경유로 `codex`, `claude`, `gemini` 호출이 모두 정상 동작했다.
