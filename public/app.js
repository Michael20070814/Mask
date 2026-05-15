const state = {
  image: { file: null, dataUrl: "", address: "" },
  mask: { file: null, dataUrl: "", address: "" },
  timer: null,
  startedAt: 0,
  editor: {
    mode: "white",
    loaded: false,
    sourceUrl: "",
    outputUrl: "",
    imageUrl: "",
    showImage: true,
    imageOpacity: 0.45,
    originalData: null,
    undoStack: [],
    isDrawing: false,
    lastPoint: null
  }
};

const els = {
  form: document.querySelector("#processForm"),
  runtimeMeta: document.querySelector("#runtimeMeta"),
  checkpointState: document.querySelector("#checkpointState"),
  checkpoint: document.querySelector("#checkpoint"),
  modelType: document.querySelector("#modelType"),
  useBox: document.querySelector("#useBox"),
  runButton: document.querySelector("#runButton"),
  resetButton: document.querySelector("#resetButton"),
  processState: document.querySelector("#processState"),
  stateTitle: document.querySelector("#stateTitle"),
  stateText: document.querySelector("#stateText"),
  elapsed: document.querySelector("#elapsed"),
  logOutput: document.querySelector("#logOutput"),
  outputImage: document.querySelector("#outputImage"),
  resultMask: document.querySelector("#resultMask"),
  outputLink: document.querySelector("#outputLink"),
  maskLink: document.querySelector("#maskLink"),
  editorFrame: document.querySelector("#editorFrame"),
  editorImageOverlay: document.querySelector("#editorImageOverlay"),
  maskEditor: document.querySelector("#maskEditor"),
  brushCursor: document.querySelector("#brushCursor"),
  editorMeta: document.querySelector("#editorMeta"),
  paintWhite: document.querySelector("#paintWhite"),
  paintBlack: document.querySelector("#paintBlack"),
  brushSize: document.querySelector("#brushSize"),
  brushValue: document.querySelector("#brushValue"),
  showEditorImage: document.querySelector("#showEditorImage"),
  editorImageOpacity: document.querySelector("#editorImageOpacity"),
  editorImageOpacityValue: document.querySelector("#editorImageOpacityValue"),
  undoEdit: document.querySelector("#undoEdit"),
  resetEdit: document.querySelector("#resetEdit"),
  loadMaskEdit: document.querySelector("#loadMaskEdit"),
  downloadEditedMask: document.querySelector("#downloadEditedMask"),
  downloadMaskedOutput: document.querySelector("#downloadMaskedOutput"),
  useEditedMask: document.querySelector("#useEditedMask")
};

const sourceEls = {
  image: {
    file: document.querySelector("#imageFile"),
    address: document.querySelector("#imageAddress"),
    drop: document.querySelector("#imageDrop"),
    preview: document.querySelector("#imagePreview"),
    frame: document.querySelector("#imagePreview").parentElement,
    label: document.querySelector("#imageSourceLabel")
  },
  mask: {
    file: document.querySelector("#maskFile"),
    address: document.querySelector("#maskAddress"),
    drop: document.querySelector("#maskDrop"),
    preview: document.querySelector("#maskPreview"),
    frame: document.querySelector("#maskPreview").parentElement,
    label: document.querySelector("#maskSourceLabel")
  }
};

function setProcess(mode, title, text, log) {
  els.processState.classList.remove("running", "done", "error");
  if (mode) {
    els.processState.classList.add(mode);
  }
  els.stateTitle.textContent = title;
  els.stateText.textContent = text;
  if (typeof log === "string") {
    els.logOutput.textContent = log;
  }
}

function appendLog(line) {
  const next = `${els.logOutput.textContent}\n${line}`.trim();
  els.logOutput.textContent = next;
  els.logOutput.scrollTop = els.logOutput.scrollHeight;
}

function startTimer() {
  state.startedAt = Date.now();
  els.elapsed.textContent = "0.0s";
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    const seconds = (Date.now() - state.startedAt) / 1000;
    els.elapsed.textContent = `${seconds.toFixed(1)}s`;
  }, 100);
}

function stopTimer(durationMs) {
  clearInterval(state.timer);
  state.timer = null;
  if (typeof durationMs === "number") {
    els.elapsed.textContent = `${(durationMs / 1000).toFixed(1)}s`;
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取文件失败。"));
    reader.readAsDataURL(file);
  });
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

