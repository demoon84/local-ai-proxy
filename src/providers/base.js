import { spawn } from "node:child_process";

export class ProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ProviderError";
    this.statusCode = options.statusCode || 500;
    this.code = options.code || "provider_error";
    this.provider = options.provider || "unknown";
    this.details = options.details || null;
  }
}

export function parseJsonLines(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function parseLastJsonObject(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    if (!line.startsWith("{")) {
      continue;
    }
    try {
      return JSON.parse(line);
    } catch {
      continue;
    }
  }

  const trimmed = output.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed);
  }

  throw new ProviderError("Failed to parse provider JSON output.", {
    code: "provider_parse_error"
  });
}

export function runCommand(command, args, { cwd, env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let completed = false;

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (completed) {
        return;
      }
      completed = true;
      reject(
        new ProviderError(`Failed to start command: ${command}`, {
          code: "command_spawn_error",
          details: error.message
        })
      );
    });

    const timeout = setTimeout(() => {
      if (completed) {
        return;
      }
      completed = true;
      child.kill("SIGTERM");
      reject(
        new ProviderError(`Command timed out after ${timeoutMs}ms.`, {
          code: "command_timeout"
        })
      );
    }, timeoutMs);

    child.on("close", (code, signal) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timeout);
      resolve({
        code,
        signal,
        stdout,
        stderr
      });
    });

    child.stdin.end();
  });
}

export class BaseProvider {
  constructor(name, providerConfig, runtimeConfig) {
    this.name = name;
    this.providerConfig = providerConfig;
    this.runtimeConfig = runtimeConfig;
  }

  getAuthInstructions() {
    return {
      provider: this.name,
      state: "unknown",
      oauth_supported: false,
      login_command: null,
      status_command: null,
      docs_url: null,
      instructions: []
    };
  }

  async getAuthStatus() {
    return this.getAuthInstructions();
  }

  createAuthError(message, details = null) {
    return new ProviderError(message, {
      statusCode: 401,
      code: "provider_auth_error",
      provider: this.name,
      details: {
        ...this.getAuthInstructions(),
        ...(details || {})
      }
    });
  }

  createRuntimeError(message, details = null) {
    return new ProviderError(message, {
      statusCode: 500,
      code: "provider_runtime_error",
      provider: this.name,
      details
    });
  }
}
