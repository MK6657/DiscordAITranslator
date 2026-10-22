# 优化清单与换机接手说明 / Optimization handoff

更新日期：2026-09-26。本文是下一台电脑的接手入口，不代表清单里的功能已经实现。后续完成一项时，请更新状态、提交号和验证记录，不要只改勾选框。

### v0.4.0 预览版（2026-09-26）

**改了什么**（完整的用户可见改动见 [CHANGELOG.md](../CHANGELOG.md)，用户操作见 [使用说明](../使用说明.md)）

- 设置界面重做：左下角 AI 按钮改为打开小的快捷面板（自动翻译、本频道规则、目标语言、显示选项、测试），按钮右下角有五种状态标记（形状 + 颜色）；完整设置改为最大 920×760 的窗口，六个标签页（概览、翻译消息、输入框工具、显示、高级、数据与诊断）加设置搜索；概览页有上手清单和服务状态卡片；Sakura 本地和 OpenAI 兼容可“检测模型”；“试译一句 / 试润色”取代测试模式；所有确认改用 BetterDiscord 对话框；界面文案中英文重写。
- 频道规则：“总是翻译”变成白名单（总开关关闭时也自动翻译），“不翻译”总是优先；从 v0.3.0 升级时，“本频道启用”转换为“跟随总开关”（与 0.3.0 行为一致），不会有频道自行开始自动翻译；0.3.0 的缓存译文升级后继续命中（含本地模型检测后和带 emoji 的消息）。
- 恢复默认：移到“数据与诊断 → 危险操作”，对话框默认勾选“保留 API Key、Google Key 池和提示词模板”，界面语言不变；保留的 Key 连同它的接口地址和模型一起保留；恢复后所有效果立即生效。
- 聊天里的行：“翻译中…”标记；错误行按原因给出“打开设置 / 测试连接 / 重试”或等待时间；需要用户处理的问题每个只提示一次；译文悬停工具栏（复制、不用缓存重新翻译、隐藏）；部分译文注明缺失段落；译文样式与字号；右到左语言。
- 服务商：Google/微软/DeepL/百度的西班牙语、法语、越南语目标代码；DeepL 繁体中文；Google Key 改走请求头，分钟/日限额分别冷却，Key 池按 Key 指纹记账；百度错误码；DeepSeek 402；OpenAI 兼容 404/405；本地模型换模型后按实际模型写缓存。
- 队列与重试：截断输出加大长度重试一次后退避；批量请求超时不再封 6 小时；长消息遇到不可恢复的错误立即停止并保留已翻部分；手动翻译有请求预算（短消息 8 次、长消息最多 24 次）；设置变化时中止进行中的请求。
- 输入框：按 Slate 结构读取多行草稿，保留 mention/emoji token 和零宽空格；晚到的结果改为面板显示；写入失败的回滚不再撤销用户输入；“发送前询问”确认后改为在输入框按回车发送（不再点击按钮）；快捷键录制拒绝只用 Shift 和编辑快捷键。
- 数据：缓存和诊断日志拆成独立的 BetterDiscord 数据文件并自动迁移；缓存按消息计数；Discord 刷新/退出前落盘；设置文件损坏时仍能启动。
- 安装器与工具：在重定向 AppData 的窗口中拒绝安装（退出码 2，`-AllowRedirectedAppData` 可强制）；`release:check` 新增浏览器配置目录、强制添加的忽略文件和嵌套仓库守卫。

**怎么做的**

