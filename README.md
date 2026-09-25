# Discord AI Translator

[中文](README.md) | [English](README.en.md)

换机继续开发：[优化清单与接手说明](docs/optimization-handoff.md)（包含未完成项和真机验收步骤）。

Discord AI Translator 是一个 BetterDiscord 桌面插件，用于输入润色、公开双语输入、手动消息翻译和频道自动翻译。

## 当前版本

`v0.3.0` · 2026-09-25 · 预览版（Pre-release）

版本号显示在设置页顶部、插件启动提示和 BetterDiscord 插件列表中；改动见 [CHANGELOG.md](CHANGELOG.md)。

源码检查、构建一致性、离线回归、安装器安装/回滚和产物结构已有本地验证。v0.3.0 的滚动时绘制缓存译文、本地模型预翻译等改动仍需真实 Discord 验收，因此以预览版发布，不是稳定版。历史宿主记录见 [宿主记录](docs/host-smoke-test.md)。

本项目是第三方插件，并非 Discord 官方产品。使用前请自行了解客户端修改的相关规则和风险；不要用重要账号或敏感频道做首次测试。

## 已实现

- 中文/英文设置界面、快速设置面板和输入快捷键。
- 输入润色、重复润色、恢复原文、发送前确认和公开双语输入。
- 消息按钮与右键菜单手动翻译，支持回复预览和长文本救援。
- 可见消息自动翻译、频道级策略、显式历史补翻、预取、并发控制、provider cooldown 和终止失败保护。
- 内存及持久化翻译缓存、请求去重、输出校验、诊断日志和失败原因追踪。
- 多套润色/翻译提示词模板，以及 provider 独立配置档案。
- DeepSeek、OpenAI-compatible、Sakura local、Google Cloud Translation、Microsoft Translator、DeepL 和百度翻译。
- 可选的手动云 provider fallback；默认关闭，Sakura local 不会自动回退到云端。

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

- 设置和 provider 凭据，包括 API key、Google Key 池、百度 App ID/Secret Key。BetterDiscord 没有提供跨平台系统凭据保险库，这些值会存在本机数据文件中，请限制该目录的访问权限。
- 翻译缓存，默认保留 48 小时、最多 4000 条。缓存包含译文和用于区分频道/消息/配置的身份键，可在设置的缓存页面清空。
- 诊断日志。日志设计为保存哈希、状态和错误元数据，不保存原始 API key 或完整消息文本；导出前仍建议检查内容。

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
- 清理本地数据：先在插件设置中清空缓存和诊断，再按需删除 BetterDiscord 数据目录中的 `DiscordAITranslator` 数据。操作前保留需要的 provider 配置。

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
- 旧产物已完成实际 Discord 客户端的加载、设置页和启停循环；当前 c 版尚未完成真实宿主验收，包括输入框/消息按钮、切频道、滚动、消息编辑和真实 provider 请求。
- 已拆出设置、provider、缓存、校验、诊断和自动翻译队列/请求模块；主实现仍约 14,000 行，离线回归脚本也较大。
- Android 端不能直接使用 BetterDiscord 插件。
- API key 由 BetterDiscord 本地数据存储保存，当前没有 Windows Credential Manager 等系统级加密集成。

## 下一阶段

1. 优先完成当前 c 版的真机验收：启停、输入框写入竞争、消息翻译、滚动/编辑、自定义 emoji、真实 provider 请求及停止后的晚到响应。
2. 验收通过后，将自动翻译的多套 Set/Map/Array 收敛为单一任务状态机，再抽离 Discord 适配层。
3. 后续考虑仅内存缓存选项、设置导入导出和更明确的数据清理入口。

`HANDOFF.md`、`BASELINE-2026-07-26b.md`、`BASELINE-2026-07-26c.md` 为历史记录。旧源码快照、回退压缩包、运行配置及依赖目录不随仓库提交。安全问题请参阅 [SECURITY.md](SECURITY.md)，不要把真实 key、消息正文或未脱敏日志放进 issue。

后续安装器回滚与 API 重定向修复、回归覆盖及当前产物指纹见 [2026-09-08 复查记录](docs/review-2026-09-08.md)。
