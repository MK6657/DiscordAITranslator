# Discord AI Translator

[中文](README.md) | [English](README.en.md)

换机继续开发：[优化清单与接手说明](docs/optimization-handoff.md)（包含未完成项和真机验收步骤）。

Discord AI Translator 是一个 BetterDiscord 桌面插件，用于输入润色、公开双语输入、手动消息翻译和频道自动翻译。

## 当前版本

`v0.4.0` · 2026-09-26 · 预览版（Pre-release）

版本号显示在设置窗口标题栏、插件启动提示和 BetterDiscord 插件列表中；改动见 [CHANGELOG.md](CHANGELOG.md)。

源码检查、构建一致性、离线回归（模块测试和发布产物回归）、安装器安装/回滚和产物结构已在本地通过。v0.4.0 重做了设置窗口、快捷面板、聊天里的译文行和错误行，这些新界面以及“发送前询问”的发送方式都还没有在真实 Discord 中验收，因此仍以预览版发布，不是稳定版。待验收清单见 [宿主记录](docs/host-smoke-test.md) 和 [接手说明](docs/optimization-handoff.md)。

本项目是第三方插件，并非 Discord 官方产品。使用前请自行了解客户端修改的相关规则和风险；不要用重要账号或敏感频道做首次测试。

## 已实现

- 中文/英文界面。左下角 AI 按钮打开快捷面板，按钮上的状态标记显示翻译服务当前是否正常。
- 完整设置窗口分六个标签页，带设置搜索、上手清单、服务状态卡片、模型检测和“试译一句/试润色”。
- 输入润色、重复润色、恢复原文、发送前询问、可录制的润色快捷键和公开双语输入。
- 消息按钮与右键菜单手动翻译，支持回复预览和长文本救援；译文行可复制、不用缓存重新翻译或隐藏，部分译文会标出缺了哪几段。
- 翻译失败时，消息下的错误行直接说明原因，并给出“打开设置”“测试连接”“重试”或等待时间。
- 可见消息自动翻译、频道规则（跟随总开关 / 总是翻译 / 不翻译）、显式历史补翻、预取、并发控制、服务商冷却和终止失败保护。
- 内存及持久化翻译缓存（按消息计数）、请求去重、输出校验、诊断日志和失败原因追踪。
- 多套润色/翻译提示词模板，以及每个服务商独立的配置档案。
- DeepSeek、OpenAI-compatible、Sakura local、Google Cloud Translation、Microsoft Translator、DeepL 和百度翻译。
- 可选的手动翻译备用服务（fallback）；默认关闭，Sakura local 不会自动回退到云端。

## 设置入口

- **快捷面板**：点 Discord 左下角用户栏（设置齿轮附近）的 AI 按钮。面板里有自动翻译开关、本频道规则、翻译成哪种语言、遮蔽译文、翻译后遮挡原文、译文位置和“测试”按钮；“打开完整设置”在面板底部和右上角齿轮。Esc 关闭。
- **状态标记**：AI 按钮右下角的小标记用形状和颜色同时表示状态。绿色实心点 = 正常；琥珀色圆环 = 正在翻译或测试；琥珀色三角 = 请求太多或冷却中，稍后自动继续；红色“!” = 需要你处理（缺少或被拒绝的 API Key、额度用完、本地服务没响应、测试没通过、接口地址不可用、找不到接口或模型）；灰色短横 = 本频道不自动翻译。鼠标悬停可看到文字说明。
- **完整设置**：六个标签页是 概览、翻译消息、输入框工具、显示、高级、数据与诊断。顶部搜索框可以按名称或说明找到任意设置并直接跳过去。也可以从 BetterDiscord 插件列表里的设置按钮打开。
- **频道规则**：“跟随总开关”随自动翻译总开关；“总是翻译”相当于白名单，即使总开关关闭，这个频道也会自动翻译；“不翻译”总是优先。手动翻译不受频道规则影响。从 v0.3.0 升级时，“继承全局”和“本频道启用”都变为“跟随总开关”（0.3.0 的“本频道启用”实际就是跟随总开关），“本频道禁用”变为“不翻译”，所以升级后不会有频道自己开始自动翻译。
- **恢复默认设置**：在“数据与诊断”最下方的“危险操作”里。确认对话框会列出将恢复默认的内容；“保留 API Key、Google Key 池和提示词模板”默认勾选，界面语言也保持不变。取消勾选才会一并清除这些内容。

