const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const RUNS_DIR = path.join(ROOT_DIR, "runs");
const MPL_CONFIG_DIR = path.join(RUNS_DIR, ".matplotlib");
const SAM_DIR = process.env.SAM_DIR || path.join(os.homedir(), "Project", "segment-anything");
const LAUNCH_SCRIPT = path.join(SAM_DIR, "launch.py");
const DEFAULT_CHECKPOINT =
  process.env.SAM_CHECKPOINT ||
  path.join(SAM_DIR, "sam_vit_h_4b8939.pth");
const DEFAULT_CONDA_BIN = path.join(os.homedir(), "miniconda3", "bin", "conda");
const CONDA_BIN = process.env.CONDA_BIN || (fileExists(DEFAULT_CONDA_BIN) ? DEFAULT_CONDA_BIN : "conda");
const SAM_CONDA_ENV = process.env.SAM_CONDA_ENV || "vae-mnist";
const SAM_PYTHON = process.env.SAM_PYTHON || "";

const MAX_JSON_BYTES = Number(process.env.MAX_JSON_BYTES || 160 * 1024 * 1024);
const PROCESS_TIMEOUT_MS = Number(process.env.SAM_TIMEOUT_MS || 30 * 60 * 1000);
const START_PORT = Number(process.env.PORT || 5173);

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

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function textResponse(res, statusCode, message) {
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const resolved = path.join(root, normalized);
  if (!resolved.startsWith(root)) {
    return null;
  }
  return resolved;
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function expandHome(inputPath) {
  if (inputPath === "~") {
    return os.homedir();
  }
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function sanitizeName(name, fallback) {
  const base = path.basename(name || fallback).replace(/[^\w.\-]+/g, "_");
  return base || fallback;
}

function extensionFromMime(mime) {
  if (!mime) return ".png";
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("bmp")) return ".bmp";
  if (mime.includes("tiff")) return ".tif";
  return ".png";
}

function extensionFromName(name, mime) {
  const ext = path.extname(name || "").toLowerCase();
  return ext || extensionFromMime(mime);
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

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

async function readRequestBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) {
      const err = new Error("请求体过大，请换用本地路径或压缩图片后重试。");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?;base64,(.*)$/s.exec(dataUrl || "");
  if (!match) {
    throw new Error("上传文件格式无效。");
  }
  return {
    mime: match[1] || "application/octet-stream",
    buffer: Buffer.from(match[2], "base64")
  };
}

async function saveUploadedSource(source, label, runDir) {
  if (!source || typeof source !== "object") {
    throw new Error(`${label} 缺少输入。`);
  }

  if (source.mode === "file") {
    const { mime, buffer } = decodeDataUrl(source.dataUrl);
    const ext = extensionFromName(source.name, mime);
    const fileName = `${label}${ext}`;
    const targetPath = path.join(runDir, fileName);
    await fsp.writeFile(targetPath, buffer);
    return {
      path: targetPath,
      displayName: sanitizeName(source.name, fileName),
      sourceType: "file"
    };
  }

  if (source.mode === "address") {
    const address = String(source.address || "").trim();
    if (!address) {
      throw new Error(`${label} 地址为空。`);
    }

    if (isHttpUrl(address)) {
      const response = await fetch(address);
      if (!response.ok) {
        throw new Error(`${label} 下载失败：HTTP ${response.status}`);
      }
      const contentType = response.headers.get("content-type") || "";
      const ext = extensionFromMime(contentType);
      const targetPath = path.join(runDir, `${label}${ext}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      await fsp.writeFile(targetPath, buffer);
      return {
        path: targetPath,
        displayName: address,
        sourceType: "url"
      };
    }

    const localPath = path.resolve(expandHome(address));
    if (!fileExists(localPath)) {
      throw new Error(`${label} 本地文件不存在：${localPath}`);
    }
    const ext = extensionFromName(localPath);
    const targetPath = path.join(runDir, `${label}${ext}`);
    await fsp.copyFile(localPath, targetPath);
    return {
      path: targetPath,
      displayName: localPath,
      sourceType: "path"
    };
  }

  throw new Error(`${label} 输入模式无效。`);
}

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

async function handleProcess(req, res) {
  let payload;
  try {
    const body = await readRequestBody(req);
    payload = JSON.parse(body);
  } catch (error) {
    return jsonResponse(res, error.statusCode || 400, {
      ok: false,
      error: error.message || "请求 JSON 解析失败。"
    });
  }

  const checkpointPath = path.resolve(expandHome(String(payload.checkpoint || DEFAULT_CHECKPOINT)));
  const modelType = ["vit_h", "vit_l", "vit_b"].includes(payload.modelType)
    ? payload.modelType
    : "vit_h";
  const useBox = Boolean(payload.useBox);

  if (!fileExists(LAUNCH_SCRIPT)) {
    return jsonResponse(res, 500, {
      ok: false,
      error: `找不到 launch.py：${LAUNCH_SCRIPT}`,
      code: "MISSING_LAUNCH"
    });
  }

  if (!fileExists(checkpointPath)) {
    return jsonResponse(res, 422, {
      ok: false,
      error: `SAM 权重文件不存在：${checkpointPath}`,
      code: "MISSING_CHECKPOINT",
      checkpoint: checkpointPath
    });
  }

  const runId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const runDir = path.join(RUNS_DIR, runId);
  const outputPath = path.join(runDir, "result.png");

  try {
    await fsp.mkdir(runDir, { recursive: true });
    const image = await saveUploadedSource(payload.image, "image", runDir);
    const mask = await saveUploadedSource(payload.mask, "mask", runDir);

    const startedAt = Date.now();
    const result = await runSam({
      imagePath: image.path,
      maskPath: mask.path,
      checkpointPath,
      modelType,
      useBox,
      outputPath
    });
    const durationMs = Date.now() - startedAt;

    if (!result.ok) {
      return jsonResponse(res, 500, {
        ok: false,
        error: result.didTimeout
          ? "SAM 处理超时，进程已终止。"
          : "SAM 处理失败，请查看日志。",
        code: result.didTimeout ? "SAM_TIMEOUT" : "SAM_FAILED",
        runId,
        logs: {
          stdout: result.stdout,
          stderr: result.stderr
        }
      });
    }

    const maskOutputPath = path.join(runDir, "result_mask.png");
    if (!fileExists(outputPath) || !fileExists(maskOutputPath)) {
      return jsonResponse(res, 500, {
        ok: false,
        error: "SAM 已结束，但输出文件不完整。",
        code: "MISSING_OUTPUT",
        runId,
        logs: {
          stdout: result.stdout,
          stderr: result.stderr
        }
      });
    }

    return jsonResponse(res, 200, {
      ok: true,
      runId,
      durationMs,
      outputUrl: `/runs/${runId}/result.png`,
      maskUrl: `/runs/${runId}/result_mask.png`,
      imageUrl: `/runs/${runId}/${path.basename(image.path)}`,
      inputs: {
        image,
        mask
      },
      logs: {
        stdout: result.stdout,
        stderr: result.stderr
      }
    });
  } catch (error) {
    return jsonResponse(res, 400, {
      ok: false,
      error: error.message || "处理请求失败。",
      code: "BAD_INPUT",
      runId
    });
  }
}

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

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/config") {
    return jsonResponse(res, 200, {
      ok: true,
      samDir: SAM_DIR,
      launchScript: LAUNCH_SCRIPT,
      launchExists: fileExists(LAUNCH_SCRIPT),
      defaultCheckpoint: DEFAULT_CHECKPOINT,
      checkpointExists: fileExists(DEFAULT_CHECKPOINT),
      pythonLauncher: getPythonLauncher([LAUNCH_SCRIPT]).label,
      condaEnv: SAM_PYTHON ? null : SAM_CONDA_ENV,
      modelTypes: ["vit_h", "vit_l", "vit_b"]
    });
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

async function ensureDirs() {
  await fsp.mkdir(RUNS_DIR, { recursive: true });
  await fsp.mkdir(MPL_CONFIG_DIR, { recursive: true });
}

function listen(port) {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      jsonResponse(res, 500, { ok: false, error: error.message || "服务器内部错误。" });
    });
  });

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
}

ensureDirs()
  .then(() => listen(START_PORT))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