- 起点：main 上的 v0.3.0（`964e51f`，PR #2）；`2ae2577` 开始 v0.4.0，并把样式表拆成按顺序拼接的模块（现为 `src/css/01..08`）。
- 先对 v0.3.0 做了逐项审计（每项有场景、证据、修复建议和独立核实），另做了界面评审，并写了 v0.4.0 界面规格。
- 第 1 波：7 条工程分支在各自的 worktree 中并行（服务商、队列、消息读取、输入框、设置与数据、译文行、工具链）。每项尽量先写能复现问题的失败测试，再修复；合并后重建产物（`f0cfa1e`）。
- 第 1 轮复查：8 份只读的独立复查（7 个分区 + 集成），逐项核对修复并找出新问题；7 条修复分支处理后合并（`dafc65c`）。
- 第 2 波（界面）：设置窗口外壳、对话框与文案、快捷面板（`4eb0f3f`）。第 3 波：设置内容（概览、检测模型、试译）和窗口收尾（尺寸、单一标题栏、语言切换、状态）（`cf34b2e`）。
- 第 2 轮复查：4 份（设置窗口、对话框与文案、快捷面板、集成）；3 条修复分支合并后重建产物（`b3fdd51`）。
- 界面改动在无头 Edge 里用模拟 BetterDiscord 的测试页截图检查过（深色/浅色、中/英文、窄窗口、BetterDiscord 自带设置对话框的 600 px 宽度）。这些页面不是真实 Discord。
- 在 `b3fdd51` 上通过：`npm run check`、364 项模块测试、`scripts/verify-plugin.js` 产物回归、`npm run test:installer`、`npm run artifact:check`。安装器的拒绝逻辑还在一个真实的打包应用终端里用 `-WhatIf` 手动确认过退出码 2。发布前终审的结论不在本节范围内，出来后请补在这里。

**尚未在真实 Discord 中验证（验收清单）**

以下都只有离线测试和模拟页面的结果。验收时用测试账号、测试频道和测试 Key，结果追加到 [宿主记录](host-smoke-test.md)（那里有同一份清单的空白表格）。

| # | 场景 | 操作 | 预期 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 快捷面板与状态标记 | 点 AI 按钮；按住一会儿再松开；右键；Esc；点面板外；面板开着时在输入框按 Tab（例如接受 emoji 补全）；切换频道；让服务正常、翻译中、限流、Key 错误、本地服务停止、本频道“不翻译” | 每次点击只开/关一次，右键不触发；Esc 关闭并把焦点还给按钮；Tab 留给输入框；“本频道”跟着切到新频道；五种标记和悬停文字与实际状态一致，修好并测试通过后恢复绿色 | 待验证 |
| 2 | 设置标签页与搜索 | 分别从快捷面板和 BetterDiscord 插件列表打开；方向键和 Home/End 切标签；搜索“快捷键”“缓存”后回车；切换界面语言；把 Discord 窗口缩窄 | 窗口不超过 920×760，只有一个标题栏；搜索跳到对应控件；切语言时窗口不关闭、停在同一标签页；窄窗口标签变成横排；BetterDiscord 对话框里关闭按钮和右侧控件不被截断 | 待验证 |
| 3 | 恢复默认对话框 | 数据与诊断 → 危险操作 → 恢复默认设置；分别保持勾选、取消勾选；按 Esc；点背景 | 对话框里显示勾选框（BetterDiscord 的 React 渲染）；保持勾选时 Key、Google Key 池和模板都在，取消勾选时被清除；Esc 和点背景等于取消；之后设置窗口停在原标签页，焦点回到“恢复默认设置”按钮 | 待验证 |
| 4 | 发送前询问（回车发送） | 润色后动作选“发送前询问”；在英文界面的 Discord 里润色，再点对话框里的“发送”；对话框打开时改草稿；点取消 | 确认后消息被发出，不会打开“Send a gift”；草稿改动后不发送并提示；取消时不发送，结果留在输入框 | 待验证 |
| 5 | 快捷键录制 | 点快捷键按钮录 `Ctrl+Shift+Y`；再试 `Shift+H`、`Ctrl+V`；录制中关闭设置、点别处、等 10 秒；之后在输入框打字 | 合规组合保存并能触发润色；不合规组合被拒并保留原快捷键；录制结束后打字不会被当成快捷键 | 待验证 |
| 6 | Google / 百度 / DeepL 错误提示 | 用测试 Key 制造：Google 每分钟限流、无效或过期 Key；百度 IP 白名单（58000）、不支持的目标语言（58001）；DeepL 额度用完（456）、无效 Key（403）；DeepL 选繁体中文 | 错误行和一次性提示写明原因（百度带错误码）；Google 冷却的 Key 约 1 分钟后恢复，不误报“本月额度用完”，测试按钮按标签指出出错的 Key；DeepL 输出繁体 | 待验证 |
| 7 | 本地模型检测 | Sakura 本地点“检测模型”；在服务端换一个模型；停掉服务端 | 列出服务端模型并标出“（已加载）”；换模型后按新模型重新翻译；停掉后已缓存的译文仍显示，错误行写出本地地址并提供“测试连接”；AI 按钮显示红色“!” | 待验证 |
| 8 | 试译一句 / 试润色 | 在两张连接卡片里各输入一句并运行；空输入；换成错误的 Key 再试 | 显示结果和用时，不向 Discord 发送任何内容；空输入提示“先输入一句话。”；错误在卡片内显示 | 待验证 |
| 9 | 从 v0.3.0 升级：频道规则与缓存 | 用 v0.3.0 的设置和缓存启动 v0.4.0（含“本频道启用”频道）；关闭总开关；在已翻译过的频道回滚；再给一个频道选“总是翻译” | 升级后没有频道自行自动翻译；回滚时 0.3.0 缓存的译文立即显示、不重新请求（本地模型检测后也一样）；选“总是翻译”的频道在总开关关闭时仍自动翻译 | 待验证 |

