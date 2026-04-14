const { spawn } = require("child_process");

const DEFAULT_TIMEOUT_MS = 600_000; // 10 min

/**
 * Runs `claude --print <prompt>` and returns the output as a string.
 * @param {string} message
 * @param {Array<{role:string,content:string}>} conversationHistory
 * @returns {Promise<string>}
 */
async function runClaude(message, conversationHistory = []) {
  const prompt = buildPrompt(message, conversationHistory);

  return new Promise((resolve) => {
    const child = spawn(
      "claude",
      ["--print", "--dangerously-skip-permissions", prompt],
      {
        cwd: process.env.REPO_PATH || "/home/azureuser/dystoppia",
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      stderr += "\nProcesso excedeu o timeout de 10 minutos.";
      child.kill("SIGTERM");
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(`Erro ao executar Claude: ${error.message}`);
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (code === 0) {
        resolve(stdout.trim() || "Claude finalizou sem retornar conteúdo.");
        return;
      }

      const reason =
        stderr.trim() ||
        `Processo finalizado com código ${code ?? "desconhecido"} e sinal ${signal ?? "nenhum"}.`;
      resolve(`Erro ao executar Claude: ${reason}`);
    });
  });
}

function buildPrompt(message, conversationHistory) {
  if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
    return message;
  }

  const historyLines = conversationHistory.map((entry) => {
    if (!entry || typeof entry !== "object") return String(entry);
    return `${entry.role || "unknown"}: ${entry.content || ""}`;
  });

  return `Contexto da conversa anterior:\n${historyLines.join("\n")}\n\nNova tarefa: ${message}`;
}

module.exports = { runClaude, buildPrompt };
