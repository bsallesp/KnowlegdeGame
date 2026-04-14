const axios = require("axios");
const { app } = require("@azure/functions");
const { verifySlackSignature } = require("../lib/slack");
const { getVmStatus, startVm, stopVm } = require("../lib/azure");

function getStatusLabel(status) {
  switch (status) {
    case "running":
      return "🟢 Rodando";
    case "starting":
      return "🟡 Ligando";
    case "stopped":
      return "🔴 Desligada";
    case "deallocating":
      return "🟠 Desligando";
    default:
      return `⚪ ${status}`;
  }
}

async function respondToCommand(responseUrl, text) {
  await axios.post(
    responseUrl,
    {
      response_type: "ephemeral",
      text,
    },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      timeout: 15000,
    },
  );
}

async function processCommand(commandText, responseUrl, context) {
  try {
    if (commandText === "on") {
      const status = await getVmStatus();
      if (status === "running" || status === "starting") {
        await respondToCommand(responseUrl, "VM já está ligada.");
        return;
      }

      await startVm();
      await respondToCommand(responseUrl, "VM ligando, ~90 segundos.");
      return;
    }

    if (commandText === "off") {
      const status = await getVmStatus();
      if (status === "stopped") {
        await respondToCommand(responseUrl, "VM já está desligada.");
        return;
      }

      await stopVm();
      await respondToCommand(responseUrl, "VM desligando (deallocate).");
      return;
    }

    if (commandText === "status") {
      const status = await getVmStatus();
      await respondToCommand(responseUrl, `VM: ${getStatusLabel(status)}`);
      return;
    }

    await respondToCommand(responseUrl, "Uso: /vm on | off | status");
  } catch (error) {
    context.error("Erro ao processar slash command:", error);
    await respondToCommand(responseUrl, "Falha ao processar o comando da VM.");
  }
}

async function slackCommandsHandler(req, context) {
  const rawBody = await req.text();

  if (!verifySlackSignature(req, rawBody)) {
    return { status: 401 };
  }

  const body = new URLSearchParams(rawBody);
  const command = body.get("command");
  const text = (body.get("text") || "").trim().toLowerCase();
  const responseUrl = body.get("response_url");

  if (command !== "/vm" || !responseUrl) {
    return { status: 400, body: "Invalid command payload" };
  }

  setImmediate(() => {
    processCommand(text, responseUrl, context).catch((error) => {
      context.error("Erro no processamento assíncrono do slash command:", error);
    });
  });

  return {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      response_type: "ephemeral",
      text: "Processando...",
    }),
  };
}

app.http("slackCommands", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "slack/commands",
  handler: slackCommandsHandler,
});

module.exports = {
  slackCommandsHandler,
};
