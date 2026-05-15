import { sourceEls } from "./dom.js";
import { state } from "./state.js";
import { fileToDataUrl, isHttpUrl } from "./utils.js";

let sourceCallbacks = {
  onImageReferenceChange: () => {}
};

export function configureSources(callbacks) {
  sourceCallbacks = { ...sourceCallbacks, ...callbacks };
}

export async function applyFile(kind, file) {
  if (!file) return;
  state[kind].file = file;
  state[kind].dataUrl = await fileToDataUrl(file);
  sourceEls[kind].preview.src = state[kind].dataUrl;
  sourceEls[kind].frame.classList.add("has-image");
  sourceEls[kind].label.textContent = file.name;
  sourceEls[kind].address.value = "";
  state[kind].address = "";
  if (kind === "image") {
    sourceCallbacks.onImageReferenceChange(state[kind].dataUrl);
  }
}

export function applyAddress(kind, value) {
  state[kind].address = value.trim();
  if (state[kind].address) {
    state[kind].file = null;
    state[kind].dataUrl = "";
    sourceEls[kind].file.value = "";
    sourceEls[kind].preview.removeAttribute("src");
    sourceEls[kind].frame.classList.remove("has-image");
    sourceEls[kind].label.textContent = "地址输入";
    if (kind === "image") {
      sourceCallbacks.onImageReferenceChange(
        isHttpUrl(state[kind].address) ? state[kind].address : ""
      );
    }
  } else {
    sourceEls[kind].label.textContent = "未选择";
    if (kind === "image") {
      sourceCallbacks.onImageReferenceChange("");
    }
  }
}

export function sourcePayload(kind) {
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

export function resetSources() {
  for (const kind of ["image", "mask"]) {
    state[kind] = { file: null, dataUrl: "", address: "" };
    sourceEls[kind].file.value = "";
    sourceEls[kind].address.value = "";
    sourceEls[kind].preview.removeAttribute("src");
    sourceEls[kind].frame.classList.remove("has-image");
    sourceEls[kind].label.textContent = "未选择";
  }
  sourceCallbacks.onImageReferenceChange("");
}

export function bindSource(kind) {
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
