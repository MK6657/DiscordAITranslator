# 优化清单与换机接手说明 / Optimization handoff

更新日期：2026-09-08。本文是下一台电脑的接手入口，不代表清单里的功能已经实现。后续完成一项时，请更新状态、提交号和验证记录，不要只改勾选框。

## 1. 当前基线：先看这里

- 私有仓库：https://github.com/MK6657/DiscordAITranslator
- 工作基线：main，最近一次代码合并提交 `f840f2ee7920b654fdf825dcca5ff1ff702cae12`（PR #1）。本文之后可能还有文档提交，接手时仍以远端最新 main 为准。
- 版本：v0.2.0 + Unreleased，基于 7 月 26 日 c 快照，已加入后续安全修复；不是稳定版 Release。
- 已完成：安装器 SHA256 不再依赖 Get-FileHash；备份重名时不再误删原插件；API 请求禁止自动重定向；新增回归测试；中英文 README；锁定 CI 动作版本。
- 已通过：上述代码基线的本地 release:check、PR 和 main 的 Windows Node 22/24 CI；当时 npm audit（含开发依赖）报告 0 个已知漏洞。
- **未完成：取消/超时错误提示优化，以及最新产物的真实 Discord 验收。**
- 前一环境只创建了 `fix/error-feedback-2026-09-08` 本地分支，未修改或提交该优化，也未推送该分支。不要查找不存在的远端实现。
- 前一环境的 Computer Use 被用户停止；仅定位过 Discord 窗口，不能据此声称插件加载、启停或功能验收通过。用户明确改由实际使用的另一台电脑继续。

当前代码基线产物指纹（修改并重建后会变化）：

```text
DiscordAITranslator.plugin.js
Bytes: 1336059
SHA256: 155F16DCC1D50EFDE4D49B9FA299C8110ABEF8F64BD23A50DF2DA1CEFC729D69
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

已有克隆时，先检查 `git status`，保护本机未提交内容，再执行 `git pull --ff-only`。不要使用强制重置或用旧压缩包覆盖最新仓库。检查通过后，从最新 main 创建自己的优化分支，先修小问题，再验收；最后通过 PR 合并。

优先阅读：

- [中文说明](../README.md) / [English README](../README.en.md)
- [关键链契约](critical-chain-contracts.md)
- [当前架构](architecture.md)
- [上一轮复查](review-2026-09-08.md)
- [历史宿主测试与当前状态](host-smoke-test.md)

`HANDOFF.md` 和 `BASELINE-2026-07-26*.md` 是历史资料，其中“明日测试”“无 Git 提交”等描述不是当前状态。

## 3. P1：错误提示优化——下一项可直接开展的代码工作

现有问题已通过代码定位，但尚未实施修复：

- `src/providers/provider-layer.js` 的 `fetchApiResponseText()` 将所有 AbortError 改写成超时错误；`isTimeoutError()` 也把 AbortError 直接归为超时。
- `scripts/verify-plugin.js` 中的主动中止测试目前仍断言“timed out”，需要随正确行为一起更新，不能仅改提示而保留错误分类。
- `src/discord-ai-translator.js` 的 `getFriendlyErrorMessage()` 负责最终提示；`src/i18n.js` 保存中英文文案。
- 自动翻译错误分类位于 `src/auto-translation/queue-core.js`。取消不应被误判为服务故障、无效输出或触发云端 fallback。

建议实施与验收：

- [ ] 先补测试区分“插件停止/主动取消”和“定时器超时”，使用明确的错误代码或类型，不依赖模糊文本匹配。
- [ ] 取消提示为“请求已取消”，真实超时仍提示“请求超时”；中英文一致。
- [ ] 不把主动取消计为 provider 故障，不因此增加冷却或发起 fallback；保持晚到结果不能写 DOM、缓存和健康状态的契约。
- [ ] 超时、取消、请求成功和响应读取失败后都释放计时器与 AbortController 跟踪。
- [ ] 检查 401/403、429、配额不足、无效 URL、不安全 URL、网络错误的分类与提示；只改已复现的问题。
- [ ] 对重定向阻止给出合理说明，但不要将所有 fetch 网络错误都武断归为跳转错误。浏览器可能只给出不透明的失败信息；能确定时才专门提示，不能确定时保留通用网络提示与检查最终 URL 的建议。
- [ ] **不得为了识别跳转而跟随跳转、放宽 HTTPS 策略或额外发送含凭据的探测请求。** 保持跳转目标收到 0 次请求的既有测试。
- [ ] 修改 src 后重建根插件，运行完整 release:check，再检查生成物与源码一致。

## 4. P1：实际使用电脑的真机验收

真机验收不是开始代码优化的前置条件；但离线测试不能证明 Discord DOM、Webpack 和输入框适配仍然有效。正式稳定发布之前，应验证待发布的确切产物。

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

> 请先阅读仓库的 docs/optimization-handoff.md、README.md 和 docs/critical-chain-contracts.md，确认最新 main 与工作区状态。优先修复并测试取消/超时的错误分类及中英文提示；代码完成后，在本机具备用户允许的 Discord/BetterDiscord 测试条件时进行真机验收。不要重做已合并的安装器与重定向修复，不要使用旧快照覆盖仓库。涉及账号、真实请求、费用、发送消息、安装或删除数据时按本环境规则确认；遇到缺少测试条件时报告具体缺口。完成的改动提交到优化分支，CI 通过后按用户要求合入 main，并更新通过与未覆盖记录。

## English summary

Start from the latest main of this private repository, not the old ZIP snapshots. Code baseline `f840f2e` passed local and Windows Node 22/24 CI. Installer hashing/rollback and redirect protection are already implemented. Cancellation-versus-timeout improvements are **not implemented**; the local error-feedback branch had no changes and was never pushed. No current live-host acceptance was completed.

Next: add failing tests, distinguish cancellation from timeout without penalizing provider health or triggering fallback, improve localized error feedback, and preserve redirect safety. Then test the exact artifact on the actual Discord/BetterDiscord machine using a user-approved, isolated account/channel/provider. Protect existing data and credentials; obtain any required confirmation before real requests, costs, messages, installation, or deletion. Record actual environment, commit/hash, passes, failures, and uncovered scenarios in the host smoke record.

Optional later work includes memory-only caching, explicit data-cleanup controls, request/character accounting, focused module tests, and gradual state-machine/Discord-adapter extraction after host acceptance. These are candidates, not blanket authorization to implement everything. Submit scoped changes through a branch/PR, check CI before and after merging, and keep the release marked as a preview until host acceptance is complete.
