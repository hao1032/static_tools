# 静态工具箱 · Static Tools

一个**纯静态、零依赖**的在线小工具集合站点。每个工具独占一个文件夹，根目录 `index.html` 作为导航页。整个站点可直接部署到 Cloudflare Pages 或任意静态托管服务，**无需任何构建步骤**。

## 目录结构

```
.
├── index.html              # 根目录导航页（首页）
├── README.md               # 本说明
└── icons-generator/        # 工具一：ICO 文字图标生成器
    ├── index.html
    ├── style.css
    └── app.js
```

> 新增工具：在根目录建一个带 `index.html` 的文件夹（如 `qr-generator/`），然后在根目录 `index.html` 复制一张导航卡片链接过去即可。

## 本地开发预览

本站点为纯静态页面，无需构建。但由于 `clsf-viewer` 等工具使用了 **ES 模块**（`import` / `importmap`），浏览器安全策略禁止在 `file://` 协议下加载模块，因此必须通过 **HTTP 本地服务器** 预览，不能直接双击 `index.html` 打开。

### 快速启动（任选其一）

**方式一：Python（推荐）**

```bash
cd D:/code/static_tools
python -m http.server 8765
```

然后在浏览器访问：<http://localhost:8765/>

**方式二：Node.js**

```bash
cd D:/code/static_tools
npx serve -p 8765
# 或
npx http-server -p 8765
```

**方式三：VS Code Live Server 插件**

安装 Live Server 插件后，右键根目录 `index.html` → **Open with Live Server**。

### 预览各工具

| 工具 | 地址 |
| --- | --- |
| 首页导航 | <http://localhost:8765/> |
| ICO 文字图标生成器 | <http://localhost:8765/icons-generator/> |
| CLSF 刀轨 3D 预览 | <http://localhost:8765/clsf-viewer/> |

> 启动服务器时如果提示端口被占用，可用 `--bind 0.0.0.0` 或换一个端口（如 `8080`），并相应更新访问地址。
>
> 修改文件后刷新浏览器即可看到效果；如遇缓存，按 **Ctrl+F5** 强制刷新。

### 一键重启服务器（Windows）

仓库根目录提供了 `restart-server.bat`，双击即可**自动关闭占用 8765 端口的旧进程并重新启动服务器**，无需手动结束任务。

```
双击 restart-server.bat
```

脚本会：
1. 查找并终止所有占用端口 8765 的进程（解决端口冲突 / 旧服务器残留）
2. 在仓库根目录启动 Python HTTP 服务器（`0.0.0.0:8765`）
3. 终端窗口保持打开，显示服务器日志；**Ctrl+C** 或关闭窗口即可停止

> 如需修改端口或 Python 路径，编辑 `restart-server.bat` 顶部的 `PORT` 和 `PYTHON` 变量即可。

## 工具一：ICO 文字图标生成器

把文字（支持中文、多个字母）渲染成 `.ico` 图标，完全在浏览器本地完成，不上传任何数据。

### 功能

- **多层文字**：可叠加多个文字层，列表越靠上的图层显示在越上层；可拖动 `⠿` 手柄调整图层顺序。
- **每层独立控制**：
  - 文字内容（含中文、多字母）
  - 字号、颜色、透明度
  - 位置 X / Y（0–256 坐标系）
  - 字体、加粗
  - **旋转**（−180° ~ 180°，绕文字中心旋转）
- **画布控制**：背景颜色、透明背景、圆角大小（圆角外区域透明）。
- **预览即所得**：右侧实时预览，并附带 64 / 32 / 16px 小图瓦片，方便检查透明与缩小的观感。
- **预览区直接拖拽**：在预览图上按住文字即可拖动改位置，会自动选中鼠标下方**最近的文字**所属图层（不要求精准点到笔画）。
- **导出 ICO**：
  - 勾选需要的尺寸（16 / 32 / 48 / 64 / 128 / 256），点「生成并下载 .ico」导出**多分辨率合集**（标准 PNG-in-ICO 封装，256 按规范存为 0）。
  - 也可在尺寸列表中单独「下载 .ico」，每个尺寸导出为仅含该尺寸的 ICO 文件。
  - 文件名使用左侧填写的「文件名」（无需额外后缀，直接得到 `你的文件名.ico`）。

### 使用方法

1. 打开工具页（`icons-generator/index.html`）。
2. 在「文字图层」区填写文字，调整颜色、字号、位置、旋转等。点「+ 添加图层」追加更多文字层。
3. 设置背景、圆角，或在「透明背景」下做镂空图标。
4. 在预览区直接拖动文字微调位置（可选）。
5. 填写「文件名」、勾选导出尺寸，点击「生成并下载 .ico」；或逐尺寸单独下载。

> 所有处理均在本地浏览器完成，图片不会发送到任何服务器。

## 部署到 Cloudflare Pages

整个仓库就是静态站点根目录，无需构建。

### 方式一：Git 关联（推荐，支持自动更新）

1. 在 Cloudflare 控制台进入 **Pages** → **Create a project** → 选择 **Connect to Git**（GitHub / GitLab）。
2. 选择本仓库（`hao1032/static_tools`）。
3. 构建设置：
   - **Framework preset**：`None`
   - **Build command**：留空
   - **Build output directory**：`/`（即仓库根目录）
4. 点击 **Save and Deploy**。后续每次 `git push` 到 `main` 会自动重新部署。

### 方式二：直接拖拽上传

1. 在 Cloudflare Pages 点击 **Create a project** → **Upload assets**。
2. 把仓库根目录（`index.html`、`icons-generator/` 等）压缩或直接拖入上传区。
3. 部署完成即可获得 `.pages.dev` 域名。

### 自定义域名（可选）

在 Pages 项目 **Custom domains** 中添加你的域名并按提示配置 DNS（CNAME 到 `*.pages.dev`）。

## 技术说明

- 纯 HTML / CSS / 原生 JavaScript，无框架、无第三方依赖、无网络请求。
- ICO 采用标准 **PNG-in-ICO** 封装（ICONDIR + ICONDIRENTRY + PNG 数据，小端字节序），Windows 与浏览器均兼容。
- 坐标 / 字号 / 圆角基于 256×256 虚拟画布定义，导出时按比例缩放到各目标尺寸。
