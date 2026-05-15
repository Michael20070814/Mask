import { els } from "./dom.js";
import { state } from "./state.js";
import {
  canvasToPngBlob,
  downloadBlob,
  downloadUrl,
  isHttpUrl,
  stampedUrl
} from "./utils.js";

export function editorContext() {
  return els.maskEditor.getContext("2d", { willReadFrequently: true });
}

export function setEditorReference(imageUrl) {
  state.editor.imageUrl = imageUrl || "";
  if (state.editor.imageUrl) {
    els.editorImageOverlay.src = stampedUrl(state.editor.imageUrl, "ref");
  } else {
    els.editorImageOverlay.removeAttribute("src");
  }
  updateEditorControls();
}

export function syncEditorReferenceFromInput(fallbackUrl = "") {
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

export function updateEditorControls() {
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

export function clearMaskEditor() {
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

export function loadMaskIntoEditor(maskUrl) {
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

export function editorCanvasToBlob() {
  return canvasToPngBlob(els.maskEditor, "导出 mask 失败。");
}

export function bindMaskEditor({ onUseEditedMask } = {}) {
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
    const result = onUseEditedMask?.();
    result?.catch((error) => setEditorMeta(error.message));
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

function setEditorMode(mode) {
  state.editor.mode = mode;
  updateEditorControls();
}

function setEditorMeta(text) {
  els.editorMeta.textContent = text;
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
