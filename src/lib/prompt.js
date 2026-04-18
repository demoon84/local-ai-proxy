function extractTextPart(part) {
  if (typeof part === "string") {
    return part;
  }

  if (part && typeof part === "object" && part.type === "text" && typeof part.text === "string") {
    return part.text;
  }

  return null;
}

export function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("`messages` must be a non-empty array.");
  }

  return messages.map((message, index) => {
    if (!message || typeof message !== "object") {
      throw new Error(`Message at index ${index} must be an object.`);
    }

    const role = message.role;
    if (!["system", "user", "assistant", "developer"].includes(role)) {
      throw new Error(`Unsupported role at index ${index}: ${String(role)}`);
    }

    let content = "";
    if (typeof message.content === "string") {
      content = message.content;
    } else if (Array.isArray(message.content)) {
      const parts = message.content
        .map(extractTextPart)
        .filter((value) => typeof value === "string" && value.length > 0);
      if (parts.length === 0) {
        throw new Error(`Only text message parts are supported in MVP. Message index: ${index}`);
      }
      content = parts.join("\n");
    } else {
      throw new Error(`Unsupported message content at index ${index}.`);
    }

    return {
      role,
      content
    };
  });
}

export function renderPrompt(messages) {
  const intro = [
    "You are being accessed through a local OpenAI-compatible bridge.",
    "Continue the conversation faithfully and answer the latest user request.",
    "If earlier assistant messages exist, treat them as prior conversation context."
  ].join(" ");

  const conversation = messages
    .map((message) => {
      const label = message.role.toUpperCase();
      return `[${label}]\n${message.content}`;
    })
    .join("\n\n");

  return `${intro}\n\nConversation:\n\n${conversation}`;
}
