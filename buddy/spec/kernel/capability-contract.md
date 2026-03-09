# 能力合约

> Owner Domain: `BD-CAP-*`

## BD-CAP-001 Manifest 能力真相源

`tables/capabilities.yaml` 中的能力注册表必须与 manifest 和运行时注册面一致。

## BD-CAP-002 允许的 SDK 表面

Buddy 业务路径只允许使用稳定的 `@nimiplatform/sdk/mod/*` 导出。

禁止：
1. 直接导入 `@nimiplatform/sdk/mod/host`
2. 直接调用浏览器 fetch 访问外部 AI/TTS 端点
3. 导入 Tauri 原生 API

## BD-CAP-003 语音能力治理

语音调用必须使用声明的语音能力和结构化请求字段：
1. TTS 优先使用 `runtime.media.tts.stream`，回退到 `tts.synthesize`
2. STT 使用 `runtime.media.stt.transcribe`
3. 语音目录查询使用 `runtime.media.tts.listVoices`

## BD-CAP-004 路由查询边界

运行时路由选项从 mod 侧为只读查询能力。Buddy 的路由覆盖仅影响自身，不得变更全局运行时默认值。

## BD-CAP-005 Live2D 渲染能力边界

Live2D 渲染在 mod 内部完成，使用 bundled 的 `pixi.js` + `pixi-live2d-display`：
1. 模型文件（.moc3、纹理、physics、pose）从 mod assets 加载
2. Canvas/WebGL 上下文由 mod UI 组件管理
3. 模型参数控制通过 `coreModel.setParameterValueById()` 驱动
4. 不依赖外部渲染服务

## BD-CAP-006 口型同步能力边界

口型同步在 mod 内部完成，使用 bundled 的 wLipSync（WASM + AudioWorklet）：
1. 音频源为 TTS 输出的 AudioBuffer/MediaStream
2. MFCC 分析在 AudioWorklet 中实时执行
3. 音素检测结果（A/E/I/O/U/S）映射到 `ParamMouthOpenY`
4. 不依赖外部口型同步服务