## 文件

- `src/`：唯一应手工修改的源码目录。
- `DiscordAITranslator.plugin.js`：由 esbuild 生成并提交的 BetterDiscord 单文件发布产物，普通用户无需 Node.js。
- `tests/core/`：已抽离模块的聚焦测试。
- `scripts/verify-plugin.js`：根插件离线回归脚本。
- `scripts/install-plugin.ps1`：Windows 安装、备份、SHA256 校验和可选自动启用脚本。
- `docs/architecture.md`：源码/生成物边界与后续拆分顺序。
- `docs/critical-chain-contracts.md`：重构不可破坏的关键链行为契约。
- `docs/host-smoke-test.md`：真实 Win11 + Discord + BetterDiscord 宿主冒烟记录。

## 插件安装（无需 Node.js）

1. 安装 BetterDiscord。
2. 打开 Discord 设置中的 `BetterDiscord` -> `Plugins`。
3. 点击 `Open Plugins Folder`。
4. 打开仓库根目录的 [DiscordAITranslator.plugin.js](DiscordAITranslator.plugin.js)，下载原始文件（不要保存 GitHub 网页），放入插件目录并启用。私有仓库需要先登录有访问权限的账号。

插件用户只需要这个 `.plugin.js` 文件，不需要安装 Node.js、npm 或 esbuild。当前只有预览版 Release，尚无稳定版；自动翻译会将消息发给所选服务，建议先保持关闭，在专用频道手动测试。

常见 Windows 插件目录：

```text
C:\Users\<你的用户名>\AppData\Roaming\BetterDiscord\plugins
```

从源码运行时也可以使用安装脚本。脚本会检查语法和 SHA256，为已有插件创建备份，并原子更新 BetterDiscord profile 的启用状态：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-plugin.ps1
```

先预览而不写入：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-plugin.ps1 -WhatIf
```

只安装、不自动启用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-plugin.ps1 -NoEnable
```

安装脚本（包括 `-WhatIf` 预览）会先检查当前窗口是不是运行在某个打包的桌面应用里（例如 AI 应用的内置终端）。这类窗口写入 `%APPDATA%` 的文件会被重定向到该应用的私有目录，正常启动的 Discord 看不到。发现这种情况时，脚本会说明原因、不做任何修改，并以退出码 2 结束；请改在开始菜单打开的普通 PowerShell 窗口中运行，再用 `npm run plugin:check` 确认。确实要装进该应用的私有副本时，才加 `-AllowRedirectedAppData`。

### 确认装的是哪个版本

```powershell
npm run plugin:check
```

该命令需要本仓库的克隆以及 Node.js/npm；没有 npm 时也可在仓库目录运行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-installed-plugin.ps1`。只下载了插件文件的用户，可直接看设置页顶部显示的版本号。它会列出仓库构建与已安装插件的版本和 SHA256，并检查三种“装了却没生效”的情况：某个应用（例如 AI 桌面应用）保存的私有 BetterDiscord 副本、当前窗口的写入被重定向到应用私有目录、Discord 启动文件没有加载 BetterDiscord。安装和检查都请在开始菜单打开的普通 PowerShell 窗口中运行，不要在 AI 应用的内置终端里运行。

## Windows 11 从源码运行

准备环境：

- Windows 11。
- Node.js 22 或 24 LTS，安装时包含 npm。
- Windows PowerShell 5.1（Win11 自带，安装器和 CI 以此为验证基线）。
- BetterDiscord；只有实际安装/宿主验证需要 Discord。

在项目目录依次运行：

```powershell
npm ci
npm run verify
npm run plugin:install:dry-run
npm run plugin:install
```

