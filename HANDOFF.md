# Discord AI Translator 项目交接文档

> 历史归档：本文仅描述 2026-07-14 快照，不代表当前仓库状态。当前使用说明见 [README.md](README.md)，英文说明见 [README.en.md](README.en.md)，2026-09-08 整理与验证记录见 [docs/repository-intake-2026-09-08.md](docs/repository-intake-2026-09-08.md)。不要依据本文的旧 Git 状态、文件清单或重构计划操作当前仓库。

> 交接快照日期：2026-07-14<br>
> 项目版本：`0.2.0` + `Unreleased` 工作区改动<br>
> 目标平台：Windows 11、Discord Stable、BetterDiscord<br>
> 交付形式：可维护源码 + 可直接安装的单文件插件

## 1. 项目概述

Discord AI Translator 是一个 BetterDiscord 桌面插件，主要提供两类互相隔离的能力：

1. Discord 输入框写作辅助：输入润色、重复润色、恢复原文、发送前确认、公开双语输入。
2. Discord 消息翻译：消息按钮和右键菜单手动翻译、可见消息自动翻译、频道策略、历史补翻和预取。

插件同时支持 DeepSeek、OpenAI-compatible、Sakura local、Google Cloud Translation、Microsoft Translator、DeepL 和百度翻译。普通使用者只需要根目录的 `DiscordAITranslator.plugin.js`；继续开发则需要完整源码、Node.js 和 npm。

当前代码已具备可重复构建、离线回归、Windows 安装器回滚测试和发布门禁。真实 Discord 宿主已经验证插件加载、设置页、启停循环，但消息区和输入框的完整端到端操作、真实 provider 请求仍需要在专用测试频道和测试凭据下补验。

## 2. 交付包定位

本次交付包是“源码交接包”，不是只面向最终用户的最小 Release 包。

- 最终用户安装：只需要 `DiscordAITranslator.plugin.js`。
- 开发者接手：需要本交付包内的全部文件。
- 依赖不打包：接手人运行 `npm ci`，由 `package-lock.json` 锁定并下载依赖。
- 不包含本机数据：不包含 BetterDiscord 设置、API key、翻译缓存、诊断日志或 Discord 账号数据。
- 不包含研究资料：不包含 `external/` 和 `work/`；它们属于本机参考仓库、研究记录或临时工作区，不是产品源码。
- 不包含版本库内部数据：不包含 `.git/`。如果需要保留完整 Git 历史，应另行传递仓库；当前仓库尚无首个提交，详见“当前开发状态”。

## 3. 快速判断：接手人该怎么用

### 3.1 只安装插件

前置条件：Windows 11、Discord 桌面版、BetterDiscord。

1. 打开 Discord 设置。
2. 进入 `BetterDiscord` -> `Plugins`。
3. 点击 `Open Plugins Folder`。
4. 将 `DiscordAITranslator.plugin.js` 放入该目录。
5. 回到插件列表，启用 `DiscordAITranslator`。
6. 打开插件设置，分别配置润色和翻译 provider。

最终用户不需要 Node.js、npm 或 esbuild。

### 3.2 从源码继续开发

推荐环境：

- Windows 11 x64。
- Node.js 22 LTS 或 24 LTS，需包含 npm。
- Windows PowerShell 5.1。安装器和 CI 以此作为基线。
- Discord Stable + BetterDiscord。只有真实宿主验证和实际安装需要它们。
- Git 可选，但建议在接手后立即建立可靠提交基线。

首次初始化：

```powershell
npm ci
npm run verify
```

如果收到的是本源码压缩包，因为包内不含 `.git/`，`npm run release:check` 会按设计拒绝运行。先克隆正式仓库，或在确认文件快照无误后初始化 Git 并把交付文件加入索引，再运行完整发布门禁：

```powershell
git init
git add .
npm run release:check
```

