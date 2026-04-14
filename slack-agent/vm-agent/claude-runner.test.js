const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPrompt, formatForSlack } = require("./claude-runner");

test("buildPrompt returns raw message when there is no history", () => {
  assert.equal(buildPrompt("deploy agora", []), "deploy agora");
});

test("buildPrompt includes prior conversation when history exists", () => {
  const prompt = buildPrompt("fazer deploy", [
    { role: "user", content: "verifique o build" },
    { role: "assistant", content: "build ok" },
  ]);

  assert.match(prompt, /Contexto da conversa anterior:/);
  assert.match(prompt, /user: verifique o build/);
  assert.match(prompt, /assistant: build ok/);
  assert.match(prompt, /Nova tarefa: fazer deploy/);
});

test("formatForSlack splits long output into 3000-char chunks", () => {
  const output = "a".repeat(6500);
  const chunks = formatForSlack(output);

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 3000);
  assert.equal(chunks[1].length, 3000);
  assert.equal(chunks[2].length, 500);
});

test("formatForSlack returns a single empty chunk for empty output", () => {
  assert.deepEqual(formatForSlack(""), [""]);
});
