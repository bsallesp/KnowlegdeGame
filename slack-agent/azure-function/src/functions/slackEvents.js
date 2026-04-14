const axios = require("axios");
const { app } = require("@azure/functions");
const { verifySlackSignature, postMessage } = require("../lib/slack");
const { getVmStatus, startVm, waitForVmReady } = require("../lib/azure");

async function forwardTaskToVm(text, threadTs, channel) {
  await axios.post(
    `${process.env.VM_AGENT_URL}/task`,
    {
      message: text,
      thread_ts: threadTs,
      channel,
      slack_bot_token: process.env.SLACK_BOT_TOKEN,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.AGENT_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      timeout: 15000,
    },
  );
}

async function processSlackEvent(payload, context) {
  const event = payload.event;
  const text = String(event.text || "").replace(/^<@[A-Z0-9]+>\s*/, "").trim();
  const channel = event.channel;
  const threadTs = event.thread_ts || event.ts;

  if (!text) {
    await postMessage(channel, "Envie uma mensagem junto da menção para eu encaminhar à VM.", threadTs);
    return;
  }

  let status;
  try {
    status = await getVmStatus();
  } catch (error) {
    context.error("Falha ao consultar status da VM:", error);
    await postMessage(channel, "Erro ao consultar o status da VM no Azure.", threadTs);
    return;
  }

  if (status === "stopped") {
    await postMessage(channel, "VM desligada. Ligando agora (~90s)...", threadTs);
    await startVm();

    const ready = await waitForVmReady(120000);
    if (!ready) {
      await postMessage(channel, "Erro: VM não respondeu em 2min.", threadTs);
      return;
    }
  } else if (status === "starting") {
    await postMessage(channel, "VM ainda ligando, aguarde...", threadTs);

    const ready = await waitForVmReady(120000);
    if (!ready) {
      await postMessage(channel, "Erro: VM não respondeu.", threadTs);
      return;
    }
  } else if (status === "deallocating") {
    await postMessage(channel, "VM está desligando neste momento. Tente novamente em instantes.", threadTs);
    return;
  } else if (status !== "running") {
    await postMessage(channel, `VM em estado inesperado: ${status}.`, threadTs);
    return;
  }

  await postMessage(channel, "Entendido, processando...", threadTs);

  try {
    await forwardTaskToVm(text, threadTs, channel);
  } catch (error) {
    context.error("Falha ao encaminhar task para a VM:", error);
    await postMessage(channel, "Erro ao encaminhar a tarefa para a VM.", threadTs);
  }
}

async function slackEventsHandler(req, context) {
  const rawBody = await req.text();

  if (!verifySlackSignature(req, rawBody)) {
    return { status: 401, body: "Invalid signature" };
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (_error) {
    return { status: 400, body: "Invalid JSON" };
  }

  if (body.type === "url_verification") {
    return { status: 200, body: body.challenge };
  }

  if (!body.event) {
    return { status: 200 };
  }

  if (body.event.bot_id || !body.event.user) {
    return { status: 200 };
  }

  const eventType = body.event.type;
  if (eventType !== "app_mention" && eventType !== "message") {
    return { status: 200 };
  }

  setImmediate(() => {
    processSlackEvent(body, context).catch((error) => {
      context.error("Erro no processamento assíncrono do evento Slack:", error);
    });
  });

  return { status: 200 };
}

app.http("slackEvents", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "slack/events",
  handler: slackEventsHandler,
});

module.exports = {
  slackEventsHandler,
};
