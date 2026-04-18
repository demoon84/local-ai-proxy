import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export class SessionStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, "sessions.json");
    this.sessions = new Map();
    this.loaded = false;
  }

  load() {
    if (this.loaded) {
      return;
    }

    fs.mkdirSync(this.dataDir, { recursive: true });
    if (fs.existsSync(this.filePath)) {
      const raw = fs.readFileSync(this.filePath, "utf8");
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        for (const [sessionId, value] of Object.entries(parsed)) {
          this.sessions.set(sessionId, value);
        }
      }
    }
    this.loaded = true;
  }

  save() {
    this.load();
    const payload = Object.fromEntries(this.sessions.entries());
    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2));
  }

  get(sessionId) {
    this.load();
    return this.sessions.get(sessionId) || null;
  }

  prepareSession({ sessionId, provider, model, cwd, messages }) {
    this.load();

    const id = sessionId || crypto.randomUUID();
    const existing = this.sessions.get(id);

    let mergedMessages = messages;
    if (existing && messages.length === 1) {
      mergedMessages = [...existing.messages, ...messages];
    }

    const record = {
      id,
      provider,
      model,
      cwd,
      messages: mergedMessages,
      providerSessionId: existing?.providerSessionId || null,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.sessions.set(id, record);
    this.save();
    return record;
  }

  completeSession(sessionId, assistantMessage, providerSessionId = null) {
    this.load();
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return null;
    }

    const record = {
      ...existing,
      providerSessionId: providerSessionId || existing.providerSessionId || null,
      messages: [...existing.messages, assistantMessage],
      updatedAt: new Date().toISOString()
    };

    this.sessions.set(sessionId, record);
    this.save();
    return record;
  }
}
