import { els } from "./dom.js";
import { state } from "./state.js";

export function setProcess(mode, title, text, log) {
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

export function appendLog(line) {
  const next = `${els.logOutput.textContent}\n${line}`.trim();
  els.logOutput.textContent = next;
  els.logOutput.scrollTop = els.logOutput.scrollHeight;
}

export function startTimer() {
  state.startedAt = Date.now();
  els.elapsed.textContent = "0.0s";
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    const seconds = (Date.now() - state.startedAt) / 1000;
    els.elapsed.textContent = `${seconds.toFixed(1)}s`;
  }, 100);
}

export function stopTimer(durationMs) {
  clearInterval(state.timer);
  state.timer = null;
  if (typeof durationMs === "number") {
    els.elapsed.textContent = `${(durationMs / 1000).toFixed(1)}s`;
  }
}
