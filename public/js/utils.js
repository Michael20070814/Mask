export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取文件失败。"));
    reader.readAsDataURL(file);
  });
}

export function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

export function stampedUrl(url, key) {
  if (!url || url.startsWith("data:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${Date.now()}`;
}

export function canvasToPngBlob(canvas, errorMessage) {
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

export function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadUrl(url, filename) {
  const response = await fetch(stampedUrl(url, "download"), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`下载失败：HTTP ${response.status}`);
  }
  downloadBlob(await response.blob(), filename);
}
