const { slackCommandsHandler } = require("../src/functions/slackCommands");

function adaptRequest(req) {
  const headers = new Map(
    Object.entries(req.headers || {}).map(([key, value]) => [
      String(key).toLowerCase(),
      value,
    ]),
  );

  return {
    headers: {
      get(name) {
        return headers.get(String(name).toLowerCase()) || null;
      },
    },
    async text() {
      if (typeof req.rawBody === "string") {
        return req.rawBody;
      }

      if (typeof req.body === "string") {
        return req.body;
      }

      if (Buffer.isBuffer(req.body)) {
        return req.body.toString("utf8");
      }

      return JSON.stringify(req.body || {});
    },
  };
}

module.exports = async function (context, req) {
  return slackCommandsHandler(adaptRequest(req), context);
};
