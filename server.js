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
const INFER_PKG_DIR = process.env.INFER_PKG_DIR || path.join(os.homedir(), "Project", "infer_pkg");
const INFER_SCRIPT = path.join(INFER_PKG_DIR, "inference.py");
const DEFAULT_BASE_MODEL = process.env.INFER_BASE_MODEL || "Qwen/Qwen-Image-Edit-2511";
const DEFAULT_LORA_MODEL =
  process.env.INFER_LORA_MODEL ||
  path.join(INFER_PKG_DIR, "pretrained_weights", "pytorch_lora_weights.safetensors");
const DEFAULT_LORA_ADAPTER_NAME = process.env.INFER_LORA_ADAPTER_NAME || "default";
const DEFAULT_PROMPT =
  process.env.INFER_PROMPT || "Modify the object masked by image 2 to white.";
const DEFAULT_NEGATIVE_PROMPT = process.env.INFER_NEGATIVE_PROMPT || "";
const DEFAULT_NUM_INFERENCE_STEPS = Number(process.env.INFER_NUM_INFERENCE_STEPS || 50);
const DEFAULT_DEVICE = process.env.INFER_DEVICE || "cuda:0";
const DEFAULT_ENABLE_MASK_TO_BOX = parseBooleanEnv(process.env.INFER_ENABLE_MASK_TO_BOX, false);
const DEFAULT_MASK_BOX_MARGIN = Number(process.env.INFER_MASK_BOX_MARGIN || 200);
const DEFAULT_ENABLE_MASK_BLUR = parseBooleanEnv(process.env.INFER_ENABLE_MASK_BLUR, true);
const DEFAULT_BLUR_KERNEL = Number(process.env.INFER_BLUR_KERNEL || 75);
const DEFAULT_BLUR_SIGMA = Number(process.env.INFER_BLUR_SIGMA || 15.0);
const DEFAULT_ENABLE_MASK_DILATION = parseBooleanEnv(
  process.env.INFER_ENABLE_MASK_DILATION,
  true
);
const DEFAULT_DILATION_KERNEL = Number(process.env.INFER_DILATION_KERNEL || 75);
const DEFAULT_CONDA_BIN = path.join(os.homedir(), "miniconda3", "bin", "conda");
const CONDA_BIN =
  process.env.CONDA_BIN || (fileExists(DEFAULT_CONDA_BIN) ? DEFAULT_CONDA_BIN : "conda");
const INFER_CONDA_ENV = process.env.INFER_CONDA_ENV || "vae-mnist";
const INFER_PYTHON = process.env.INFER_PYTHON || "";
const HF_HOME = expandHome(
  process.env.HF_HOME || path.join(os.homedir(), ".cache", "huggingface")
);
const HF_HUB_CACHE = expandHome(process.env.HF_HUB_CACHE || path.join(HF_HOME, "hub"));

const MAX_JSON_BYTES = Number(process.env.MAX_JSON_BYTES || 160 * 1024 * 1024);
const PROCESS_TIMEOUT_MS = Number(process.env.INFER_TIMEOUT_MS || 30 * 60 * 1000);
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

function parseBooleanEnv(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }
  return /^(1|true|yes|on)$/i.test(String(value));
}

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

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath);
    return true;
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

function isLocalModelPath(value) {
  return (
    value === "~" ||
    value.startsWith("~/") ||
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    /\.(safetensors|bin|pt|pth|ckpt)$/i.test(value)
  );
}

function normalizeModelValue(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || !isLocalModelPath(trimmed)) {
    return trimmed;
  }
  const expanded = expandHome(trimmed);
  return path.isAbsolute(expanded) ? expanded : path.resolve(INFER_PKG_DIR, expanded);
}

function modelPathExists(value) {
  const normalized = normalizeModelValue(value);
  return !isLocalModelPath(String(value || "").trim()) || pathExists(normalized);
}

function isHubModelId(value) {
  const trimmed = String(value || "").trim();
  return Boolean(trimmed && !isLocalModelPath(trimmed) && !isHttpUrl(trimmed));
}

function hubModelCacheDir(modelId) {
  return path.join(HF_HUB_CACHE, `models--${String(modelId).replace(/\//g, "--")}`);
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function listDirectories(dirPath) {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dirPath, entry.name));
  } catch {
    return [];
  }
}

function listFilesRecursive(root, predicate, limit = 200) {
  const results = [];
  const visit = (dirPath) => {
    if (results.length >= limit) {
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (predicate(entryPath, entry)) {
        results.push(entryPath);
        if (results.length >= limit) {
          return;
        }
      }
    }
  };
  visit(root);
  return results;
}

