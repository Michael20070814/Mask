const { MAX_JSON_BYTES } = require("../config");

async function readRequestBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) {
      const err = new Error("请求体过大，请换用本地路径或压缩图片后重试。");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(req) {
  const body = await readRequestBody(req);
  return JSON.parse(body);
}

module.exports = {
  readJsonBody,
  readRequestBody
};
