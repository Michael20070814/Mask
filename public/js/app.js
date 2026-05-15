import { fetchConfig, submitSamJob } from "./api.js";
import { els } from "./dom.js";
import {
  bindMaskEditor,
  clearMaskEditor,
  editorCanvasToBlob,
  setEditorReference,
  updateEditorControls
} from "./editor.js";
import { appendLog, setProcess, startTimer, stopTimer } from "./processView.js";
import { clearResults, setResultImages } from "./results.js";
import {
  applyFile,
  bindSource,
  configureSources,
  resetSources,
  sourcePayload
} from "./sources.js";

async function loadConfig() {
  try {
    const config = await fetchConfig();
    els.checkpoint.value = config.defaultCheckpoint || "";
    els.runtimeMeta.textContent = `SAM: ${config.samDir} | PY: ${config.pythonLauncher || "unknown"}`;
    if (config.checkpointExists) {
      els.checkpointState.textContent = "CHECKPOINT: READY";
      els.checkpointState.classList.add("ready");
    } else {
      els.checkpointState.textContent = "CHECKPOINT: MISSING";
      els.checkpointState.classList.add("error");
    }
    if (!config.launchExists) {
      setProcess("error", "后端脚本缺失", `找不到 launch.py：${config.launchScript}`, "missing launch.py");
    }
  } catch (error) {
    els.runtimeMeta.textContent = "后端连接失败";
    els.checkpointState.textContent = "BACKEND: OFFLINE";
    els.checkpointState.classList.add("error");
    setProcess("error", "后端不可用", error.message, error.stack || error.message);
  }
}

async function submitProcess(event) {
  event.preventDefault();

  const image = sourcePayload("image");
  const mask = sourcePayload("mask");
  if (!image || !mask) {
    setProcess("error", "输入不完整", "原图和 mask 都需要提供文件或地址。", "missing image or mask");
    return;
  }

  const checkpoint = els.checkpoint.value.trim();
  if (!checkpoint) {
    setProcess("error", "缺少权重路径", "请填写 SAM checkpoint 路径。", "missing checkpoint");
    return;
  }

  els.runButton.disabled = true;
  startTimer();
  setProcess("running", "处理中", "正在上传输入并调用 segment-anything/launch.py。", "dispatching job...");

  try {
    const { response, result } = await submitSamJob({
      image,
      mask,
      checkpoint,
      modelType: els.modelType.value,
      useBox: els.useBox.checked
    });

    if (!response.ok || !result.ok) {
      const stdout = result.logs?.stdout || "";
      const stderr = result.logs?.stderr || "";
      const log = [result.error, stdout, stderr].filter(Boolean).join("\n\n");
      setProcess("error", "处理失败", result.error || "后端返回失败。", log || "failed");
      stopTimer();
      return;
    }

    setResultImages(result.outputUrl, result.maskUrl, result.imageUrl);
    setProcess(
      "done",
      "处理完成",
      `run ${result.runId} 已生成可视化结果和二值 mask。`,
      [result.logs?.stdout, result.logs?.stderr].filter(Boolean).join("\n") || "done"
    );
    stopTimer(result.durationMs);
  } catch (error) {
    setProcess("error", "请求失败", error.message, error.stack || error.message);
    stopTimer();
  } finally {
    els.runButton.disabled = false;
  }
}

function resetAll() {
  resetSources();
  clearResults();
  clearMaskEditor();
  setProcess("", "待机", "选择原图和 mask 后开始处理。", "ready");
  stopTimer();
  els.elapsed.textContent = "idle";
}

async function useEditedMaskAsInput() {
  const blob = await editorCanvasToBlob();
  const file = new File([blob], "edited_mask.png", { type: "image/png" });
  await applyFile("mask", file);
  appendLog("edited mask applied as mask input");
}

function boot() {
  configureSources({ onImageReferenceChange: setEditorReference });
  bindSource("image");
  bindSource("mask");
  bindMaskEditor({ onUseEditedMask: useEditedMaskAsInput });
  updateEditorControls();
  els.form.addEventListener("submit", submitProcess);
  els.resetButton.addEventListener("click", resetAll);
  loadConfig();
}

boot();
