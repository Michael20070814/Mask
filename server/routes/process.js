const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { DEFAULT_CHECKPOINT, LAUNCH_SCRIPT, MODEL_TYPES, RUNS_DIR } = require("../config");
const { readJsonBody } = require("../http/request");
const { jsonResponse } = require("../http/response");
const { runSam } = require("../model/samRunner");
const { saveUploadedSource } = require("../storage/source");
const { expandHome, fileExists } = require("../utils/path");

async function handleProcess(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    return jsonResponse(res, error.statusCode || 400, {
      ok: false,
      error: error.message || "请求 JSON 解析失败。"
    });
  }

  const checkpointPath = path.resolve(expandHome(String(payload.checkpoint || DEFAULT_CHECKPOINT)));
  const modelType = MODEL_TYPES.includes(payload.modelType) ? payload.modelType : "vit_h";
  const useBox = Boolean(payload.useBox);

  const validation = validateRuntime(checkpointPath);
  if (validation) {
    return jsonResponse(res, validation.status, validation.body);
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

function validateRuntime(checkpointPath) {
  if (!fileExists(LAUNCH_SCRIPT)) {
    return {
      status: 500,
      body: {
        ok: false,
        error: `找不到 launch.py：${LAUNCH_SCRIPT}`,
        code: "MISSING_LAUNCH"
      }
    };
  }

  if (!fileExists(checkpointPath)) {
    return {
      status: 422,
      body: {
        ok: false,
        error: `SAM 权重文件不存在：${checkpointPath}`,
        code: "MISSING_CHECKPOINT",
        checkpoint: checkpointPath
      }
    };
  }

  return null;
}

module.exports = {
  handleProcess
};