async function applyFile(kind, file) {
  if (!file) return;
  state[kind].file = file;
  state[kind].dataUrl = await fileToDataUrl(file);
  sourceEls[kind].preview.src = state[kind].dataUrl;
  sourceEls[kind].frame.classList.add("has-image");
  sourceEls[kind].label.textContent = file.name;
  sourceEls[kind].address.value = "";
  state[kind].address = "";
  if (kind === "image") {
    setEditorReference(state[kind].dataUrl);
  }
}

function applyAddress(kind, value) {
  state[kind].address = value.trim();
  if (state[kind].address) {
    state[kind].file = null;
    state[kind].dataUrl = "";
    sourceEls[kind].file.value = "";
    sourceEls[kind].preview.removeAttribute("src");
    sourceEls[kind].frame.classList.remove("has-image");
    sourceEls[kind].label.textContent = "地址输入";
    if (kind === "image") {
      setEditorReference(isHttpUrl(state[kind].address) ? state[kind].address : "");
    }
  } else {
    sourceEls[kind].label.textContent = "未选择";
    if (kind === "image") {
      setEditorReference("");
    }
  }
}

function sourcePayload(kind) {
  const current = state[kind];
  if (current.dataUrl && current.file) {
    return {
      mode: "file",
      name: current.file.name,
      dataUrl: current.dataUrl
    };
  }
  if (current.address) {
    return {
      mode: "address",
      address: current.address
    };
  }
  return null;
}

function editorContext() {
  return els.maskEditor.getContext("2d", { willReadFrequently: true });
}