不要把压缩包本身、`node_modules/` 或本机配置加入 Git；`.gitignore` 已覆盖主要本地目录。若接手人能获得正式远程仓库，应优先克隆仓库，不要重复初始化。

日常修改流程：

```powershell
# 1. 只修改 src/ 下的源码
# 2. 重新生成根插件
npm run build

# 3. 运行完整验证
npm run verify

# 4. 安装前先预览目标路径和动作
npm run plugin:install:dry-run

# 5. 安装到当前用户的 BetterDiscord
npm run plugin:install
```

不要直接修改 `DiscordAITranslator.plugin.js`。它是构建生成物，直接修改会被下次构建覆盖，并导致 `npm run build:check` 失败。

## 4. 项目目录

```text
Discord插件/
|-- .github/workflows/ci.yml             # Windows GitHub Actions，Node 22/24 双版本验证
|-- design/                              # 设置界面概念设计 SVG
|-- docs/
|   |-- architecture.md                  # 构建边界和后续模块拆分顺序
|   |-- critical-chain-contracts.md      # 重构不得破坏的关键行为契约
|   |-- host-smoke-test.md               # 真实 Discord + BetterDiscord 冒烟记录
|   `-- provenance-review.md             # GPL 参考实现来源/相似性审计结论
|-- scripts/
|   |-- build-plugin.js                  # esbuild 构建或检查根插件
|   |-- check-artifact.js                # 发布产物结构检查
|   |-- check-source.js                  # JavaScript 源码静态检查
|   |-- install-plugin.ps1               # Windows 安装、备份、哈希校验、自动启用
|   |-- release-check.js                 # 许可证、敏感信息、Git 跟踪和 CI 总门禁
|   |-- test-install-plugin.ps1           # 临时目录安装/回滚测试
|   `-- verify-plugin.js                  # 完整插件离线回归
|-- src/
|   |-- auto-translation/
|   |   `-- translation-renderer.js      # 渲染任务键、优先级和轻重任务判定
|   |-- composer/
|   |   `-- composer-writer.js           # 输入框写入的 last-write-wins 协调
|   |-- settings/
|   |   `-- settings-schema.js           # 设置导航及 provider 能力过滤
|   |-- discord-ai-translator.js         # 主实现、Discord 适配、provider、缓存和 UI
|   |-- index.js                         # CommonJS 构建入口
|   `-- metadata.txt                     # BetterDiscord 插件元数据头
|-- tests/core/modules.test.js           # 三个已抽离模块的聚焦测试
|-- DiscordAITranslator.plugin.js        # 可直接安装的生成产物
|-- package.json                         # 命令、Node 版本和直接依赖
|-- package-lock.json                    # 依赖锁文件，必须保留
|-- README.md                            # 用户与开发者使用说明
|-- CHANGELOG.md                         # 已发布和未发布变更
|-- Discord-AI-Translator-Roadmap.md     # 产品路线图
|-- HANDOFF.md                           # 本交接文档
|-- LICENSE                              # MIT 许可证
|-- THIRD_PARTY_NOTICES.md               # 第三方来源说明
|-- CONTRIBUTING.md                      # 贡献要求
`-- SECURITY.md                          # 安全问题报告说明
```

以下目录存在于原开发机，但不属于交付包：

| 目录 | 用途 | 不打包原因 |
| --- | --- | --- |
| `node_modules/` | npm 已下载依赖 | 可由 `npm ci` 精确恢复，体积大且平台相关 |
| `external/` | GPL-2.0 上游参考仓库 | 不是本项目源码，许可证边界要求隔离 |
| `work/` | 研究、临时日志和安装器参考资料 | 内部工作资料，不参与构建或发布 |
| `.agents/` | 本地代理状态 | 与产品无关 |
| `.git/` | 本机 Git 元数据 | 本次交付为文件快照，且仓库尚无提交历史 |

## 5. 构建与发布架构

构建链如下：

```text
src/metadata.txt
        |
        v
