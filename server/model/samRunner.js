const { spawn } = require("node:child_process");
const {
  LAUNCH_SCRIPT,
  MPL_CONFIG_DIR,
  PROCESS_TIMEOUT_MS,
  SAM_DIR,
  getPythonLauncher
} = require("../config");

function runSam({ imagePath, maskPath, checkpointPath, modelType, useBox, outputPath }) {
  return new Promise((resolve) => {
    const scriptArgs = [
      LAUNCH_SCRIPT,
      "--image",
      imagePath,
      "--mask",
      maskPath,
      "--checkpoint",
      checkpointPath,
      "--model-type",
      modelType,
      "--output",
      outputPath
    ];
    if (useBox) {
      scriptArgs.push("--use-box");
    }
    const launcher = getPythonLauncher(scriptArgs);

    const child = spawn(launcher.command, launcher.args, {
      cwd: SAM_DIR,
      env: { ...process.env, PYTHONUNBUFFERED: "1", MPLCONFIGDIR: MPL_CONFIG_DIR }
    });

    let stdout = "";
    let stderr = "";
    let didTimeout = false;
    const timer = setTimeout(() => {
      didTimeout = true;
      child.kill("SIGTERM");
    }, PROCESS_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !didTimeout, code, stdout, stderr, didTimeout });
    });
  });
}

module.exports = {
  runSam
};