建议顺带检查：错误行的“打开设置 / 测试连接 / 重试”按钮、译文悬停工具栏和右键菜单、遮蔽译文的键盘展开、多行草稿和 @提及 的润色与公开双语写入、缓存和诊断数据文件的迁移（升级前先在仓库外备份 BetterDiscord 插件文件夹里的数据文件）。

**已知遗留（本版不处理）**

- 缓存键里的消息身份还没有哈希：改动会让现有缓存全部失效，需要随一次缓存格式升级处理。
- 完全没有 API 配置时，自动翻译不会弹“需要你处理”提示（AI 按钮会显示红色“!”，手动翻译有错误行和提示）。
- BetterDiscord 自带的插件设置对话框仍显示它自己的标题和“完成”按钮。
- 英文快捷面板的频道规则按钮用短标签（Follow main / Always / Never），完整名称在提示和读屏文字里。
- 无效或不安全的接口地址要等第一次真实请求或测试后才会标红，没有请求前的静态检查。

### v0.3.0 预览版（2026-09-25）

- 版本号改由 `package.json` 统一提供，显示在设置页顶部、启动提示、设置快照和诊断导出中。`npm run plugin:check` 对比已安装插件与仓库构建的版本和 SHA256。
- **换机/部署注意：** 打包形式的桌面应用（例如 Codex、Claude 桌面版）会把在 `%APPDATA%` 中新建的文件重定向到 `%LOCALAPPDATA%\Packages\<应用>\LocalCache\Roaming`。9 月 8 日和 25 日由 AI 应用执行的 BetterDiscord 安装都落在了 Codex 的私有目录里，只有从 Codex 内部启动的 Discord 能加载；正常启动的 Discord 没有 BetterDiscord。安装 BetterDiscord 与插件都应在开始菜单打开的普通 PowerShell 中进行，再用 `npm run plugin:check` 确认。
- 已修复滚动回看时译文显示滞后：缓存译文在聊天静止约 0.1 秒后即绘制（包括 Discord 已挂载在可见区上下的消息），不再等待 0.55 秒滚动暂停、设置窗口或 2.2 秒跳转冷却；新的模型请求仍保留原有暂停。扫描与绘制使用同一可见性定义；滚动补偿按插入位置区分上方、可见区与下方，并保持贴底；插件自身的滚动补偿不再被当作用户滚动。
- 本地离线测试、安装器测试与产物检查通过；滚动相关改动**待真机验收**，因此以预览版发布。