src/index.js --> src/discord-ai-translator.js
                    |--> settings/settings-schema.js
                    |--> composer/composer-writer.js
                    `--> auto-translation/translation-renderer.js
        |
        v
scripts/build-plugin.js + esbuild
        |
        v
DiscordAITranslator.plugin.js
```

关键约束：

- `src/` 是唯一手工维护的实现来源。
- 构建格式是 CommonJS，根产物必须直接导出 BetterDiscord 插件类。
- `src/metadata.txt` 必须出现在生成文件第 0 字节，BetterDiscord 依赖该注释识别插件。
- 构建不压缩、不生成 source map，便于调试和审计。
- `package.json` 版本必须与元数据中的 `@version` 一致。
- 根产物提交/交付给最终用户，因此构建必须可重复。
- `npm run build:check` 只比较当前产物和重新构建结果，不写文件。

## 6. 运行时架构

### 6.1 BetterDiscord 生命周期层

`DiscordAITranslator` 是 BetterDiscord 直接加载的主类，负责 `start()`、`stop()`、设置面板和所有运行时资源。

启动阶段主要完成：

- 从 `BdApi.Data` 读取并迁移设置。
- 加载持久化翻译缓存和诊断状态。
- 查找 Discord Webpack store/API。
- 注入插件样式。
- 注册输入框按钮、消息按钮、右键菜单、快捷键和 MutationObserver。
- 初始化消息追踪、自动翻译队列、provider 健康状态和定时任务。

停止阶段必须撤销 observer、patch、事件监听、定时器、样式和进行中的请求，并阻止生命周期结束后的 Promise 继续写 DOM、缓存或 provider 状态。重复调用 `start()` 必须保持幂等。

### 6.2 设置与配置层

设置分为以下主要区域：

- `polish`：输入润色 provider、模型、endpoint、提示词、温度、token 上限和后续动作。
- `translation`：消息翻译 provider、目标语言、自动翻译、缓存、并发和频道策略。
- `publicBilingual`：公开双语输入的翻译、原文格式和可选 fallback。
- `display`：译文位置、原文显示、消息按钮和界面行为。
- `cache`：TTL、最大条目数、缓存清理和统计。
- `diagnostics`：诊断开关、聚合、导出和清理。
- provider profile：各 provider 的 API key、endpoint、model、region、方案等独立保存。

`SettingsSchema` 只负责设置导航元数据和 provider 能力过滤。大量设置默认值、迁移、校验、持久化和 UI 仍在主文件中，是下一轮模块化重点。

重要的数据保护约束：如果设置读取失败，禁止把默认值覆盖到已保存配置；写入必须保持阻塞，直到后续成功读取或用户明确重置。

### 6.3 Provider 与请求层

provider 分为两类：

| 类型 | Provider | 能力 |
| --- | --- | --- |
| Chat Completions | DeepSeek、OpenAI-compatible、Sakura local | 润色和翻译 |
| 直接翻译 API | Google Cloud、Microsoft、DeepL、百度 | 仅消息翻译 |

请求链大致如下：

```text
功能入口
  -> 读取对应任务配置快照
  -> 构造 prompt 或直接翻译请求
  -> 校验 endpoint 安全策略
  -> 请求去重、超时和 AbortController
  -> provider 响应解析
  -> 输出校验、长文本救援或可选 fallback
  -> 缓存提交
  -> DOM 或输入框提交
```

安全规则：

- 远程 endpoint 必须使用 HTTPS。
- 只有 `localhost`、IPv4/IPv6 loopback 和本机通配地址允许 HTTP。
- URL 不允许嵌入用户名或密码。
- fallback 默认关闭，只允许手动消息翻译和公开双语输入使用。
- 自动翻译、输入润色和本地 provider 不得隐式回退到云端。
- fallback 必须使用自己的 provider 凭据，结果不能污染主 provider 的缓存命名空间。

### 6.4 输入润色与公开双语链