function cachedSnapshotDir(modelId) {
  const cacheDir = hubModelCacheDir(modelId);
  const ref = readTextFile(path.join(cacheDir, "refs", "main")).trim();
  if (ref) {
    const snapshotDir = path.join(cacheDir, "snapshots", ref);
    if (pathExists(snapshotDir)) {
      return snapshotDir;
    }
  }
  return listDirectories(path.join(cacheDir, "snapshots"))[0] || "";
}

function inspectHubModelCache(modelId) {
  if (!isHubModelId(modelId)) {
    return { ok: true, type: "local", modelId };
  }

  const cacheDir = hubModelCacheDir(modelId);
  if (!pathExists(cacheDir)) {
    return {
      ok: false,
      code: "BASE_MODEL_NOT_CACHED",
      modelId,
      cacheDir,
      message: `Base model 未在本地 Hugging Face cache 中找到：${modelId}`
    };
  }

  const snapshotDir = cachedSnapshotDir(modelId);
  if (!snapshotDir) {
    return {
      ok: false,
      code: "BASE_MODEL_NOT_CACHED",
      modelId,
      cacheDir,
      message: `Base model cache 没有可用 snapshot：${cacheDir}`
    };
  }

  const incompleteFiles = listFilesRecursive(
    path.join(cacheDir, "blobs"),
    (filePath) => filePath.endsWith(".incomplete"),
    20
  ).map((filePath) => path.relative(cacheDir, filePath));
  const indexFiles = listFilesRecursive(
    snapshotDir,
    (filePath) => /\.(safetensors|bin)\.index\.json$/i.test(path.basename(filePath)),
    50
  );
  const missingFiles = [];

  for (const indexFile of indexFiles) {
    let index;
    try {
      index = JSON.parse(readTextFile(indexFile));
    } catch {
      continue;
    }
    const shardNames = new Set(Object.values(index.weight_map || {}));
    for (const shardName of shardNames) {
      const shardPath = path.join(path.dirname(indexFile), shardName);
      if (!fileExists(shardPath)) {
        missingFiles.push(path.relative(snapshotDir, shardPath));
      }
    }
  }

  if (missingFiles.length || incompleteFiles.length) {
    const detail = missingFiles.length
      ? `缺少 ${missingFiles.length} 个权重分片`
      : `存在 ${incompleteFiles.length} 个未完成下载文件`;
    return {
      ok: false,
      code: "BASE_MODEL_CACHE_INCOMPLETE",
      modelId,
      cacheDir,
      snapshotDir,
      missingFiles: missingFiles.slice(0, 20),
      incompleteFiles,
      message: `Base model 本地 cache 不完整：${detail}。`
    };
  }

  return {
    ok: true,
    type: "hub-cache",
    modelId,
    cacheDir,
    snapshotDir
  };
}

