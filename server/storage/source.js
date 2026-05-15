const fsp = require("node:fs/promises");
const path = require("node:path");
const { expandHome, fileExists } = require("../utils/path");

function sanitizeName(name, fallback) {
  const base = path.basename(name || fallback).replace(/[^\w.\-]+/g, "_");
  return base || fallback;
}

function extensionFromMime(mime) {
  if (!mime) return ".png";
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("bmp")) return ".bmp";
  if (mime.includes("tiff")) return ".tif";
  return ".png";
}

function extensionFromName(name, mime) {
  const ext = path.extname(name || "").toLowerCase();
  return ext || extensionFromMime(mime);
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?;base64,(.*)$/s.exec(dataUrl || "");
  if (!match) {
    throw new Error("上传文件格式无效。");
  }
  return {
    mime: match[1] || "application/octet-stream",
    buffer: Buffer.from(match[2], "base64")
  };
}

async function saveUploadedSource(source, label, runDir) {
  if (!source || typeof source !== "object") {
    throw new Error(`${label} 缺少输入。`);
  }

  if (source.mode === "file") {
    const { mime, buffer } = decodeDataUrl(source.dataUrl);
    const ext = extensionFromName(source.name, mime);
    const fileName = `${label}${ext}`;
    const targetPath = path.join(runDir, fileName);
    await fsp.writeFile(targetPath, buffer);
    return {
      path: targetPath,
      displayName: sanitizeName(source.name, fileName),
      sourceType: "file"
    };
  }

  if (source.mode === "address") {
    return saveAddressSource(source.address, label, runDir);
  }

  throw new Error(`${label} 输入模式无效。`);
}

async function saveAddressSource(rawAddress, label, runDir) {
  const address = String(rawAddress || "").trim();
  if (!address) {
    throw new Error(`${label} 地址为空。`);
  }

  if (isHttpUrl(address)) {
    const response = await fetch(address);
    if (!response.ok) {
      throw new Error(`${label} 下载失败：HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    const ext = extensionFromMime(contentType);
    const targetPath = path.join(runDir, `${label}${ext}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fsp.writeFile(targetPath, buffer);
    return {
      path: targetPath,
      displayName: address,
      sourceType: "url"
    };
  }

  const localPath = path.resolve(expandHome(address));
  if (!fileExists(localPath)) {
    throw new Error(`${label} 本地文件不存在：${localPath}`);
  }
  const ext = extensionFromName(localPath);
  const targetPath = path.join(runDir, `${label}${ext}`);
  await fsp.copyFile(localPath, targetPath);
  return {
    path: targetPath,
    displayName: localPath,
    sourceType: "path"
  };
}

module.exports = {
  saveUploadedSource
};