输入框处理由主实现和 `ComposerWriter` 协作完成：

```text
定位当前 Discord composer
  -> 获取草稿和 composer 身份
  -> 建立写入 token
  -> 调用润色/翻译 provider
  -> 检查生命周期、草稿、composer 和 token 是否仍然有效
  -> 安全替换输入框
  -> 可选确认、发送、恢复原文或生成双语消息
```

`ComposerWriter` 实现 last-write-wins：同一输入框的新写入会取消旧写入；用户键盘、粘贴或输入操作也能使等待中的程序写入失效，避免异步结果覆盖用户刚修改的草稿。

### 6.5 手动消息翻译链

手动翻译可由消息按钮或右键菜单触发。系统会综合 DOM 文本和 Discord Message Store，选择唯一且兼容的消息源，并创建包含以下快照的计划：

- Discord 消息身份。
- 当前 DOM 文本和强指纹。
- 请求 owner/token。
- 生命周期代次。
- 设置版本和 provider 配置。
- 缓存键和显示目标。

响应提交前会再次核对这些快照。消息已编辑、DOM 节点被 Discord 复用、用户重新发起翻译、切换配置或插件已停止时，旧结果会被丢弃。长文本具有整段重试和模型救援路径。

### 6.6 自动翻译链

自动翻译围绕 `MessageTracker`、`TranslationScheduler` 和 `TranslationRenderer` 工作：

```text
Discord DOM/Store 变化
  -> 增量扫描消息
  -> 文本预检、语言判断和频道策略
  -> 生成消息身份与缓存键
  -> 缓存命中直接排队渲染
  -> 未命中进入优先级队列
  -> provider 批量或单条请求
  -> 输出校验和失败冷却
  -> 渲染调度
  -> 再次核对消息身份后写入 DOM
```

主要稳定性机制：

- 队列、待目标、请求中和待渲染状态共同参与去重。
- 可见消息优先，附近消息可预取，滚动和媒体查看器期间可延迟渲染。
- 自动翻译有并发上限、队列上限、provider cooldown 和终止失败保护。
- Sakura local 当前限制为一个活动请求，避免本地服务过载。
- 长文本根据 provider、长度和失败原因选择整段、分块或单条路径。
- 手动翻译优先于自动翻译渲染。
- Discord 替换聊天根节点后会重新绑定 observer。
- 消息 DOM 文本提取优先使用非克隆遍历，必要时才克隆，结果按相关 mutation 失效。
- Discord 自定义 emoji token 必须与源文数量和名称完全匹配，无法恢复 emoji 图像时整条译文不显示也不缓存。

目前 `MessageTracker` 和 `TranslationScheduler` 仍保留在主文件，因为它们紧密依赖 Discord Store、DOM 身份、可见性、队列和生命周期状态。不要在缺少聚焦回归的情况下直接拆分。

### 6.7 缓存、诊断与持久化

插件通过 `BdApi.Data` 保存：

- 设置和 provider 凭据。
- 翻译缓存，默认 TTL 48 小时、最多 4000 条。
- 诊断记录和聚合状态。

缓存身份包含文本强指纹、请求配置快照和消息身份。部分结果、无效结果、易失身份结果和 fallback 结果不得进入不合适的持久化或共享缓存。缓存支持紧凑编码、容量裁剪、TTL、别名迁移、负查找短缓存和延迟写入。

诊断记录限制为 500 条，并对高频事件聚合；写入使用延迟和空闲调度。设计目标是不保存原始 API key 或完整消息正文，但对外发送诊断文件前仍应人工检查。

注意：BetterDiscord 的 `BdApi.Data` 不是 Windows Credential Manager。API key 保存在本机 BetterDiscord 数据文件中，没有系统级加密集成。

## 7. 依赖清单

### 7.1 开发依赖

项目只有一个直接 npm 开发依赖：