function booleanFromPayload(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function numberFromPayload(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function integerFromPayload(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function getPythonLauncher(scriptArgs) {
  if (INFER_PYTHON) {
    const pythonPath = expandHome(INFER_PYTHON);
    return {
      command: pythonPath,
      args: scriptArgs,
      label: pythonPath
    };
  }

  const condaPath = expandHome(CONDA_BIN);
  return {
    command: condaPath,
    args: ["run", "--no-capture-output", "-n", INFER_CONDA_ENV, "python", ...scriptArgs],
    label: `${condaPath} run -n ${INFER_CONDA_ENV} python`
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

function runInfer({
  imagePath,
  maskPath,
  baseModel,
  loraModel,
  loraAdapterName,
  prompt,
  negativePrompt,
  saveDir,
  numInferenceSteps,
  device,
  enableMaskToBox,
  maskBoxMargin,
  enableMaskBlur,
  blurKernel,
  blurSigma,
  enableMaskDilation,
  dilationKernel
}) {
  return new Promise((resolve) => {
    const scriptArgs = [
      INFER_SCRIPT,
      "--base-model",
      baseModel,
      "--lora-model",
      loraModel,
      "--lora-adapter-name",
      loraAdapterName,
      "--prompt",
      prompt,
      "--negative-prompt",
      negativePrompt,
      "--source-image",
      imagePath,
      "--mask-image",
      maskPath,
      "--save-dir",
      saveDir,
      "--num-inference-steps",
      String(numInferenceSteps),
      "--device",
      device
    ];
    if (enableMaskToBox) {
      scriptArgs.push("--enable-mask-to-box", "--mask-box-margin", String(maskBoxMargin));
    }
    if (enableMaskBlur) {
      scriptArgs.push(
        "--enable-mask-blur",
        "--blur-kernel",
        String(blurKernel),
        "--blur-sigma",
        String(blurSigma)
      );
    }
    if (enableMaskDilation) {
      scriptArgs.push("--enable-mask-dilation", "--dilation-kernel", String(dilationKernel));
    }
    const launcher = getPythonLauncher(scriptArgs);

    const child = spawn(launcher.command, launcher.args, {
      cwd: INFER_PKG_DIR,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        MPLCONFIGDIR: MPL_CONFIG_DIR,
        HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE || "1",
        TRANSFORMERS_OFFLINE: process.env.TRANSFORMERS_OFFLINE || "1",
        DIFFUSERS_OFFLINE: process.env.DIFFUSERS_OFFLINE || "1"
      }
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

async function findInferOutput(runDir, imagePath) {
  const imageStem = path.parse(imagePath).name;
  const expectedPath = path.join(runDir, `output-${imageStem}.jpg`);
  if (fileExists(expectedPath)) {
    return expectedPath;
  }

  const files = await fsp.readdir(runDir);
  const outputName = files.find((fileName) => /^output-.+\.(jpe?g|png|webp)$/i.test(fileName));
  return outputName ? path.join(runDir, outputName) : null;
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

  const baseModel = normalizeModelValue(payload.baseModel || DEFAULT_BASE_MODEL);
  const loraModel = normalizeModelValue(payload.loraModel || DEFAULT_LORA_MODEL);
  const loraAdapterName = String(payload.loraAdapterName || DEFAULT_LORA_ADAPTER_NAME).trim();
  const prompt = String(payload.prompt || DEFAULT_PROMPT).trim();
  const negativePrompt =
    payload.negativePrompt === undefined
      ? DEFAULT_NEGATIVE_PROMPT
      : String(payload.negativePrompt);
  const numInferenceSteps = integerFromPayload(
    payload.numInferenceSteps,
    DEFAULT_NUM_INFERENCE_STEPS,
    1,
    200
  );
  const device = String(payload.device || DEFAULT_DEVICE).trim();
  const enableMaskToBox = booleanFromPayload(payload.enableMaskToBox, DEFAULT_ENABLE_MASK_TO_BOX);
  const maskBoxMargin = integerFromPayload(payload.maskBoxMargin, DEFAULT_MASK_BOX_MARGIN, 0, 2000);
  const enableMaskBlur = booleanFromPayload(payload.enableMaskBlur, DEFAULT_ENABLE_MASK_BLUR);
  const blurKernel = integerFromPayload(payload.blurKernel, DEFAULT_BLUR_KERNEL, 1, 501);
  const blurSigma = numberFromPayload(payload.blurSigma, DEFAULT_BLUR_SIGMA, 0, 100);
  const enableMaskDilation = booleanFromPayload(
    payload.enableMaskDilation,
    DEFAULT_ENABLE_MASK_DILATION
  );
  const dilationKernel = integerFromPayload(payload.dilationKernel, DEFAULT_DILATION_KERNEL, 1, 501);

  if (!fileExists(INFER_SCRIPT)) {
    return jsonResponse(res, 500, {
      ok: false,
      error: `找不到 inference.py：${INFER_SCRIPT}`,
      code: "MISSING_INFER_SCRIPT"
    });
  }

  if (!baseModel) {
    return jsonResponse(res, 422, {
      ok: false,
      error: "Base model 不能为空。",
      code: "MISSING_BASE_MODEL"
    });
  }

  if (!loraModel) {
    return jsonResponse(res, 422, {
      ok: false,
      error: "LoRA 权重路径不能为空。",
      code: "MISSING_LORA_MODEL"
    });
  }

  if (
    isLocalModelPath(String(payload.baseModel || DEFAULT_BASE_MODEL).trim()) &&
    !pathExists(baseModel)
  ) {
    return jsonResponse(res, 422, {
      ok: false,
      error: `Base model 路径不存在：${baseModel}`,
      code: "MISSING_BASE_MODEL_PATH",
      baseModel
    });
  }

  if (
    isLocalModelPath(String(payload.loraModel || DEFAULT_LORA_MODEL).trim()) &&
    !fileExists(loraModel)
  ) {
    return jsonResponse(res, 422, {
      ok: false,
      error: `LoRA 权重文件不存在：${loraModel}`,
      code: "MISSING_LORA_MODEL",
      loraModel
    });
  }

  if (!loraAdapterName) {
    return jsonResponse(res, 422, {
      ok: false,
      error: "LoRA adapter name 不能为空。",
      code: "MISSING_LORA_ADAPTER"
    });
  }

  if (!prompt) {
    return jsonResponse(res, 422, {
      ok: false,
      error: "Prompt 不能为空。",
      code: "MISSING_PROMPT"
    });
  }

  const baseModelCache = inspectHubModelCache(baseModel);
  if (!baseModelCache.ok) {
    return jsonResponse(res, 422, {
      ok: false,
      error: `${baseModelCache.message} 请手动准备完整基础模型缓存，或把 Base model 改成完整的本地模型目录。`,
      code: baseModelCache.code,
      baseModel,
      cache: baseModelCache
    });
  }

  const runId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const runDir = path.join(RUNS_DIR, runId);

  try {
    await fsp.mkdir(runDir, { recursive: true });
    const image = await saveUploadedSource(payload.image, "image", runDir);
    const mask = await saveUploadedSource(payload.mask, "mask", runDir);

    const startedAt = Date.now();
    const result = await runInfer({
      imagePath: image.path,
      maskPath: mask.path,
      baseModel,
      loraModel,
      loraAdapterName,
      prompt,
      negativePrompt,
      saveDir: runDir,
      numInferenceSteps,
      device,
      enableMaskToBox,
      maskBoxMargin,
      enableMaskBlur,
      blurKernel,
      blurSigma,
      enableMaskDilation,
      dilationKernel
    });
    const durationMs = Date.now() - startedAt;

    if (!result.ok) {
      return jsonResponse(res, 500, {
        ok: false,
        error: result.didTimeout
          ? "infer_pkg 处理超时，进程已终止。"
          : "infer_pkg 处理失败，请查看日志。",
        code: result.didTimeout ? "INFER_TIMEOUT" : "INFER_FAILED",
        runId,
        logs: {
          stdout: result.stdout,
          stderr: result.stderr
        }
      });
    }

    const outputPath = await findInferOutput(runDir, image.path);
    if (!outputPath || !fileExists(outputPath)) {
      return jsonResponse(res, 500, {
        ok: false,
        error: "infer_pkg 已结束，但未找到输出文件。",
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
      outputUrl: `/runs/${runId}/${path.basename(outputPath)}`,
      maskUrl: `/runs/${runId}/${path.basename(mask.path)}`,
      imageUrl: `/runs/${runId}/${path.basename(image.path)}`,
      inputs: {
        image,
        mask
      },
      model: {
        baseModel,
        loraModel,
        loraAdapterName,
        numInferenceSteps,
        device
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
    const baseModelCache = inspectHubModelCache(DEFAULT_BASE_MODEL);
    return jsonResponse(res, 200, {
      ok: true,
      inferPkgDir: INFER_PKG_DIR,
      inferScript: INFER_SCRIPT,
      scriptExists: fileExists(INFER_SCRIPT),
      defaultBaseModel: DEFAULT_BASE_MODEL,
      defaultLoraModel: DEFAULT_LORA_MODEL,
      baseModelReady: baseModelCache.ok,
      baseModelCache,
      loraExists: modelPathExists(DEFAULT_LORA_MODEL),
      pythonLauncher: getPythonLauncher([INFER_SCRIPT]).label,
      condaEnv: INFER_PYTHON ? null : INFER_CONDA_ENV,
      hfHubCache: HF_HUB_CACHE,
      defaults: {
        loraAdapterName: DEFAULT_LORA_ADAPTER_NAME,
        prompt: DEFAULT_PROMPT,
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
        numInferenceSteps: DEFAULT_NUM_INFERENCE_STEPS,
        device: DEFAULT_DEVICE,
        enableMaskToBox: DEFAULT_ENABLE_MASK_TO_BOX,
        maskBoxMargin: DEFAULT_MASK_BOX_MARGIN,
        enableMaskBlur: DEFAULT_ENABLE_MASK_BLUR,
        blurKernel: DEFAULT_BLUR_KERNEL,
        blurSigma: DEFAULT_BLUR_SIGMA,
        enableMaskDilation: DEFAULT_ENABLE_MASK_DILATION,
        dilationKernel: DEFAULT_DILATION_KERNEL
      }
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
    console.log(`Mask edit UI running at http://127.0.0.1:${port}`);
    console.log(`INFER_PKG_DIR=${INFER_PKG_DIR}`);
    console.log(`INFER_BASE_MODEL=${DEFAULT_BASE_MODEL}`);
    console.log(`INFER_LORA_MODEL=${DEFAULT_LORA_MODEL}`);
    console.log(`INFER_PYTHON=${getPythonLauncher([INFER_SCRIPT]).label}`);
  });
}

ensureDirs()
  .then(() => listen(START_PORT))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