function stampedUrl(url, key) {
  if (!url || url.startsWith("data:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${Date.now()}`;
}

function setEditorReference(imageUrl) {
  state.editor.imageUrl = imageUrl || "";
  if (state.editor.imageUrl) {
    els.editorImageOverlay.src = stampedUrl(state.editor.imageUrl, "ref");
  } else {
    els.editorImageOverlay.removeAttribute("src");
  }
  updateEditorControls();
}

function syncEditorReferenceFromInput(fallbackUrl = "") {
  if (fallbackUrl) {
    setEditorReference(fallbackUrl);
    return;
  }
  if (state.image.dataUrl) {
    setEditorReference(state.image.dataUrl);
    return;
  }
  if (isHttpUrl(state.image.address)) {
    setEditorReference(state.image.address);
    return;
  }
  setEditorReference("");
}

function editorBrushDisplaySize() {
  const rawSize = Number(els.brushSize.value) || 24;
  if (!state.editor.loaded || !els.maskEditor.width) {
    return rawSize;
  }
  const rect = els.maskEditor.getBoundingClientRect();
  return Math.max(2, rawSize * (rect.width / els.maskEditor.width));
}

function updateBrushCursorSize() {
  els.editorFrame.style.setProperty("--brush-size", `${editorBrushDisplaySize()}px`);
}

function hideBrushCursor() {
  els.editorFrame.classList.remove("show-brush");
}

function updateBrushCursor(event) {
  if (!state.editor.loaded) {
    hideBrushCursor();
    return;
  }
  const frameRect = els.editorFrame.getBoundingClientRect();
  els.brushCursor.style.left = `${event.clientX - frameRect.left}px`;
  els.brushCursor.style.top = `${event.clientY - frameRect.top}px`;
  updateBrushCursorSize();
  els.editorFrame.classList.add("show-brush");
}

function updateEditorControls() {
  const hasMask = state.editor.loaded;
  const hasReference = Boolean(state.editor.imageUrl);
  els.paintWhite.classList.toggle("active", state.editor.mode === "white");
  els.paintBlack.classList.toggle("active", state.editor.mode === "black");
  els.brushValue.value = `${els.brushSize.value} px`;
  els.showEditorImage.checked = state.editor.showImage;
  els.showEditorImage.disabled = !hasReference;
  els.editorImageOpacity.value = Math.round(state.editor.imageOpacity * 100);
  els.editorImageOpacity.disabled = !hasReference;
  els.editorImageOpacityValue.value = `${Math.round(state.editor.imageOpacity * 100)}%`;
  els.undoEdit.disabled = !hasMask || state.editor.undoStack.length === 0;
  els.resetEdit.disabled = !hasMask;
  els.downloadEditedMask.disabled = !hasMask;
  els.downloadMaskedOutput.disabled = !hasMask && !state.editor.outputUrl;
  els.useEditedMask.disabled = !hasMask;
  els.loadMaskEdit.disabled = !state.editor.sourceUrl;
  els.editorFrame.style.setProperty("--reference-opacity", String(state.editor.imageOpacity));
  els.editorFrame.classList.toggle(
    "show-reference",
    hasMask && hasReference && state.editor.showImage
  );
  updateBrushCursorSize();
}

function setEditorMode(mode) {
  state.editor.mode = mode;
  updateEditorControls();
}

function setEditorMeta(text) {
  els.editorMeta.textContent = text;
}

function binarizeEditorCanvas() {
  if (!state.editor.loaded) return;
  const canvas = els.maskEditor;
  const context = editorContext();
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    const gray = (data[index] + data[index + 1] + data[index + 2]) / 3;
    const value = gray * alpha >= 128 ? 255 : 0;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
}

function clearMaskEditor() {
  const canvas = els.maskEditor;
  const context = editorContext();
  context.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
  state.editor.loaded = false;
  state.editor.sourceUrl = "";
  state.editor.outputUrl = "";
  state.editor.imageUrl = "";
  state.editor.originalData = null;
  state.editor.undoStack = [];
  state.editor.isDrawing = false;
  state.editor.lastPoint = null;
  els.editorImageOverlay.removeAttribute("src");
  els.editorFrame.classList.remove("has-canvas");
  hideBrushCursor();
  setEditorMeta("等待生成 mask");
  updateEditorControls();
}

function loadMaskIntoEditor(maskUrl) {
  if (!maskUrl || maskUrl === "#") return;

  setEditorMeta("载入中...");
  state.editor.sourceUrl = maskUrl;
  updateEditorControls();

  const image = new Image();
  image.onload = () => {
    const canvas = els.maskEditor;
    const context = editorContext();
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    state.editor.loaded = true;
    binarizeEditorCanvas();
    state.editor.originalData = context.getImageData(0, 0, canvas.width, canvas.height);
    state.editor.undoStack = [];
    state.editor.isDrawing = false;
    state.editor.lastPoint = null;
    els.editorFrame.classList.add("has-canvas");
    if (!state.editor.imageUrl) {
      syncEditorReferenceFromInput();
    }
    setEditorMeta(`${canvas.width} x ${canvas.height}`);
    updateEditorControls();
  };
  image.onerror = () => {
    const canvas = els.maskEditor;
    editorContext().clearRect(0, 0, canvas.width, canvas.height);
    els.editorFrame.classList.remove("has-canvas");
    setEditorMeta("mask 载入失败");
    state.editor.loaded = false;
    state.editor.originalData = null;
    state.editor.undoStack = [];
    hideBrushCursor();
    updateEditorControls();
  };
  image.src = `${maskUrl}${maskUrl.includes("?") ? "&" : "?"}editor=${Date.now()}`;
}

function pushEditorUndo() {
  if (!state.editor.loaded) return;
  const canvas = els.maskEditor;
  const snapshot = editorContext().getImageData(0, 0, canvas.width, canvas.height);
  state.editor.undoStack.push(snapshot);
  if (state.editor.undoStack.length > 24) {
    state.editor.undoStack.shift();
  }
  updateEditorControls();
}

function editorPointFromEvent(event) {
  const canvas = els.maskEditor;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  return {
    x: Math.max(0, Math.min(canvas.width, x)),
    y: Math.max(0, Math.min(canvas.height, y))
  };
}

function drawEditorBrush(point, previousPoint) {
  const context = editorContext();
  const color = state.editor.mode === "white" ? "#ffffff" : "#000000";
  const size = Number(els.brushSize.value) || 24;

  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = size;
  context.strokeStyle = color;
  context.fillStyle = color;

  if (previousPoint) {
    context.beginPath();
    context.moveTo(previousPoint.x, previousPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
  } else {
    context.beginPath();
    context.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function startEditorStroke(event) {
  if (!state.editor.loaded) return;
  event.preventDefault();
  updateBrushCursor(event);
  els.maskEditor.setPointerCapture(event.pointerId);
  pushEditorUndo();
  const point = editorPointFromEvent(event);
  state.editor.isDrawing = true;
  state.editor.lastPoint = point;
  drawEditorBrush(point);
}

function moveEditorStroke(event) {
  if (!state.editor.loaded) return;
  updateBrushCursor(event);
  if (!state.editor.isDrawing) return;
  event.preventDefault();
  const point = editorPointFromEvent(event);
  drawEditorBrush(point, state.editor.lastPoint);
  state.editor.lastPoint = point;
}

function finishEditorStroke(event) {
  if (!state.editor.isDrawing) return;
  event.preventDefault();
  state.editor.isDrawing = false;
  state.editor.lastPoint = null;
  binarizeEditorCanvas();
  updateBrushCursor(event);
  updateEditorControls();
}

function undoEditorStroke() {
  if (!state.editor.undoStack.length) return;
  const snapshot = state.editor.undoStack.pop();
  editorContext().putImageData(snapshot, 0, 0);
  updateEditorControls();
}

function resetEditorToOriginal() {
  if (!state.editor.originalData) return;
  editorContext().putImageData(state.editor.originalData, 0, 0);
  state.editor.undoStack = [];
  updateEditorControls();
}

function canvasToPngBlob(canvas, errorMessage) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error(errorMessage));
      }
    }, "image/png");
  });
}

