# SAM Mask Console

一个轻量 Web UI，用来上传原图和二值 mask，并调用 `~/Project/segment-anything/launch.py` 生成 SAM refined mask 和可视化结果。

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
~/Project/segment-anything
```

默认权重路径：

```text
~/Project/segment-anything/sam_vit_h_4b8939.pth
```

默认 Python 环境：

```text
conda run --no-capture-output -n vae-mnist python
```

也可以用环境变量覆盖：

```bash
SAM_DIR=/path/to/segment-anything SAM_CHECKPOINT=/path/to/sam.pth SAM_CONDA_ENV=vae-mnist npm start
```

如果想直接指定 Python 可执行文件，可以使用：

```bash
SAM_PYTHON=/path/to/python npm start
```

权重尚未下载时，页面会显示 `CHECKPOINT: MISSING`，提交处理会返回明确的缺失路径。下载权重后刷新页面即可运行。

## 输入方式

- 原始图片：拖拽/选择文件，或填写 `http(s)` 图片地址/本地路径。
- Mask 图片：拖拽/选择文件，或填写 `http(s)` 图片地址/本地路径。
- 地址支持 `~/Pictures/input.png` 这种 home 路径。

处理完成后，页面会显示：

- `MASKED OUTPUT`：`launch.py` 保存的红色半透明 mask 可视化图。
- `BINARY MASK`：`launch.py` 保存的二值 mask。