### 本机后续进展（2026-09-08）

- 工作分支：`codex/settings-and-error-feedback`。下文原交接基线保留作历史记录。
- 按用户要求，本地与云端自动翻译并发均开放为 1–10；队列上限回归通过，Discord 真机保存 10 成功后恢复原值 1。未将本地服务槽位自动调到 10。
- 已修复 P1 取消/超时分类及中英文提示；取消不再记作 provider 故障或触发 fallback，模型识别取消后不再继续发起翻译，长文本补救传递取消，晚到响应被拒绝。
- 已复现“本地配置修改后回弹/不生效”的设置反馈问题：本地服务固定 DOM、禁用预取与云端 fallback。界面现在明确禁用受限控件并解释原因。预翻译范围原生下拉在本机可正常展开，不将其误记为已修复的下拉渲染故障。
- 新增 8 项聚焦测试；完整 `release:check` 通过。无效/不安全 URL 分类为客户端配置错误并提供中英文提示，401/403/429/500、配额及网络错误分类已检查。重定向仍全部禁止；不透明网络失败没有被误称为重定向。
- 已安装到实际使用电脑，模型端口为 18080，详情及产物指纹见 [宿主记录](host-smoke-test.md)。完整真机验收仍待完成，尤其是输入框写入竞争、编辑/删除消息、自动调度及停止时的真实晚到响应。
- 下一顺序仍为：完成剩余 P1 真机验收 → P2 仅内存缓存 → 分项数据清理 → 请求/字符统计 → 模块测试；P3 状态机与 Discord 适配层重构待真机基线通过后开展。本轮没有将这些后续候选标为完成。

## 1. 当前基线：先看这里

- 私有仓库：https://github.com/MK6657/DiscordAITranslator
- 已发布：main 上的 v0.3.0 预览版，合并提交 `964e51f`（PR #2），标签 `v0.3.0`。
- 开发中：本地分支 `feat/v0.4.0`，版本 v0.4.0 预览版。代码集成到 `b3fdd51`（第 2 轮复查修复合并后重建产物），之后是本文所在的文档提交。本文编写时该分支还没有推送到远端，也没有 PR 或 GitHub CI 结果；接手时先用 `git log` 和 `git ls-remote` 确认实际状态。
- 已完成：v0.4.0 的设置界面重做、频道规则白名单、服务商错误分类、队列重试、输入框写入、数据文件拆分和安装器拒绝重定向（见上方 v0.4.0 一节）；更早的取消/超时区分已在 v0.3.0 完成（见第 3 节）。
- 已通过（本地，`b3fdd51`）：`npm run check`、364 项模块测试、产物回归、安装器测试和产物检查。v0.4.0 还没有 GitHub Windows Node 22/24 CI 结果。
- **未完成：v0.4.0 的真实 Discord 验收（清单见上方 v0.4.0 一节和 [宿主记录](host-smoke-test.md)），以及推送、PR 和 CI。** 验收前不要把 v0.4.0 标为稳定版。
- 真实宿主记录只覆盖 v0.2.0 的加载/设置/启停和 9 月 8 日的有限本地模型冒烟测试；v0.3.0 与 v0.4.0 都没有完整的真机验收。

v0.4.0 代码基线产物指纹（`b3fdd51` 构建；之后修改代码并重建会变化，文档提交不影响）：

```text
DiscordAITranslator.plugin.js
Bytes: 1737598
SHA256: 1795230A2DBA143B8BCAA0AC0B78A3FECC3D0C35D08901F9A598E31C3C68396A
```

## 2. 换机准备

前置条件：Git、GitHub 仓库访问权限、Node.js 22 或 24、npm、Windows PowerShell 5.1。真机部分另需 Windows 桌面 Discord 和 BetterDiscord。不要复制上一台电脑的登录凭据、API key、node_modules 或整个 BetterDiscord 数据目录。

