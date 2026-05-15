const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { MIME_TYPES, RUNS_DIR } = require("../config");
const { textResponse } = require("../http/response");
const { safeJoin } = require("../utils/path");

async function serveFile(res, root, requestPath) {
  const targetPath = safeJoin(root, requestPath);
  if (!targetPath) {
    return textResponse(res, 403, "Forbidden");
  }
  try {
    const stats = await fsp.stat(targetPath);
    if (!stats.isFile()) {
      return textResponse(res, 404, "Not Found");
    }
    const ext = path.extname(targetPath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "content-length": stats.size,
      "cache-control": root === RUNS_DIR ? "no-store" : "public, max-age=60"
    });
    fs.createReadStream(targetPath).pipe(res);
  } catch {
    textResponse(res, 404, "Not Found");
  }
}

module.exports = {
  serveFile
};
