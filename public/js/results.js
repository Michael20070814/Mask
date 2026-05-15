import { els } from "./dom.js";
import { state } from "./state.js";
import { loadMaskIntoEditor, syncEditorReferenceFromInput } from "./editor.js";

export function setResultImages(outputUrl, maskUrl, imageUrl = "") {
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

export function clearResults() {
  els.outputImage.removeAttribute("src");
  els.resultMask.removeAttribute("src");
  els.outputImage.parentElement.classList.remove("has-image");
  els.resultMask.parentElement.classList.remove("has-image");
  els.outputLink.href = "#";
  els.maskLink.href = "#";
}