function editorCanvasToBlob() {
  return canvasToPngBlob(els.maskEditor, "导出 mask 失败。");
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImageForCanvas(imageUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!imageUrl.startsWith("data:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("原图参考载入失败，无法合成红色结果。"));
    image.src = stampedUrl(imageUrl, "export");
  });
}

function createMaskedOutputCanvas(referenceImage) {
  const maskCanvas = els.maskEditor;
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = maskCanvas.width;
  outputCanvas.height = maskCanvas.height;

  const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
  outputContext.drawImage(referenceImage, 0, 0, outputCanvas.width, outputCanvas.height);

  const outputImage = outputContext.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  const maskImage = editorContext().getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  const outputData = outputImage.data;
  const maskData = maskImage.data;
  const red = [255, 70, 64];

  for (let index = 0; index < outputData.length; index += 4) {
    if (maskData[index] >= 128) {
      outputData[index] = Math.round(outputData[index] * 0.42 + red[0] * 0.58);
      outputData[index + 1] = Math.round(outputData[index + 1] * 0.42 + red[1] * 0.58);
      outputData[index + 2] = Math.round(outputData[index + 2] * 0.42 + red[2] * 0.58);
    } else {
      outputData[index] = Math.round(outputData[index] * 0.45);
      outputData[index + 1] = Math.round(outputData[index + 1] * 0.45);
      outputData[index + 2] = Math.round(outputData[index + 2] * 0.45);
    }
    outputData[index + 3] = 255;
  }

  outputContext.putImageData(outputImage, 0, 0);
  return outputCanvas;
}

async function downloadUrl(url, filename) {
  const response = await fetch(stampedUrl(url, "download"), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`下载失败：HTTP ${response.status}`);
  }
  downloadBlob(await response.blob(), filename);
}

async function downloadEditedMask() {
  if (!state.editor.loaded) return;
  const blob = await editorCanvasToBlob();
  downloadBlob(blob, "edited_mask.png");
}

async function downloadMaskedOutput() {
  if (state.editor.loaded && state.editor.imageUrl) {
    try {
      const referenceImage = await loadImageForCanvas(state.editor.imageUrl);
      const outputCanvas = createMaskedOutputCanvas(referenceImage);
      const blob = await canvasToPngBlob(outputCanvas, "导出红色结果失败。");
      downloadBlob(blob, "edited_masked_output.png");
      return;
    } catch (error) {
      if (!state.editor.outputUrl) {
        throw error;
      }
    }
  }

  if (state.editor.outputUrl) {
    await downloadUrl(state.editor.outputUrl, "masked_output.png");
    return;
  }

  throw new Error("没有可导出的 masked output。");
}

async function useEditedMaskAsInput() {
  if (!state.editor.loaded) return;
  const blob = await editorCanvasToBlob();
  const file = new File([blob], "edited_mask.png", { type: "image/png" });
  await applyFile("mask", file);
  appendLog("edited mask applied as mask input");
}