`npm run verify` 会重新生成根插件、检查全部 JavaScript、运行模块测试、运行 2,300+ 条发布产物回归、在临时 BetterDiscord 目录验证安装/启用/回滚，并检查生成物元数据和导出形态。

日常开发命令：

```powershell
npm run build          # 从 src/ 生成根插件
npm run build:check    # 确认生成物没有漂移
npm test               # 模块测试 + 根插件完整回归
npm run ci             # 源码、生成物、回归和安装器门禁
npm run release:check  # 与 GitHub Windows CI 相同的完整发布门禁
```

不要直接修改 `DiscordAITranslator.plugin.js`；修改 `src/` 后运行 `npm run build`。

## Provider 配置

| Provider | 润色 | 消息翻译 | 主要配置 |
| --- | --- | --- | --- |
| DeepSeek | 支持 | 支持 | API key、endpoint、model |
| OpenAI-compatible | 支持 | 支持 | API key、endpoint、model |
| Sakura local | 支持 | 支持 | 本机 endpoint、model；API key 可留空 |
| Google Cloud Translation | 不支持 | 支持 | Key 池、月度字符额度 |
| Microsoft Translator | 不支持 | 支持 | API key、region、endpoint |
| DeepL | 不支持 | 支持 | API key、Free/Pro 方案 |
| 百度翻译 | 不支持 | 支持 | App ID、Secret Key、endpoint |

输入语言默认自动检测，目标语言可从预设选择，也可以填写自定义语言名称。润色和消息翻译各自保存 provider、凭据、目标语言、模型参数和提示词。

远程 API endpoint 必须使用 HTTPS。只有 `localhost`、IPv4/IPv6 loopback 和本机通配地址允许 HTTP；URL 中不允许嵌入用户名或密码。

所有 API 请求都禁止自动重定向，避免把消息文本或服务凭据转发到未指定的地址。请直接填写最终可信的 API URL（包括正确路径和末尾斜杠），不要依赖 301/302/303/307/308 跳转。

## 数据边界

插件使用 `BdApi.Data` 在 BetterDiscord 本地数据目录保存以下内容：

- 设置和服务商凭据（`DiscordAITranslator.config.json`），包括 API key、Google Key 池、百度 App ID/Secret Key。BetterDiscord 没有提供跨平台系统凭据保险库，这些值会存在本机数据文件中，请限制该目录的访问权限。
- 翻译缓存（`DiscordAITranslator.cache.config.json`），默认保留 48 小时、最多 4000 条消息。缓存包含译文和用于区分频道/消息/配置的身份键，可在“数据与诊断”标签页清空。
- 诊断日志（`DiscordAITranslator.diagnostics.config.json`）。日志设计为保存哈希、状态和错误元数据，不保存原始 API key 或完整消息文本，模型只记录文件名；导出前仍建议检查内容。

v0.4.0 起缓存和诊断日志不再与设置存在同一个文件里；首次启动时旧数据会自动迁移，新文件保存成功之前不会删除旧数据。“恢复默认设置”默认保留 API Key、Google Key 池（含本月用量）和提示词模板。

插件不会把凭据写入 Discord 消息。自定义 endpoint 会收到待润色/翻译文本，因此只应配置你信任的服务。

## 本地验证

推荐使用统一入口，且不需要 Discord 或真实 API key：

```powershell
npm ci
npm run verify
```

`scripts/verify-plugin.js` 直接加载根目录插件，覆盖配置迁移、provider 请求与解析、fallback 凭据隔离、缓存、自动翻译队列、长文本、诊断、生命周期和 DOM mock 回归。

GitHub Actions 在 `windows-latest` 上使用 Node 22 和 Node 24 执行 `npm ci` 与 `npm run release:check`。

## 更新和卸载