新目录初始化：

```powershell
gh auth status
gh repo clone MK6657/DiscordAITranslator
cd DiscordAITranslator
git status --short
git log -3 --oneline
npm ci
npm run release:check
```

`gh` 不是必需工具；也可在 Git 已正确认证后使用 `git clone https://github.com/MK6657/DiscordAITranslator.git`。如果认证失败，由用户在该机器完成登录，不要把 token 发进聊天或写进仓库。

已有克隆时，先检查 `git status`，保护本机未提交内容，再执行 `git pull --ff-only`。不要使用强制重置或用旧压缩包覆盖最新仓库。检查通过后，从最新 main 创建自己的优化分支，先修小问题，再验收；最后通过 PR 合并。v0.4.0 合入 main 之前，它的验收和修复从 `feat/v0.4.0` 开始。

优先阅读：

- [中文说明](../README.md) / [English README](../README.en.md)
- [关键链契约](critical-chain-contracts.md)
- [当前架构](architecture.md)
- [上一轮复查](review-2026-09-08.md)
- [历史宿主测试与当前状态](host-smoke-test.md)

`HANDOFF.md` 和 `BASELINE-2026-07-26*.md` 是历史资料，其中“明日测试”“无 Git 提交”等描述不是当前状态。

## 3. P1：取消/超时错误提示——已完成

这项工作已在 v0.3.0 完成（分支 `codex/settings-and-error-feedback`，PR #2 合入 main），v0.4.0 在此基础上扩展。下面保留原清单和完成情况，便于核对；真实 Discord 中的表现仍属于第 4 节和 v0.4.0 验收清单的范围。

- [x] 测试区分“插件停止/主动取消”和“定时器超时”：`fetchApiResponseText()` 用明确的错误代码 `REQUEST_CANCELLED` 和 `REQUEST_TIMEOUT`，不再把所有 AbortError 当成超时；回归在 `tests/core/request-cancellation.test.js` 和 `scripts/verify-plugin.js`。
- [x] 取消提示为“请求已取消”，真实超时仍提示“请求超时”，中英文一致（`errorCancelled` / `errorTimeout`）。
- [x] 主动取消不计为服务商故障，不增加冷却、不写失败记录、不触发 fallback；晚到结果不能写 DOM、缓存和健康状态。v0.4.0 起，设置变化、频道规则变化和恢复默认还会中止正在进行的自动翻译请求，同样不记为失败。
- [x] 超时、取消、请求成功和响应读取失败后都释放计时器与 AbortController 跟踪。
- [x] 401/403、429、配额不足、无效 URL、不安全 URL、网络错误的分类与提示已检查；v0.4.0 又补充了 Google 分钟/日限额与无效 Key、百度错误码、DeepSeek 402、OpenAI 兼容 404/405 和本地模型空回复的分类。
- [x] 重定向仍全部禁止；不透明的网络失败没有被误称为重定向，只给通用网络提示。
- [x] 没有为了识别跳转而跟随跳转、放宽 HTTPS 策略或额外发送含凭据的探测请求；跳转目标收到 0 次请求的测试仍在（`tests/core/request-security.test.js`）。
- [x] 修改后已重建根插件并通过完整检查。

以后再改这一块时仍须遵守：**不得为了识别跳转而跟随跳转、放宽 HTTPS 策略或额外发送含凭据的探测请求。**

## 4. P1：实际使用电脑的真机验收

真机验收不是开始代码优化的前置条件；但离线测试不能证明 Discord DOM、Webpack 和输入框适配仍然有效。正式稳定发布之前，应验证待发布的确切产物。v0.4.0 新界面的具体验收项见本文开头“v0.4.0 预览版”一节；本节是通用的安全准备和基础清单，两者都要做。

### 安全准备

