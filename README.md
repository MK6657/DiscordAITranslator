<div align="center">

# Discord AI Translator

**面向 Windows BetterDiscord 的 AI 频道消息翻译、输入润色与公开双语插件**

[![Windows CI](https://github.com/MK6657/DiscordAITranslator/actions/workflows/ci.yml/badge.svg)](https://github.com/MK6657/DiscordAITranslator/actions/workflows/ci.yml)
![Release](https://img.shields.io/badge/release-v0.6.1-2EA043)
![Platform](https://img.shields.io/badge/platform-Windows%20BetterDiscord-0078D4)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

**简体中文** | [English](README.en.md)

</div>

---

Discord AI Translator 专为跨语言交流与高频聊天场景打造：既支持 **DeepSeek / OpenAI 兼容接口 / 本机 Sakura 模型** 与 **Google / Microsoft / DeepL / 百度** 等 7 大服务商，也内置了 **59 套写作润色风格（常规语气、22 种中国方言、29 位历史与全球名人风味）**，并通过双模式快捷面板、频道级自动翻译规则与无卡顿渲染，让翻译和写作自然融入 Discord 原生体验。

> [!NOTE]
> 本项目为第三方 BetterDiscord 插件，并非 Discord 官方产品。使用前请了解第三方客户端插件的相关规则与风险，建议先在测试频道验证后再开启自动翻译。

## 核心功能一览

### 💬 频道消息翻译（手动 & 自动）
- **多种手动触发**：每条消息支持一键翻译按钮（可设悬停显示 / 常驻 / 关闭）及右键菜单翻译，完整支持**回复预览翻译**与**超长文本分段救援**（单段失败时保留已译片段并标注缺失段落，支持一键重试）。
- **智能自动翻译**：支持可见消息自动翻译、**独立频道规则**（跟随总开关 / 总是翻译白名单 / 永不翻译黑名单）、显式历史消息补翻、临近消息预取、1–10 并发调节、服务商冷却退避与终止失败保护。
- **灵活展示与译文交互**：支持译文显示在原文上方或下方、三种样式（淡色背景 / 柔和文字 / `译` 标签）、字号切换（100% / 90%）、**遮蔽译文**（点击或回车/空格展开）、**译后遮挡原文**（悬停或键盘聚焦查看原文），以及阿拉伯语/希伯来语/波斯语等 **RTL 从右到左排版**。
- **译文行悬浮工具栏**：鼠标悬停或键盘 Tab 聚焦任意译文行，即可一键**复制译文**、**无视缓存重新翻译**或**隐藏译文**。
- **可操作的错误提示**：翻译失败时直接在消息下方用清晰中文说明原因，并按场景给出「打开设置」「测试连接」「重试」或限流倒计时。

### ✨ 输入框 AI 润色 & 59 套内置风格预设
- **输入框分裂式润色按钮**：在 Discord 输入框旁一键润色，点击下拉箭头即可直接呼出**快捷语气选择器**（按「常规 / 方言 / 大能」三类标签页与分组浏览，无需打开设置窗口）。
- **完整写作工作流**：支持**重复润色**（可选择基于原文或上次润色结果继续优化）、**一键恢复原文**、**发送前确认弹窗**、**自定义快捷键录制**（默认 `Ctrl+Alt+P`）以及自定义保存归类提示词模板。
- **格式与安全保护**：润色过程中自动保留换行、@提及、身份组与频道提及、自定义表情、引用块、代码块与零宽空格；若结果返回时草稿已变动或切换了频道，会弹出结果面板供复制或手动写入，避免覆盖新输入。

| 分类 | 内置数量 | 覆盖场景 / 代表风格 |
| --- | :---: | --- |
| **常规风格** | 8 套 | 自然聊天、礼貌清晰、简短直接、地道口语（去翻译腔）、技术 / Bug 反馈、游戏 / 开黑社区、高情商 / 委婉沟通、正式 / 公告与合作 |
| **中国方言** | 22 套 | 覆盖**华南闽台**（粤语/港味/潮汕/客家/闽南/台湾腔等）、**西南**（川渝/云贵）、**北方**（东北/京味/天津/陕西/河南/山东/新疆）、**华东华中**（上海/江浙/南京/武汉/湖南） |
| **大能风味** | 29 套 | 覆盖**帝王将相**（秦始皇/朱元璋/曹操/雍正朱批等）、**谋士名将**（诸葛亮/司马懿/孙子/项羽）、**文人墨客**（鲁迅/林黛玉/苏轼/王阳明/庄子/郭德纲等）、**全球名宿**（莎士比亚/特朗普/尼采/马克思/拿破仑/丘吉尔/马斯克） |

<details>
<summary>展开查看全部 59 套内置润色风格 & 6 套内置翻译模板</summary>

- **常规润色（8 套）**：自然聊天润色、礼貌清晰、简短直接、地道口语（去翻译腔）、技术 / Bug 反馈、游戏 / 开黑社区、高情商 / 委婉沟通、正式 / 公告与合作
- **中国方言（22 套）**：
  - 华南与闽台：广府白话、港式粤语、客家话、潮汕话、广西老表、闽南话、台湾腔
  - 西南：川渝话、云南话、贵州话
  - 北方：东北话、京味儿、天津话、陕西话、河南话、山东话、新疆话
  - 华东与华中：上海话、江浙软语、南京话、武汉话、湖南话
- **大能风味（29 套）**：
  - 帝王将相：秦始皇、汉武帝、朱元璋、蒋介石、曹操、唐太宗、雍正
  - 谋士名将：诸葛亮、司马懿、孙子、项羽
  - 文人墨客：鲁迅、林黛玉、王阳明、李白、苏轼、孔子、庄子、张爱玲、钱钟书、王小波、郭德纲
  - 全球名宿：莎士比亚、特朗普、尼采、马克思、拿破仑、丘吉尔、马斯克
- **消息翻译模板（6 套）**：自然翻译、准确直译、社区梗与口语（接地气）、技术 / AI / 开发频道、游戏 / 二次元社区、官方公告 / 更新日志

</details>

### 🌐 公开双语输入（Public Bilingual）
- 输入框旁提供一键**公开双语**按钮，自动将你的草稿译为目标语言并与原文合并输出，方便在多语言服务器中直接发言。
- 支持开启**润色后自动衔接公开双语**；自动保护代码块、提及、自定义表情与剧透标记，重复点击不会嵌套旧译文。

### ⚡ 双模式快捷面板 & 完整设置中心
- **左下角 AI 按钮快捷面板**：无需进入 Discord 设置即可快速切换操作，支持 **翻译** / **润色** 双标签页：
  - **翻译模式**：切换已保存服务配置、自动翻译开关、当前频道规则、目标语言（13 种常用语言预设 + 自定义语言）、翻译提示词模板、遮蔽/隐藏原文、译文位置与一键连接测试。
  - **润色模式**：切换润色服务配置、润色总开关、输出语言、润色语气模板、创意度（Temperature）滑块与「稳健 / 均衡 / 创意」三档预设、润色后动作、重复润色基准、公开双语开关，以及内嵌**快捷试润色**抽屉。
- **AI 按钮实时状态徽章**（颜色 + 形状双重识别，悬停显示完整摘要）：

| 状态徽章 | 含义 |
| --- | --- |
| 🟢 绿色实心点 | 服务正常，自动翻译运行中 |
| 🟠 琥珀色圆环 | 正在执行翻译或连接测试 |
| 🔺 琥珀色三角 | 触发限流或短暂冷却中，稍后自动恢复 |
| ❗ 红色叹号 | 需要你处理（缺少或无效 API Key、额度耗尽、本地服务离线、接口或模型错误） |
| ➖ 灰色短横 | 当前频道未启用自动翻译 |

- **6 标签完整设置窗口 & 六语界面一键切换**：包含 **概览**（含新手上手清单与服务状态卡片）、**翻译消息**、**输入框工具**（含可调最大输出长度 `maxTokens`）、**显示**（支持跟随 Discord / 浅色 / 深色三套窗口主题）、**高级**、**数据与诊断**（含宿主健康检查）。全面内置 **简体中文、繁體中文、English、Русский、العربية（完整 RTL 从右到左镜像）、Español** 六大界面语言，并在**快捷面板顶栏、设置窗口顶栏与概览页**三处提供原生母语快捷切换栏（`简中 | 繁體 | EN | Рус | عربي | ES`），无需看懂当前语言即可一键原地刷新；顶部支持多语种**全文搜索设置项**直达定位，内置**本机/兼容接口模型自动检测**与**试译一句 / 试润色**。

### 🧱 V0.5/V0.6 模块化架构与工程护栏
- **清晰分层源码**：主入口 `src/discord-ai-translator.js` 精简为 ~760 行生命周期装配壳，内置 `src/core/`（`DisposableScope` / `EventBus` / `PluginContext`）、`src/i18n/`（六语词库与语言元数据）、`src/presets/`、`src/settings/ui/`、`src/composer/`、`src/discord/`（统一 `DiscordHostAdapter`）与 `src/auto-translation/`（单一状态机 + 冷却表）。
- **插件化服务商注册表**：7 家服务商均作为独立适配器注册在 `src/providers/adapters/`，请求构建/解析、任务能力校验、备用顺序、档案保存与连接测试均以 `ProviderRegistry` 为准（新增自定义适配器只需注册适配器对象；若需专属非标准设置项表单或本地化名称，再补充对应设置 UI 与 i18n 字段）。
- **完备的静态与回归门禁**：内置 ESLint（全仓 `src/`、`scripts/`、`tests/` 严格 `no-unused-vars`）、全量 97 模块 TypeScript `checkJs`、六语 i18n 键与占位符对称审计、790+ 核心单测、9 个领域化离线回归套件与 Windows 安装器回滚校验。

## 支持的服务商

消息翻译与输入润色**各自独立保存**服务商、凭据、目标语言、模型参数与提示词，并支持保存多套服务配置档案快速切换。

| 服务商 | 输入润色 | 消息翻译 | 核心配置与特性 |
| --- | :---: | :---: | --- |
| **DeepSeek** | ✅ | ✅ | API Key、Endpoint、Model（支持思考开关） |
| **OpenAI-compatible** | ✅ | ✅ | API Key、Endpoint、Model，支持一键检测服务模型列表 |
| **Sakura local** | ✅ | ✅ | 本机 Endpoint（如 `127.0.0.1:8080`）、模型自动检测；API Key 可留空，**绝不自动回退云端** |
| **Google Cloud Translation** | — | ✅ | 支持多 Key 轮询池、月度字符额度追踪与单 Key 冷却调度 |
| **Microsoft Translator** | — | ✅ | API Key、Region、Endpoint |
| **DeepL** | — | ✅ | API Key、Free / Pro 方案，支持繁体中文 |
| **百度翻译** | — | ✅ | App ID、Secret Key、Endpoint，完整识别错误码 |

> 手动翻译可选开启**备用服务（Fallback）**（默认关闭，支持勾选与拖拽排序）；当主服务为 `Sakura local` 时，为保护本地隐私不会自动回退至云端服务。

## 插件安装（无需 Node.js）

当前最新正式发布版本为 `v0.6.1`（2026-11-28）：

1. 为 Discord 桌面端安装 [BetterDiscord](https://betterdiscord.app/)。
2. 打开 Discord 设置 -> `BetterDiscord` -> `Plugins` -> 点击 `Open Plugins Folder`。
3. 下载 [v0.6.1 正式发布版 DiscordAITranslator.plugin.js](https://github.com/MK6657/DiscordAITranslator/releases/download/v0.6.1/DiscordAITranslator.plugin.js)。
4. 将文件放入插件目录并在插件列表中启用，随后点击左下角 AI 按钮配置服务商。

常见 Windows 插件目录：
```text
%APPDATA%\BetterDiscord\plugins
```

### 当前分支源码预览

如果你希望从当前 `main` 分支（`v0.6.1`）直接获取源码构建产物，或使用 Windows 自动安装脚本（改动详情见 [CHANGELOG.md](CHANGELOG.md)）：

- **方式一（直接下载单文件）**：直接下载仓库根目录的 [DiscordAITranslator.plugin.js](DiscordAITranslator.plugin.js) 原始文件，放入 BetterDiscord 插件目录即可（无需安装 Node.js）。
- **方式二（使用 Windows 安装脚本）**：克隆仓库后，在开始菜单打开**普通 Windows PowerShell** 运行（自动校验语法与 SHA256、备份旧版并事务式启用）：

```powershell
# 先预览目标路径而不写入
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-plugin.ps1 -WhatIf

# 安装并自动启用（如需仅安装不启用，追加 -NoEnable）
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-plugin.ps1

# 校验已安装插件与仓库构建版本/SHA256 是否一致
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-installed-plugin.ps1
```

> [!TIP]
> 请勿在会重定向 `%APPDATA%` 的打包桌面应用内置终端中运行安装脚本（安装脚本会自动拦截并以退出码 `2` 提示，避免装到 Discord 读不到的私有目录）；如需自定义目录可使用 `-PluginsDir` / `-ProfileDir`，确需写入重定向目录可加 `-AllowRedirectedAppData`。

## 隐私、安全与本地数据

- **严格网络边界**：远程 API 强制要求 HTTPS（仅 `localhost`、回环地址与本机通配地址允许 HTTP），拒绝在 URL 中嵌入用户名/密码。
- **禁止 HTTP 自动重定向**：所有 API 请求均关闭自动跳转（拦截 `301/302/303/307/308`），防止消息文本或 API Key 被转发到非信任地址；请直接填写最终规范的接口 URL。
- **分文件本地存储**：插件通过 `BdApi.Data` 将数据保存在 BetterDiscord 插件目录下，互不干扰：
  - `DiscordAITranslator.config.json`：插件设置与服务商凭据（BetterDiscord 不提供系统级凭据保险库，请妥善保护本机目录权限）。
  - `DiscordAITranslator.cache.config.json`：翻译缓存（默认 48 小时过期、最多保留 4,000 条消息，可在「数据与诊断」一键清空）。
  - `DiscordAITranslator.diagnostics.config.json`：脱敏诊断日志（仅记录哈希、状态、错误元数据与模型文件名，不保存原始 API Key 或完整消息正文）。
- **安全的恢复默认**：位于「数据与诊断 -> 危险操作」，默认勾选「保留 API Key、Google Key 池与提示词模板」且保持界面语言不变，防止误删凭据。
- 发现安全隐患请参考 [SECURITY.md](SECURITY.md)，切勿在 Issue 中贴出真实 API Key、消息原文或未脱敏日志。

## 从源码构建与验证（开发者）

验证基线：Windows 11 + Node.js 22 / 24 LTS + Windows PowerShell 5.1（离线测试无需安装 Discord 或真实 API Key）。

```powershell
git clone https://github.com/MK6657/DiscordAITranslator.git
cd DiscordAITranslator
npm ci
npm run verify
```

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 从 `src/` 使用 esbuild 重新生成根目录 `DiscordAITranslator.plugin.js`（**请勿直接手改生成产物**） |
| `npm run build:check` | 检查根目录插件产物与源码是否完全同步 |
| `npm run lint` / `typecheck` | 运行 ESLint 静态规则检查与 TypeScript JSDoc `checkJs` 类型检查 |
| `npm test` | 运行核心模块单测（`tests/core/`）与模块化根插件离线回归（`scripts/verify-plugin.js` / `tests/integration/`） |
| `npm run ci` | 执行源码检查、ESLint、TypeScript 类型检查、产物一致性、全套测试、安装脚本回滚测试与产物完整性检查 |
| `npm run verify` | 先重新构建，再执行完整验证链 |
| `npm run release:check` | 与 GitHub Windows CI 一致的完整发布门禁（含许可证、敏感信息、追踪文件与快照一致性校验） |
| `npm run plugin:install` / `plugin:check` | 本地安装插件 / 校验当前已安装版本与 BetterDiscord 加载状态（自动化可加 `-- -Strict`） |

### 仓库结构

- `src/`：唯一手工维护的源码目录，按职责拆分为 `core/`、`presets/`、`settings/`（含 `ui/`）、`providers/`（含 `adapters/`）、`cache/`、`validation/`、`diagnostics/`、`auto-translation/`、`quick-panel/`、`intake/`、`composer/`、`discord/`、`ui/`、`css/`。
- `DiscordAITranslator.plugin.js`：由 `npm run build` 生成并提交的单文件 BetterDiscord 发布产物。
- `tests/core/`、`tests/integration/` & `scripts/`：核心模块单测、9 个领域化根插件离线回归套件、Windows 安装与校验脚本及发布门禁。
- `docs/`：架构说明、关键链契约、宿主验收记录、重构指南与维护文档。

<details>
<summary>更新、卸载与常见问题排查</summary>

- **更新**：覆盖替换 `DiscordAITranslator.plugin.js` 后重新启用即可；使用安装脚本会自动创建带时间戳的备份文件。从 `v0.3.0` 升级至 `v0.6.1` 会自动将缓存与诊断日志迁移至独立文件，并平滑转换频道规则（不会擅自对任何频道开启自动翻译）。
- **卸载与清理**：在 BetterDiscord 中禁用并删除 `DiscordAITranslator.plugin.js`；如需彻底清除数据，可再删除同目录下的 `DiscordAITranslator.config.json`、`DiscordAITranslator.cache.config.json` 与 `DiscordAITranslator.diagnostics.config.json`。
- **`npm ci` 失败**：确认 Node 版本为 22 / 24 LTS，删除残缺的 `node_modules` 后重试（不要删除 `package-lock.json`）。
- **`build:check` 提示产物过期**：运行 `npm run build`。
- **BetterDiscord 看不到插件 / 未生效**：在普通 PowerShell 中运行 `npm run plugin:check` 检查是否被 AppData 重定向或 BetterDiscord 未注入启动文件。
- **Discord 更新导致按钮消失或异常**：先在「数据与诊断」导出脱敏诊断信息并查看宿主健康卡片，再提交 Issue。

</details>

<details>
<summary>当前已知边界与维护文档索引</summary>

- 仅面向桌面端 BetterDiscord（Android 移动端不支持）；Discord DOM、内部 Webpack 模块与 BetterDiscord API 的上游变动可能影响挂载兼容性。
- 当前验证基线为 Windows 11 + Discord Stable；`v0.6.1` 模块化架构、六语界面与 RTL 适配、性能与安全加固及全部服务商路径均已通过 790+ 自动化单测、9 组离线回归及 Windows 真机部署校验（历史 `main` 快照分别归档在 `backup/v0.6.0`、`backup/v0.5.3` 与 `backup/v0.4.0` 分支）。
- 维护与贡献参考：
  - [CHANGELOG.md](CHANGELOG.md) — 详细版本变更日志
  - [CONTRIBUTING.md](CONTRIBUTING.md) — 贡献与提交流程
  - [docs/architecture.md](docs/architecture.md) — V0.5 源码/产物边界与模块架构
  - [docs/V0.5版本重构修复指南.md](docs/V0.5版本重构修复指南.md) — V0.5 架构重构方案与量化验收结果
  - [docs/critical-chain-contracts.md](docs/critical-chain-contracts.md) — 重构不可破坏的关键链行为契约
  - [docs/host-smoke-test.md](docs/host-smoke-test.md) — 真机宿主冒烟记录
  - [docs/optimization-handoff.md](docs/optimization-handoff.md) & [docs/maintenance-handoff-2026-10-22.md](docs/maintenance-handoff-2026-10-22.md) — 历史验收清单与维护交接

</details>

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。请保留 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；独立实现来源复核记录见 [docs/provenance-review.md](docs/provenance-review.md)。