- 更新：替换根插件后重新启用；安装脚本会保留带时间戳的旧插件备份。
- 卸载：在 BetterDiscord 插件页面禁用并删除 `DiscordAITranslator.plugin.js`。
- 清理本地数据：先在插件设置中清空缓存和诊断，再按需删除 BetterDiscord 插件目录中的 `DiscordAITranslator.config.json`、`DiscordAITranslator.cache.config.json` 和 `DiscordAITranslator.diagnostics.config.json`。操作前保留需要的服务商配置。

## 故障排查

- `npm ci` 失败：确认 Node 是 22/24 LTS，并删除未完成的 `node_modules` 后重试；不要删除 `package-lock.json`。
- `build:check` 报生成物过期：运行 `npm run build`。
- 安装脚本找不到插件：先运行 `npm run build`。
- BetterDiscord 看不到插件：运行 `npm run plugin:install:dry-run` 检查目标路径，再确认 BetterDiscord profile 已启用插件。
- Discord 更新后按钮消失：先导出脱敏诊断并运行 `npm test`，再检查 Discord DOM/BetterDiscord API 兼容性。

## 开源状态

项目采用 MIT 许可证。历史来源/相似性审计记录的结论为独立实现、低风险通过；本次整理并未重新开展法律审计。`external/` 和内部研究资料不会进入仓库或发布产物，`npm run release:check` 会校验许可证、来源记录、敏感信息模式、构建、回归和安装器；模式扫描不能代替完整安全审计。详情见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [docs/provenance-review.md](docs/provenance-review.md)。

## 当前限制

- Discord DOM、Webpack 模块和 BetterDiscord API 更新仍可能影响按钮、菜单、observer 和消息身份解析。
- v0.4.0 的新界面只在离线测试和浏览器模拟页面中检查过，尚未在真实 Discord 中验收：快捷面板与状态标记、设置标签页与搜索、恢复默认对话框、快捷键录制、模型检测、试译一句，以及从 v0.3.0 升级后缓存译文的保留与频道规则的转换。
- “发送前询问”确认后通过向输入框发送回车来发送；润色和公开双语的写入依赖 Discord 输入框（Slate 编辑器）的内部结构。离线测试使用模拟输入框，真实输入框的写入和发送仍需验收。
- Google、百度、DeepL 的新错误提示目前只用模拟的服务商回复测试过，尚未用真实账号逐一触发。
- 真实宿主记录只覆盖 v0.2.0 的加载/设置/启停和 9 月 8 日的有限本地模型冒烟测试；v0.3.0 与 v0.4.0 都没有完成完整的真机验收。
- 已拆出设置、服务商、缓存、校验、诊断、自动翻译队列/请求、快捷面板等模块；主实现仍约 17,700 行，离线回归脚本也较大。
- Android 端不能直接使用 BetterDiscord 插件。
- API key 由 BetterDiscord 本地数据存储保存，当前没有 Windows Credential Manager 等系统级加密集成。

## 下一阶段

1. 优先完成 v0.4.0 的真机验收（清单见 [接手说明](docs/optimization-handoff.md) 和 [宿主记录](docs/host-smoke-test.md)）：快捷面板、设置窗口、恢复默认、发送前询问、快捷键录制、真实服务商的错误提示、本地模型检测，以及启停、滚动、编辑和停止后的晚到响应。
2. 验收通过后，将自动翻译的多套 Set/Map/Array 收敛为单一任务状态机，再抽离 Discord 适配层。
3. 后续考虑仅内存缓存选项、设置导入导出、更明确的数据清理入口，以及随缓存格式升级把缓存键中的消息身份改为哈希。

`HANDOFF.md`、`BASELINE-2026-07-26b.md`、`BASELINE-2026-07-26c.md` 为历史记录。旧源码快照、回退压缩包、运行配置及依赖目录不随仓库提交。安全问题请参阅 [SECURITY.md](SECURITY.md)，不要把真实 key、消息正文或未脱敏日志放进 issue。

9 月 8 日的安装器回滚与 API 重定向修复、回归覆盖及当时的产物指纹见 [2026-09-08 复查记录](docs/review-2026-09-08.md)；v0.4.0 的构建指纹见 [接手说明](docs/optimization-handoff.md)。
