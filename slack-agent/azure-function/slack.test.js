const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const { verifySlackSignature } = require("./src/lib/slack");

function createMockRequest(headers) {
  return {
    headers: {
      get(name) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
  };
}

function signBody(secret, timestamp, rawBody) {
  return `v0=${crypto
    .createHmac("sha256", secret)
    .update(`v0:${timestamp}:${rawBody}`, "utf8")
    .digest("hex")}`;
}

test("verifySlackSignature accepts a valid signature", () => {
  const secret = "test-signing-secret";
  const rawBody = JSON.stringify({ type: "event_callback" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signBody(secret, timestamp, rawBody);

  process.env.SLACK_SIGNING_SECRET = secret;

  const request = createMockRequest({
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": signature,
  });

  assert.equal(verifySlackSignature(request, rawBody), true);
});

test("verifySlackSignature rejects a stale timestamp", () => {
  const secret = "test-signing-secret";
  const rawBody = "payload";
  const timestamp = String(Math.floor(Date.now() / 1000) - 301);
  const signature = signBody(secret, timestamp, rawBody);

  process.env.SLACK_SIGNING_SECRET = secret;

  const request = createMockRequest({
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": signature,
  });

  assert.equal(verifySlackSignature(request, rawBody), false);
});

test("verifySlackSignature rejects an invalid signature", () => {
  process.env.SLACK_SIGNING_SECRET = "test-signing-secret";

  const request = createMockRequest({
    "x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
    "x-slack-signature": "v0=invalid",
  });

  assert.equal(verifySlackSignature(request, "payload"), false);
});