function bindSource(kind) {
  const group = sourceEls[kind];

  document.querySelector(`[data-pick="${kind}"]`).addEventListener("click", () => {
    group.file.click();
  });

  group.file.addEventListener("change", async () => {
    await applyFile(kind, group.file.files[0]);
  });

  group.address.addEventListener("input", () => {
    applyAddress(kind, group.address.value);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    group.drop.addEventListener(eventName, (event) => {
      event.preventDefault();
      group.drop.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    group.drop.addEventListener(eventName, (event) => {
      event.preventDefault();
      group.drop.classList.remove("dragging");
    });
  });

  group.drop.addEventListener("drop", async (event) => {
    const file = event.dataTransfer.files[0];
    if (file) {
      await applyFile(kind, file);
    }
  });
}

function bindMaskEditor() {
  els.paintWhite.addEventListener("click", () => setEditorMode("white"));
  els.paintBlack.addEventListener("click", () => setEditorMode("black"));
  els.brushSize.addEventListener("input", updateEditorControls);
  els.showEditorImage.addEventListener("change", () => {
    state.editor.showImage = els.showEditorImage.checked;
    updateEditorControls();
  });
  els.editorImageOpacity.addEventListener("input", () => {
    state.editor.imageOpacity = Number(els.editorImageOpacity.value) / 100;
    updateEditorControls();
  });
  els.editorImageOverlay.addEventListener("error", () => {
    state.editor.imageUrl = "";
    els.editorImageOverlay.removeAttribute("src");
    updateEditorControls();
  });
  els.undoEdit.addEventListener("click", undoEditorStroke);
  els.resetEdit.addEventListener("click", resetEditorToOriginal);
  els.loadMaskEdit.addEventListener("click", () => loadMaskIntoEditor(state.editor.sourceUrl));
  els.downloadEditedMask.addEventListener("click", () => {
    downloadEditedMask().catch((error) => setEditorMeta(error.message));
  });
  els.downloadMaskedOutput.addEventListener("click", () => {
    downloadMaskedOutput().catch((error) => setEditorMeta(error.message));
  });
  els.useEditedMask.addEventListener("click", () => {
    useEditedMaskAsInput().catch((error) => setEditorMeta(error.message));
  });

  els.maskEditor.addEventListener("pointerdown", startEditorStroke);
  els.maskEditor.addEventListener("pointerenter", updateBrushCursor);
  els.maskEditor.addEventListener("pointermove", moveEditorStroke);
  els.maskEditor.addEventListener("pointerup", finishEditorStroke);
  els.maskEditor.addEventListener("pointercancel", finishEditorStroke);
  els.maskEditor.addEventListener("pointerleave", () => {
    if (!state.editor.isDrawing) {
      hideBrushCursor();
    }
  });
  window.addEventListener("resize", updateBrushCursorSize);
}

function setResultImages(outputUrl, maskUrl, imageUrl = "") {
  const stamp = `t=${Date.now()}`;
  els.outputImage.src = `${outputUrl}?${stamp}`;
  els.resultMask.src = `${maskUrl}?${stamp}`;
  els.outputImage.parentElement.classList.add("has-image");
  els.resultMask.parentElement.classList.add("has-image");
  els.outputLink.href = outputUrl;
  els.maskLink.href = maskUrl;
  state.editor.outputUrl = outputUrl;
  syncEditorReferenceFromInput(imageUrl);
  loadMaskIntoEditor(maskUrl);
}

function resetAll() {
  for (const kind of ["image", "mask"]) {
    state[kind] = { file: null, dataUrl: "", address: "" };
    sourceEls[kind].file.value = "";
    sourceEls[kind].address.value = "";
    sourceEls[kind].preview.removeAttribute("src");
    sourceEls[kind].frame.classList.remove("has-image");
    sourceEls[kind].label.textContent = "未选择";
  }
  els.outputImage.removeAttribute("src");
  els.resultMask.removeAttribute("src");
  els.outputImage.parentElement.classList.remove("has-image");
  els.resultMask.parentElement.classList.remove("has-image");
  els.outputLink.href = "#";
  els.maskLink.href = "#";
  clearMaskEditor();
  setProcess("", "待机", "选择原图和 mask 后开始处理。", "ready");
  stopTimer();
  els.elapsed.textContent = "idle";
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    const config = await response.json();
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
    const response = await fetch("/api/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        image,
        mask,
        checkpoint,
        modelType: els.modelType.value,
        useBox: els.useBox.checked
      })
    });
    const result = await response.json();

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

bindSource("image");
bindSource("mask");
bindMaskEditor();
updateEditorControls();
els.form.addEventListener("submit", submitProcess);
els.resetButton.addEventListener("click", resetAll);
loadConfig();
