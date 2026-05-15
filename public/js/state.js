export const state = {
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
