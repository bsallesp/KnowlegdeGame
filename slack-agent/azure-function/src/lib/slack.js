const crypto = require("crypto");

function verifySlackSignature(req, rawBody) {
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!timestamp || !signature || !signingSecret) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > 60 * 5) {
    return false;
  }

  const baseString = `v0:${timestamp}:${rawBody}`;
  const expectedSignature = `v0=${crypto
    .createHmac("sha256", signingSecret)
    .update(baseString, "utf8")
    .digest("hex")}`;

  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

async function postMessage(channel, text, threadTs = null) {
  const axios = require("axios");
  const response = await axios.post(
    "https://slack.com/api/chat.postMessage",
    {
      channel,
      text,
      ...(threadTs ? { thread_ts: threadTs } : {}),
      unfurl_links: false,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      timeout: 15000,
    },
  );

  return response.data;
}

module.exports = {
  verifySlackSignature,
  postMessage,
};
