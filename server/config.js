const os = require("node:os");
const path = require("node:path");
const { expandHome, fileExists } = require("./utils/path");

const ROOT_DIR = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const RUNS_DIR = path.join(ROOT_DIR, "runs");
const MPL_CONFIG_DIR = path.join(RUNS_DIR, ".matplotlib");

const SAM_DIR = process.env.SAM_DIR || path.join(os.homedir(), "Project", "segment-anything");
const LAUNCH_SCRIPT = path.join(SAM_DIR, "launch.py");
const DEFAULT_CHECKPOINT =
  process.env.SAM_CHECKPOINT || path.join(SAM_DIR, "sam_vit_h_4b8939.pth");
const DEFAULT_CONDA_BIN = path.join(os.homedir(), "miniconda3", "bin", "conda");
const CONDA_BIN = process.env.CONDA_BIN || (fileExists(DEFAULT_CONDA_BIN) ? DEFAULT_CONDA_BIN : "conda");
const SAM_CONDA_ENV = process.env.SAM_CONDA_ENV || "vae-mnist";
const SAM_PYTHON = process.env.SAM_PYTHON || "";

const MAX_JSON_BYTES = Number(process.env.MAX_JSON_BYTES || 160 * 1024 * 1024);
const PROCESS_TIMEOUT_MS = Number(process.env.SAM_TIMEOUT_MS || 30 * 60 * 1000);
const START_PORT = Number(process.env.PORT || 5173);
const MODEL_TYPES = ["vit_h", "vit_l", "vit_b"];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function getPythonLauncher(scriptArgs) {
  if (SAM_PYTHON) {
    const pythonPath = expandHome(SAM_PYTHON);
    return {
      command: pythonPath,
      args: scriptArgs,
      label: pythonPath
    };
  }

  const condaPath = expandHome(CONDA_BIN);
  return {
    command: condaPath,
    args: ["run", "--no-capture-output", "-n", SAM_CONDA_ENV, "python", ...scriptArgs],
    label: `${condaPath} run -n ${SAM_CONDA_ENV} python`
  };
}

function runtimeConfig() {
  return {
    samDir: SAM_DIR,
    launchScript: LAUNCH_SCRIPT,
    launchExists: fileExists(LAUNCH_SCRIPT),
    defaultCheckpoint: DEFAULT_CHECKPOINT,
    checkpointExists: fileExists(DEFAULT_CHECKPOINT),
    pythonLauncher: getPythonLauncher([LAUNCH_SCRIPT]).label,
    condaEnv: SAM_PYTHON ? null : SAM_CONDA_ENV,
    modelTypes: MODEL_TYPES
  };
}

module.exports = {
  DEFAULT_CHECKPOINT,
  LAUNCH_SCRIPT,
  MAX_JSON_BYTES,
  MIME_TYPES,
  MODEL_TYPES,
  MPL_CONFIG_DIR,
  PROCESS_TIMEOUT_MS,
  PUBLIC_DIR,
  ROOT_DIR,
  RUNS_DIR,
  SAM_DIR,
  START_PORT,
  getPythonLauncher,
  runtimeConfig
};
