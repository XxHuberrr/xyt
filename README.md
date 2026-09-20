# xy+t / 4D Motion Lab

xy+t 是一个基于 Web 的四维视频切片播放器：视频帧写入 WebGL2 `sampler2DArray`，每张 XY 帧平面沿 Z 轴按时间排列，拖拽画布可旋转时间体。视觉原设计参考：Instagram 艺术家 [@bradleytangonan](https://www.instagram.com/bradleytangonan/)。本项目是独立实现，代码以 MIT 许可证开源；MIT 许可证不授予第三方视频素材的使用权。

公开仓库：[XxHuberrr/xyt](https://github.com/XxHuberrr/xyt)。产品名称为 **xy+t**。安装包见 [Releases](https://github.com/XxHuberrr/xyt/releases)。

## 运行

在项目目录执行：

```bash
python3 server.py
```

然后打开 <http://127.0.0.1:4173/>。也可以直接双击 `index.html`，但使用本地服务能让不同浏览器的媒体读取行为更稳定。

## 桌面打包

桌面壳使用 Electron，网页核心仍由本地 HTTP 服务提供。安装 Node.js 后执行：

```bash
npm install
npm start
```

生成安装包：

```bash
npm run dist:mac   # macOS: dist/*.dmg, dist/*.zip
npm run dist:win   # Windows: dist/*Setup.exe, dist/*portable.exe
```

构建 macOS 安装包应在 macOS 上执行，Windows 安装包应在 Windows 上执行；这样可以获得平台原生签名与图标流程所需的构建环境。GitHub Actions 分别在 `macos-latest` 和 `windows-latest` runner 上构建，并将 DMG、ZIP 和 EXE 附加到标签对应的 GitHub Release。当前安装包未配置代码签名及 macOS 公证。

## 使用

- 公开版本不包含第三方参考视频，启动后选择自己的视频即可使用。如果本地项目中存在 `reference.mp4`，会自动载入；左侧拖入或选择任意 MP4 / MOV / WebM 即可替换。文件只通过浏览器 `URL.createObjectURL` 读取，不会上传。
- 视频载入后，播放器按左侧「采样帧率」从全时长写入 XY 时间切片，默认 20 FPS，可调范围为 1–50 FPS（受显卡可用层数保护），松开滑杆会重新建立时间体。采样画面最高 720px，高帧率会按 GPU 预算自动降低采样分辨率以保持可运行；首层会跳过浏览器解码产生的黑色首帧并选取第一个有效画面。默认不自动旋转，拖拽画布旋转，滚轮调整观察距离；播放或拖动时间轴时，当前时间帧会以高亮叠加显示但不会遮挡前景切片，立方体上方侧边和深度方向显示时间刻度与当前轨迹，其他切片保留边缘羽化过渡。
- 点击「运行检测」或按 `R`，动画持续约 5 秒，从真实视频帧读取亮度与帧间差分并生成报告。
- `Space` 播放/暂停，左右方向键前后跳转 10 秒。

## 目录

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面结构与交互文案 |
| `styles.css` | 深色实验室视觉和响应式布局 |
| `app.js` | WebGL2 时间切片体、播放、上传替换和帧检测 |
| `reference.mp4` | 可选的本地参考视频，不随公开版本发布 |
| `server.py` | Python 标准库静态服务器 |
| `electron-main.cjs` | Electron 本地 HTTP 壳，支持桌面运行 |
| `package.json` | Electron / electron-builder 脚本与跨平台构建配置 |
| `LICENSE` | MIT 开源许可证 |
