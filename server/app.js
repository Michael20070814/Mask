const { PUBLIC_DIR, RUNS_DIR } = require("./config");
const { jsonResponse, textResponse } = require("./http/response");
const { handleConfig } = require("./routes/config");
const { handleProcess } = require("./routes/process");
const { serveFile } = require("./routes/static");

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/config") {
    return handleConfig(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/process") {
    return handleProcess(req, res);
  }

  if (req.method === "GET" && url.pathname.startsWith("/runs/")) {
    return serveFile(res, RUNS_DIR, url.pathname.slice("/runs/".length));
  }

  if (req.method === "GET" || req.method === "HEAD") {
    const requestPath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    return serveFile(res, PUBLIC_DIR, requestPath);
  }

  textResponse(res, 405, "Method Not Allowed");
}

function createRequestHandler() {
  return (req, res) => {
    handleRequest(req, res).catch((error) => {
      jsonResponse(res, 500, { ok: false, error: error.message || "服务器内部错误。" });
    });
  };
}

module.exports = {
  createRequestHandler,
  handleRequest
};
