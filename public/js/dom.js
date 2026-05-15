export const els = {
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

export const sourceEls = {
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