- [ ] 记录操作系统、Discord、BetterDiscord、插件版本、Git SHA 和插件文件 SHA256。
- [ ] 确认用户允许使用的测试账号、频道和 provider；不默认使用当前私人聊天或生产 key。
- [ ] 记录当前插件启用状态；将旧插件和必要的本地设置备份到仓库外。备份不要上传。
- [ ] 确保初次启用不会触发未知配置的自动翻译或自动发送。不能确定现有配置时，先请用户准备隔离测试环境，不擅自覆盖设置或读取密钥。
- [ ] 先预览安装目标：`npm run plugin:install:dry-run`。安装前确认实际目标、备份及用户授权，不自动关闭用户正在使用的 Discord。
- [ ] 优先只安装、不自动启用：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-plugin.ps1 -NoEnable`；随后在确认测试配置后启用。
- [ ] 真实请求可能发送消息正文并产生费用；发送 Discord 消息会对第三方可见。按当前环境规则获取必要确认。本文不是对所有外部动作的一揽子授权。

### 最小验收清单

| 场景 | 预期 | 状态 |
| --- | --- | --- |
| 插件发现、启停三次、设置页中英文切换 | 无报错、重复按钮、残留事件或样式 | 待验证 |
| 输入框按钮和消息右键入口 | 在目标 Discord 版本可见、可用 | 待验证 |
| 润色等待时继续输入；连续发起两次润色 | 用户新输入保留，最新请求胜出，旧结果不覆盖 | 待验证 |
| 恢复原文、公开双语、发送前确认 | 草稿格式正确；未经确认不发送 | 待验证 |
| 手动翻译后编辑/删除消息 | 陈旧译文不写入新内容或其他消息 | 待验证 |
| 快速滚动、切频道再返回 | 不明显卡顿，不串译，不重复渲染 | 待验证 |
| 静态/动态自定义 emoji、长消息、回复预览 | 不丢关键内容；emoji 无法恢复时安全拒绝显示 | 待验证 |
| Sakura local（若实际使用） | 并发限制有效，取消后不误报超时或自动转云 | 待验证 |
| 真实 provider 的成功路径 | 所选语言与结果正常，仅向指定服务发送请求 | 待验证 |
| 超时、取消、401/403、429、重定向 | 优先用本地 mock/测试服务制造故障；提示正确，不无限重试 | 待验证 |
| 请求中关闭插件或切配置 | 晚到响应不改 DOM、缓存、健康状态，不触发 fallback | 待验证 |

仅测试实际配置的 provider，不必为覆盖所有厂商申请账号或产生费用。其余项目标为“未覆盖”，不要标为通过。未经确认，不清空用户真实缓存、诊断或凭据；清理功能可在隔离配置中验证。

验收结束后，将环境、产物 SHA、步骤、通过/失败/未覆盖项追加到 `docs/host-smoke-test.md`。截图与日志先脱敏，不能包含 key、真实聊天正文、账号/频道标识或本机私人路径。若修改了代码，重建并重新验收受影响项，旧哈希的通过记录不能代替新产物。

## 5. P2 / P3：后续优化候选，未获当前轮自动实施授权

| 优先级 | 候选 | 完成标准 |
| --- | --- | --- |
| P2 | 仅内存缓存模式 | 明确磁盘旧缓存处理策略；重启后行为可预期，不丢用户未确认要删除的数据 |
| P2 | 凭据、缓存、诊断的清理入口 | 分项清理、明确提示与确认；不误删其他插件数据 |
| P2 | 请求量/字符量统计 | 区分缓存命中与实际请求、重试与 fallback；无定价依据时不虚构费用估算 |
| P2 | 独立模块测试 | provider、设置迁移、缓存有聚焦测试，保留完整产物回归 |
| P3 | 统一自动翻译状态机 | 真机基线通过后，小步收敛 Set/Map/Array，维持关键链契约 |
| P3 | 抽离 Discord 适配层 | 隔离 DOM/Store/observer 依赖，不在同一提交混入大规模行为变更 |

## 6. 提交与完成标准

- [ ] 仅提交本轮源码、重建产物、测试及脱敏文档；不提交配置、凭据、node_modules、备份或旧 ZIP。
- [ ] `git diff --check`、`npm run release:check` 通过。
- [ ] 新问题尽量先有失败回归，再修复；不删测试或放宽安全校验来凑通过。
- [ ] 在分支提交并创建 PR，待 Windows Node 22/24 CI 通过，再依用户要求合入 main。
- [ ] 检查 main 的 CI、本地与远端 SHA、工作区状态；记录未完成项。
- [ ] 没有真机结果时，明确写“待验收”，不声称“完全没问题”，不发布稳定版。

## 7. 可直接交给下一台电脑助手的任务

> 请先阅读仓库的 docs/optimization-handoff.md、README.md 和 docs/critical-chain-contracts.md，确认 main、`feat/v0.4.0` 与工作区状态。取消/超时的错误分类已在 v0.3.0 完成，不要重做。优先在本机具备用户允许的 Discord/BetterDiscord 测试条件时，按本文“v0.4.0 预览版”一节的验收清单做真机验收，并把结果写进 docs/host-smoke-test.md 的 v0.4.0 表格。不要重做已合并的安装器与重定向修复，不要使用旧快照覆盖仓库。涉及账号、真实请求、费用、发送消息、安装或删除数据时按本环境规则确认；遇到缺少测试条件时报告具体缺口。发现问题先补失败测试再修复，改动提交到分支，CI 通过后按用户要求合入 main，并更新通过与未覆盖记录。

## English summary

Start from this private repository, not the old ZIP snapshots. v0.3.0 is the latest release on main (`964e51f`, PR #2, tag `v0.3.0`). v0.4.0 is a pre-release on the local branch `feat/v0.4.0`: code integrated at `b3fdd51`, followed by this documentation commit; when this was written the branch had not been pushed and had no PR or GitHub CI run. At `b3fdd51` the source check, 364 module tests, the artifact regressions, the installer tests and the artifact check pass locally. Artifact: 1,737,598 bytes, SHA256 `1795230A2DBA143B8BCAA0AC0B78A3FECC3D0C35D08901F9A598E31C3C68396A`.

v0.4.0 rebuilds the settings window (six tabs, search, setup checklist, model detection, "Try a sentence"), adds a quick panel and a status badge on the AI button, turns the "Always translate" channel rule into an allow-list, reworks translation and error lines, tightens provider error handling and retries, fixes composer writes ("Ask before sending" now sends with Enter), splits the cache and diagnostics into their own data files, keeps keys on reset by default, and makes the installer refuse redirected AppData windows. It was built in three waves of parallel branches with two rounds of independent read-only review and repair branches. Cancellation-versus-timeout handling was already completed in v0.3.0 and is not pending work.

Next: live acceptance of the exact v0.4.0 artifact on the actual Discord/BetterDiscord machine, using the checklist in the v0.4.0 section above (quick panel and badge, tabs and search, reset dialog, ask-before-send via Enter, hotkey recorder, Google/Baidu/DeepL messages, local model detection, "Try a sentence", keeping v0.3.0 cached translations and channel rules after the update). Use a user-approved, isolated account/channel/provider. Protect existing data and credentials; obtain any required confirmation before real requests, costs, messages, installation, or deletion. Record actual environment, commit/hash, passes, failures, and uncovered scenarios in the host smoke record, which has an empty v0.4.0 table for this.

Optional later work includes memory-only caching, explicit data-cleanup controls, request/character accounting, focused module tests, and gradual state-machine/Discord-adapter extraction after host acceptance. These are candidates, not blanket authorization to implement everything. Submit scoped changes through a branch/PR, check CI before and after merging, and keep the release marked as a preview until host acceptance is complete.