| 依赖 | 锁定版本 | 用途 | 许可证 |
| --- | --- | --- | --- |
| `esbuild` | `0.28.1` | 将 `src/index.js` 打包成 BetterDiscord 单文件 CommonJS 插件 | MIT |

Windows x64 上，npm 会自动选择可选平台包 `@esbuild/win32-x64@0.28.1`。其他 `@esbuild/*` 平台包由 esbuild 声明为可选依赖，不需要手工安装。

安装方式：

```powershell
npm ci
```

必须使用 `npm ci` 和随包提供的 `package-lock.json`，不要用 `npm install` 随意刷新锁文件，也不要删除锁文件后重新解析版本。

### 7.2 运行时依赖

最终生成的 `.plugin.js` 不依赖 npm 模块目录。运行时依赖来自宿主环境：

- Discord 桌面客户端。
- BetterDiscord。
- BetterDiscord 暴露的 `BdApi` 和 Discord 内部 Webpack/Store/DOM。
- 用户自行配置的翻译或模型 provider。

### 7.3 工具链基线

本交接快照验证时使用：

- Node.js `v24.15.0`。
- npm `11.12.1`。
- Windows PowerShell 5.1 安装器入口。

CI 同时验证 Node.js 22.x 和 24.x，接手人优先选择这两个 LTS 主版本。

## 8. npm 命令说明

| 命令 | 作用 | 是否写文件/系统 |
| --- | --- | --- |
| `npm run build` | 从 `src/` 生成根插件 | 写根目录 `.plugin.js` |
| `npm run build:check` | 比较构建结果与现有产物 | 不写文件 |
| `npm run check` | 检查项目 JavaScript 源码 | 不写文件 |
| `npm run test:core` | 测试三个已抽离模块 | 不写项目文件 |
| `npm run test:plugin` | 运行完整插件离线回归 | 不需要 Discord/API key |
| `npm run test:installer` | 在临时目录测试安装、启用和回滚 | 只操作临时 fixture |
| `npm test` | `test:core` + `test:plugin` | 不需要真实宿主 |
| `npm run verify` | 重新构建并执行主要验证 | 会更新根产物 |
| `npm run ci` | 与 CI 核心验证链一致 | 不主动更新过期产物 |
| `npm run release:check` | 发布总门禁，包括许可、敏感信息和 Git 文件边界 | 不安装到真实 BetterDiscord |
| `npm run plugin:install:dry-run` | 预览真实安装目标和动作 | 不写真实插件目录 |
| `npm run plugin:install` | 安装、备份、校验并尝试自动启用 | 会修改 BetterDiscord 目录 |

`npm run plugin:install` 会：

1. 校验根插件存在。
2. 使用 Node.js 做语法检查。
3. 对已有插件创建带时间戳的备份。
4. 通过临时文件和 SHA256 校验完成替换。
5. 原子更新各 BetterDiscord profile 的 `plugins.json`。
6. 出错时回滚插件和启用状态。

