require("dotenv").config();

const express = require("express");
const { runClaude } = require("./claude-runner");

const app = express();
const port = Number(process.env.PORT || 3333);

const HISTORY_LIMIT = 20;
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 h
const conversations = new Map();

app.use(express.json({ limit: "10mb" }));

function authenticate(req, res, next) {
  const expected = process.env.AGENT_TOKEN;
  if (!expected) {
    res.status(500).json({ error: "AGENT_TOKEN not configured" });
    return;
  }
  const auth = req.get("authorization") || "";
  if (auth !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function getHistory(threadId) {
  return conversations.get(threadId)?.messages ?? [];
}

function saveHistory(threadId, messages) {
  conversations.set(threadId, {
    updatedAt: Date.now(),
    messages: messages.slice(-HISTORY_LIMIT),
  });
}

// ── Public ─────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    conversations: conversations.size,
    timestamp: new Date().toISOString(),
  });
});

// ── Authenticated ───────────────────────────────────────────────

/**
 * POST /run
 * Body: { message: string, thread_id?: string }
 * Returns: { ok: true, result: string }
 *
 * Synchronous — waits for Claude to finish (up to 10 min).
 * Use thread_id to maintain multi-turn conversation context.
 */
app.post("/run", authenticate, async (req, res) => {
  const { message, thread_id: threadId } = req.body || {};

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const history = threadId ? getHistory(threadId) : [];

  try {
    const result = await runClaude(message, history);

    if (threadId) {
      saveHistory(threadId, [
        ...history,
        { role: "user", content: message },
        { role: "assistant", content: result },
      ]);
    }

    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});

/**
 * DELETE /thread/:id — clear conversation history for a thread
 */
app.delete("/thread/:id", authenticate, (req, res) => {
  conversations.delete(req.params.id);
  res.json({ ok: true });
});

// ── Cleanup stale conversations ─────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [id, entry] of conversations.entries()) {
    if (!entry?.updatedAt || entry.updatedAt < cutoff) {
      conversations.delete(id);
    }
  }
}, 30 * 60 * 1000);

app.listen(port, "0.0.0.0", () => {
  console.log(`vm-agent listening on :${port}`);
});
