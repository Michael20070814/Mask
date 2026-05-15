const http = require("node:http");
const fsp = require("node:fs/promises");
const {
  DEFAULT_CHECKPOINT,
  LAUNCH_SCRIPT,
  MPL_CONFIG_DIR,
  RUNS_DIR,
  SAM_DIR,
  START_PORT,
  getPythonLauncher
} = require("./config");
const { createRequestHandler } = require("./app");

async function ensureDirs() {
  await fsp.mkdir(RUNS_DIR, { recursive: true });
  await fsp.mkdir(MPL_CONFIG_DIR, { recursive: true });
}

function listen(port = START_PORT) {
  const server = http.createServer(createRequestHandler());

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && port < START_PORT + 20) {
      listen(port + 1);
      return;
    }
    console.error(error);
    process.exit(1);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Mask SAM UI running at http://127.0.0.1:${port}`);
    console.log(`SAM_DIR=${SAM_DIR}`);
    console.log(`SAM_CHECKPOINT=${DEFAULT_CHECKPOINT}`);
    console.log(`SAM_PYTHON=${getPythonLauncher([LAUNCH_SCRIPT]).label}`);
  });

  return server;
}

async function start() {
  await ensureDirs();
  return listen(START_PORT);
}

module.exports = {
  ensureDirs,
  listen,
  start
};