只安装但不自动启用：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-plugin.ps1 -NoEnable
```

`npm run release:check` 额外要求当前目录是 Git 仓库，并且发布必要文件已被 Git 跟踪。纯压缩包刚解压时应先运行 `npm run verify`；建立 Git 索引后再运行发布门禁。

## 9. 当前开发状态

### 9.1 已发布基线：v0.2.0

`v0.2.0` 已完成：

- 中文/英文设置界面、快速设置面板和快捷键。
- 输入润色、重复润色、恢复原文、确认和公开双语输入。
- 消息按钮、右键菜单、手动翻译、回复预览和长文本救援。
- 自动翻译、频道策略、显式历史补翻、预取、并发控制和冷却。
- 内存/持久化缓存、请求去重、输出校验和诊断。
- 七种 provider 适配。
- Windows 构建、测试、安装器和 GitHub Actions 发布门禁。
- MIT 许可、第三方声明和 GPL 参考实现来源审计。
- Win11 + Discord Stable + BetterDiscord 加载、设置页和启停循环实机冒烟。

### 9.2 当前工作区：Unreleased

当前工作区在 `v0.2.0` 基础上还有未发布改动，集中在四个文件：

- `src/discord-ai-translator.js`：运行时性能、observer 恢复、诊断持久化、文本预检和 emoji 完整性。
- `scripts/verify-plugin.js`：为上述行为增加离线回归。
- `DiscordAITranslator.plugin.js`：与当前源码一致的重新构建产物。
- `CHANGELOG.md`：记录未发布改动。

未发布改动包括：

- 避免布局开销大的可见性探测，只在必要时克隆消息 DOM，并缓存文本提取结果。
- 跳过纯展示 mutation 引发的无效扫描，降低滚动和文本选择卡顿。
- Sakura local 限制为单活动请求，每轮扫描复用 Message Store 快照。
- 诊断高频事件聚合、500 条上限、紧凑记录、空闲延迟写入和关闭时立即清理。
- Discord 替换聊天根节点后重新绑定 observer，并以空闲切片处理消息工作。
- 跳过已知低信息重复语句，但显式土耳其语配置下保留 `dur`；拒绝要求更多上下文的解释性模型输出。
- 自定义 emoji token 强一致校验，emoji 图像无法恢复时不渲染、不缓存。

当前差异规模约为：`1907` 行新增、`363` 行删除，涉及上述 4 个文件。它不是一个适合忽略的小补丁，应当作为独立候选版本继续宿主验收。

### 9.3 Git 状态风险

当前 Git 分支名为 `main`，但仓库显示 `No commits yet on main`。项目文件已进入索引，部分文件同时有后续未暂存修改。因此：

- 当前没有可引用的 commit SHA。
- `v0.2.0` 文档状态和 `Unreleased` 工作区只能通过文件内容区分，不能通过 Git tag/commit 稳定回退。
- 接手后应先确认交付包 SHA256 和验证结果，再创建首个基线提交。
- 建议把已发布 `v0.2.0` 基线与当前 `Unreleased` 候选拆成可追踪提交；如果没有原始基线快照，不要伪造历史，至少将当前交付快照作为明确的初始提交。
- 创建提交前再次运行 `npm run release:check`，并确认 `external/`、`work/`、`node_modules/`、`.agents/` 未被跟踪。

## 10. 本次验证结果

2026-07-14 在 Windows、Node.js `v24.15.0`、npm `11.12.1` 环境执行：

```powershell
npm run release:check
```

结果：通过。

通过项：

- 11 个 JavaScript 文件源码检查通过。
- `DiscordAITranslator.plugin.js` 与当前 `src/` 构建结果一致。
- 3 个抽离模块测试全部通过。
- `scripts/verify-plugin.js` 完整插件离线回归通过。
- Windows 安装器 dry-run、首次安装、覆盖备份、自动启用和重复启用测试通过。
- 安装器已覆盖包含空格和中文的临时路径。
- 生成产物元数据、导出形态和结构检查通过。
- 发布许可、来源记录、敏感信息、私人机器路径和跟踪文件边界检查通过。

当前生成物：

```text
文件：DiscordAITranslator.plugin.js
大小：1,219,975 bytes
SHA256：362262D9D1C87F349CC612C89D9C17FAFE3254E91D91AB90BEE585562512DBD5
```

本次未验证：

- 专用 Discord 频道内的输入框按钮、润色、公开双语写入和发送流程。
- 消息按钮、右键菜单、切换频道、滚动、选择文本、消息编辑和 DOM 节点复用的真实宿主表现。
- DeepSeek/OpenAI-compatible/Google/Microsoft/DeepL/百度的真实云请求。
- Sakura local 的真实本地服务请求。
- Discord PTB/Canary、macOS、Linux、PowerShell 7 和移动端。

## 11. 已知限制和主要风险

### 11.1 Discord 内部兼容性

插件依赖 Discord DOM 结构、CSS class 模糊选择器、Webpack Store 和 BetterDiscord API。Discord 更新可能影响：

- 输入框定位与安全写入。
- 消息按钮和右键菜单注入。
- observer、消息身份解析和 Message Store 查询。
- 翻译行锚点、滚动稳定性和自定义 emoji 恢复。

离线 DOM mock 能覆盖行为契约，但不能替代真实 Discord 宿主回归。

### 11.2 主文件和测试过大

- `src/discord-ai-translator.js` 当前约 26,004 行。
- `scripts/verify-plugin.js` 当前约 13,229 行。
- 根生成物当前约 24,031 行。

主实现同时包含设置、provider、缓存、诊断、Discord 适配、UI 和调度。继续堆功能会提高回归成本，应按既定顺序逐步抽离，而不是一次性重写。

### 11.3 凭据存储

provider 凭据保存在 BetterDiscord 本地数据文件中，没有系统凭据保险库保护。不要把真实配置、BetterDiscord 数据目录或诊断导出加入源码包。

### 11.4 平台范围

当前是 Windows 桌面优先项目。BetterDiscord 插件不能直接用于 Android，未来移动端只能复用协议、提示词和部分纯逻辑，不能复用当前宿主集成层。

## 12. 建议后续开发顺序

### P0：先完成当前 Unreleased 宿主验收

在专用测试 Discord 账号、频道和无敏感数据的 provider 配置下，重点验收：

1. 长频道快速滚动时帧率、文本选择和输入是否仍流畅。
2. Discord 切换频道或替换聊天根节点后按钮和自动翻译是否恢复。
3. 消息编辑、删除、DOM 复用后是否拒绝陈旧译文。
4. 自定义静态/动态 emoji 是否保留名称、数量、顺序和图像。
5. Sakura local 是否严格单并发，停止/切配置后无晚到写入。
6. 关闭诊断后是否立即停止并清理持久化数据。
7. 真实 provider 的成功、超时、限流、无效输出和凭据错误路径。

### P1：建立可靠版本基线

1. 运行 `npm ci` 和 `npm run release:check`。
2. 核对根插件 SHA256。
3. 创建清晰的初始提交或从原始来源补回可靠历史。
4. 为当前 `Unreleased` 候选定义版本号和验收清单。
5. 发布前同步 `package.json`、`src/metadata.txt` 和 `CHANGELOG.md` 版本。

### P2：按边界拆分主实现

既定顺序：

1. 将可变 fallback 上下文改成显式 `TranslationResult` 值。
2. 抽离 settings validation、migration 和 `BdApi.Data` 访问。
3. 抽离 provider registry、endpoint policy、request builder、parser 和 fallback policy。
4. 抽离 cache key、codec 和 persistence repository。
5. 抽离 output guard 和 diagnostics。
6. 将自动翻译多套 `Set`/`Map`/数组状态收敛为单一任务状态机。
7. 最后再把 Discord observer、消息身份和 DOM 渲染收敛到 Discord adapter。

每一步都必须先增加聚焦测试，再保持 `docs/critical-chain-contracts.md` 中的关键链契约和完整产物回归通过。

### P3：产品能力补齐

- 仅内存缓存选项。
- 设置导入/导出。
- 更明确的凭据、缓存和诊断数据清理入口。
- 更安全的系统级凭据保存方案。
- Discord PTB/Canary 兼容性测试。

## 13. 宿主验收建议

不要使用主账号、私人频道或真实生产 key 做首次验收。推荐建立专用测试环境，并记录 Discord、BetterDiscord、插件和 Node 版本。

最小验收矩阵：

| 场景 | 预期 |
| --- | --- |
| 插件加载/启停三次 | 无重复按钮、observer、样式或通知异常 |
| 打开所有设置页 | 无报错，provider 选项与能力匹配 |
| 输入润色后立刻手工输入 | 用户输入胜出，晚到结果不得覆盖 |
| 连续两次润色 | 最后一次请求胜出 |
| 手动翻译后编辑消息 | 陈旧结果不得写入编辑后的消息 |
| 快速滚动长频道 | 不明显阻塞滚动或文本选择 |
| 切换频道再返回 | observer、按钮和翻译恢复正常 |
| 相同消息重复出现或 DOM 复用 | 不串译，不出现重复翻译行 |
| 自定义 emoji 翻译 | emoji 名称/数量一致并恢复图像，否则整条不显示 |
| provider 超时/限流/凭据错误 | 有明确错误和冷却，不无限重试 |
| 关闭插件时仍有请求 | 晚到响应不改 DOM、缓存或健康状态 |
| 清空缓存/诊断 | 数据和 UI 统计同步清理 |

验收结果应追加到 `docs/host-smoke-test.md`，至少记录环境、已通过项、未覆盖项和生成物 SHA256。

## 14. 发布前检查清单

```powershell
npm ci
npm run verify
npm run release:check
Get-FileHash -Algorithm SHA256 .\DiscordAITranslator.plugin.js
git status --short
git ls-files
```

确认：

- `package.json` 与 `src/metadata.txt` 版本一致。
- `CHANGELOG.md` 已把对应内容从 `Unreleased` 移到正式版本。
- 根插件是最新构建结果。
- `external/`、`work/`、`node_modules/` 和 `.agents/` 未跟踪、未打包。
- 没有 `.env`、`*.local.json`、API key、token、cookie、真实 endpoint 凭据或本机绝对路径。
- `LICENSE`、`THIRD_PARTY_NOTICES.md` 和 `docs/provenance-review.md` 保留。
- 真实宿主冒烟记录与待发布产物 SHA256 一致。
- 最终用户 Release 至少包含 `DiscordAITranslator.plugin.js`；源码发布同时包含本交接包内的源码、锁文件、脚本、测试和许可证。

## 15. 故障排查

### `npm ci` 失败

- 确认 Node.js 是 22.x 或 24.x。
- 确认网络可以访问 npm registry。
- 删除不完整的 `node_modules/` 后重试。
- 不要删除或重新生成 `package-lock.json`。

### `npm run build:check` 报产物过期

先确认修改发生在 `src/`，再运行：

```powershell
npm run build
npm run build:check
```

### BetterDiscord 看不到插件

- 确认文件名为 `DiscordAITranslator.plugin.js`。
- 确认文件位于 BetterDiscord 显示的插件目录。
- 运行 `npm run plugin:install:dry-run` 查看脚本识别的目标。
- 检查 BetterDiscord 是否正确注入当前 Discord Stable。
- 查看插件元数据是否仍位于文件开头。

### Discord 更新后按钮或翻译消失

- 先运行 `npm test`，确认纯逻辑没有回归。
- 在专用频道复现，并导出脱敏诊断。
- 检查 Discord DOM 选择器、Webpack Store 和 BetterDiscord API 变化。
- 优先修复适配层，不要放宽消息身份和陈旧结果校验。

### provider 请求失败

- 使用设置页连接测试检查 endpoint、model、key 和 region/plan。
- 远程服务必须使用 HTTPS；本地 Sakura 可使用 loopback HTTP。
- 检查是否触发 provider cooldown、配额或限流。
- 不要把真实 API key 写入 issue、测试代码、日志或交接文件。

## 16. 交接验收结论

当前快照可以作为继续开发和内部试用的候选基线：构建可重复，离线发布门禁通过，根插件可直接安装。它仍应按“预览版本 + 未发布性能改动”管理，直到完成专用 Discord 频道中的输入框、消息翻译、滚动/编辑、自定义 emoji 和真实 provider 端到端验收。

接手人的第一项工作不应是继续增加功能，而应先建立可追踪 Git 基线并完成当前 `Unreleased` 改动的真实宿主验收。之后再按 `docs/architecture.md` 和本文件的 P2 顺序逐步模块化。
