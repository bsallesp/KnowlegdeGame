require("dotenv").config();

const express = require("express");
const axios = require("axios");
const { runClaude, formatForSlack } = require("./claude-runner");

const app = express();
const port = Number(process.env.PORT || 3333);
const conversations = new Map();
const HISTORY_LIMIT = 20;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

app.use(express.json({ limit: "10mb" }));

function authenticateRequest(req, res, next) {
  const authHeader = req.get("authorization") || "";
  const expectedToken = process.env.AGENT_TOKEN;
  const expectedHeader = `Bearer ${expectedToken}`;

  if (!expectedToken || authHeader !== expectedHeader) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

function getConversation(threadTs) {
  const entry = conversations.get(threadTs);
  return entry?.messages || [];
}

function saveConversation(threadTs, messages) {
  conversations.set(threadTs, {
    updatedAt: Date.now(),
    messages: messages.slice(-HISTORY_LIMIT),
  });
}

async function postSlackMessage(slackBotToken, channel, threadTs, text) {
  await axios.post(
    "https://slack.com/api/chat.postMessage",
    {
      channel,
      thread_ts: threadTs,
      text,
      unfurl_links: false,
      unfurl_media: false,
    },
    {
      headers: {
        Authorization: `Bearer ${slackBotToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      timeout: 15000,
    },
  );
}

async function processTask({ message, threadTs, channel, slackBotToken }) {
  const history = getConversation(threadTs);
  const result = await runClaude(message, history);

  const updatedHistory = [
    ...history,
    { role: "user", content: message },
    { role: "assistant", content: result },
  ];

  saveConversation(threadTs, updatedHistory);

  const chunks = formatForSlack(result);
  for (const chunk of chunks) {
    await postSlackMessage(slackBotToken, channel, threadTs, chunk);
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.post("/task", authenticateRequest, (req, res) => {
  const { message, thread_ts: threadTs, channel, slack_bot_token: slackBotToken } = req.body || {};

  if (!message || !threadTs || !channel || !slackBotToken) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  res.status(202).json({ ok: true, status: "processing" });

  Promise.resolve()
    .then(() => processTask({ message, threadTs, channel, slackBotToken }))
    .catch(async (error) => {
      const errorMessage = error?.message || "Erro desconhecido ao processar tarefa.";

      try {
        await postSlackMessage(
          slackBotToken,
          channel,
          threadTs,
          `Erro no agente Claude: ${errorMessage}`,
        );
      } catch (slackError) {
        console.error("Falha ao postar erro no Slack:", slackError);
      }
    });
});

setInterval(() => {
  const cutoff = Date.now() - MAX_AGE_MS;

  for (const [threadTs, entry] of conversations.entries()) {
    if (!entry?.updatedAt || entry.updatedAt < cutoff) {
      conversations.delete(threadTs);
    }
  }
}, 30 * 60 * 1000);

app.listen(port, "0.0.0.0", () => {
  console.log(`Agent on :${port}`);
});
