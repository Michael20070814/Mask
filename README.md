# Mask Edit Console

一个轻量 Web UI，用来上传原图和二值 mask，并调用旁边的 `~/Project/infer_pkg/inference.py` 执行 Qwen Image mask edit。

## 启动

```bash
npm start
```

默认访问地址：

```text
http://127.0.0.1:5173
```

如果 `5173` 被占用，服务会自动尝试后续端口。

## 配置

默认后端目录：

```text
~/Project/infer_pkg
```

默认 base model：

```text
Qwen/Qwen-Image-Edit-2511
```

默认 LoRA 权重：

```text
~/Project/infer_pkg/pretrained_weights/pytorch_lora_weights.safetensors
```

默认 Python 环境：

```text
conda run --no-capture-output -n vae-mnist python
```

也可以用环境变量覆盖：

```bash
INFER_PKG_DIR=/path/to/infer_pkg \
INFER_BASE_MODEL=Qwen/Qwen-Image-Edit-2511 \
INFER_LORA_MODEL=/path/to/pytorch_lora_weights.safetensors \
INFER_CONDA_ENV=vae-mnist \
npm start
```

如果想直接指定 Python 可执行文件，可以使用：

```bash
INFER_PYTHON=/path/to/python npm start
```

默认 prompt、步数和设备也可以通过 `INFER_PROMPT`、`INFER_NUM_INFERENCE_STEPS`、`INFER_DEVICE` 覆盖。页面会显示 `MODEL: READY` 或明确的缺失状态。

后端默认以离线模式调用推理进程，不会主动从 Hugging Face Hub 下载模型。对于 `Qwen/Qwen-Image-Edit-2511` 这种 Hub model id，提交前会检查本地 Hugging Face cache 是否存在完整 snapshot；如果 cache 残缺，会直接返回 `BASE_MODEL_CACHE_INCOMPLETE`。也可以把页面里的 Base model 改成一个完整的本地模型目录。

## 输入方式

- 原始图片：拖拽/选择文件，或填写 `http(s)` 图片地址/本地路径。
- Mask 图片：拖拽/选择文件，或填写 `http(s)` 图片地址/本地路径。
- 地址支持 `~/Pictures/input.png` 这种 home 路径。

处理完成后，页面会显示：

- `EDIT OUTPUT`：`infer_pkg` 保存的编辑结果可视化图。
- `BINARY MASK`：本次推理使用的输入 mask，可继续在页面内编辑。
