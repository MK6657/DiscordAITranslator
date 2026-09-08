# 两个遗留问题的方向分析（2026-07-26，纯分析，未改代码）

针对基线说明 §5 的两个遗留项：① 增量扫描 intake mode 硬编码；② 主文件巨石化。本文基于对当前基线源码的逐行核对与量化统计，给出修复/推进方向。所有行号对应 `baseline-2026-07-26` 快照。

---

## 一、intake mode 问题：精确定位与修复方案

### 1.1 现状（三条路径，只有一条坏）

自动翻译候选的生成有三个入口，行为不一致：

| 路径 | 入口 | 是否尊重 `ui.autoTranslateIntakeMode` |
| --- | --- | --- |
| **主扫描（增量）** | `scanDiscordUi` → `scheduleIncrementalMessageScan`（8340） | ❌ 硬编码 `{mode:"dom"}`（8362-8371），每消息只走 `createDomAutoTranslationCandidatesForMessage`（8396） |
| 缓存-only 扫描 | `queueAutoTranslateVisibleMessages(context, {cacheOnly:true})`（8228） | ✅ 走 `createAutoTranslationCandidates`（10803），mode 感知 |
| 历史补翻 | 10720 | ✅ 同上 |

关键点：`shouldUseIncrementalMessageScan`（8333）只要 `window.requestIdleCallback` 存在且有消息节点就返回 true——真实 Discord（Chromium）恒为 true，**所以主扫描永远走增量路径**，非增量分支（8316-8322）在真实宿主里实际是死分支。设置项在主流程等于摆设。

### 1.2 实际损失有多大（比"BDFDB 完全失效"轻）

逐行核对后，损失比表面描述窄一些，因为 DOM 候选的消息身份并没有全丢：

- `evaluateAutoTranslationCandidate` → `withAutoTranslationCandidateIdentity`：candidate 没带 `messageIdentity` 时回退 `messageTracker.getIdentity(messageNode, …)`，而 MessageTracker 能直接从 DOM 的 `chat-messages-<channelId>-<messageId>` 属性解析出结构化身份。**常规消息的缓存键/身份校验在 DOM 模式下基本不受影响。**

真正丢掉的是 BDFDB/Store 增强路径（`createBdfdbAutoTranslationCandidates`，10860）提供的三样东西：

1. **`fullContent` 升级（`sourceTextKind: "store-full"`）**：DOM 文本比 Store 全文短超过 4 字符且兼容时，用 Store 全文翻译（10864-10868）。丢失后果：DOM 截断/折叠的长消息按不完整文本翻译。这是最实质的功能损失。
2. **Store 兜底身份解析**：DOM 节点 id 缺失/歧义（如 `data-list-item-id` 变体）时通过 `getStoreResolvedMessageIds` 反查（10932-10940）。丢失后果：这类消息退化为指纹身份，跨 DOM 复用的缓存命中率下降。
3. **诊断诚实性**：`auto.intake` 与 `auto.scan` 永远记录 mode "dom"，排查"为什么 BDFDB 没生效"时会被诊断误导。

结论：这是**质量缺口**而非正确性灾难——不会写错译文，但长消息翻不全、诊断说谎。修复价值确实存在，风险也确实集中在最复杂子系统。

### 1.3 修复方案对比

**方案 A（推荐）：把 mode 感知接进增量初始化，每消息做增强**

- `runSlice` 的 `initialized` 块（8359）改为：解析一次 `normalizeAutoTranslateIntakeMode` + `isBdfdbMessageIntakeAvailable`，构造真实 intake 对象；
- 每消息分支（8395-8399）在 mode ≠ dom 且可用时，对该消息的 DOM 候选调 `createBdfdbAutoTranslationCandidates(context, candidates)`（它本来就是 per-candidate 的 map，天然支持单消息批量），并累加 `bdfdbEnhanced` 计数；
- Store 快照已按 context 缓存（`getBdfdbStoreSnapshot(channelId, context)`），一轮扫描一份快照的既有约束自动保持；
- 每消息的 Store 匹配成本被增量切片预算（`INCREMENTAL_MESSAGE_WORK_BUDGET_MS`、`isInputPending`）天然限流——**比旧的非增量全量路径更平滑**，不是更卡。

**方案 B：只修诊断**（intake 记录真实配置 + `reason: "incremental-dom-only"`）。低风险但功能不恢复，只建议作为 A 无法排期时的临时步。

**方案 C：mode ≠ dom 时禁用增量扫描**（退回同步全量路径）。恢复功能但重新引入扫描卡顿——增量路径正是为性能加的，不建议。

### 1.4 方案 A 必须先补的聚焦回归（动手前写好）

现有可复用资产：`scripts/verify-plugin.js` 5500+ 行已有对 `createAutoTranslationCandidates` 的三种 mode fixture（含伪 Store）。需要新增：

1. **差分等价测试**（核心）：同一套 fake DOM + fake Store fixture，分别跑"非增量路径"与"增量路径跑完全部切片"，断言产出的候选集（text / sourceTextKind / messageIdentity / source）完全一致——dom、auto+可用、auto+不可用、bdfdb+不可用四组。
2. 增量初始化后 `context.autoTranslateIntake` 的 mode/source/bdfdbAvailable/bdfdbEnhanced 与配置匹配；`auto.scan` 诊断里 intakeMode 不再恒为 "dom"。
3. Store 快照一轮扫描只取一次（对 `getDiscordMessageStoreMessages` 计数断言，跨多个切片）。
4. 切片中途 `incrementalMessageScanGeneration` 失效 → 后续切片不再做 Store 匹配、不产生候选（现有 generation 守卫模式照抄）。
5. `store-full` 升级候选从增量路径入队后，缓存键/身份提交链与非增量一致（复用现有 identityUpgrade 测试骨架）。
6. 性能守卫：单切片处理条数上限逻辑在开启增强后仍受 `INCREMENTAL_MESSAGE_WORK_MAX_PER_SLICE` 约束（fake deadline 断言）。

工作量评估：回归先行 + 实现 + 联调 ≈ 1-2 个专注工作日；改动集中在 `scheduleIncrementalMessageScan` 一个方法内约 20-40 行，风险可控。**建议作为独立小版本先做，不要和 P2 模块化混在一起。**

---

## 二、巨石文件模块化：量化现状与推进方向

### 2.1 主类构成（按子系统聚类，启发式统计）

主类 1160 个方法、约 2.39 万行（另有 MessageTracker/TranslationScheduler 两个文件内类约 600 行）：

| 子系统 | 约行数 | 方法数 | 备注 |
| --- | --- | --- | --- |
| 自动翻译 扫描/队列/调度 | 6,246 | 279 | 最大块，HANDOFF 明令最后拆 |
| 主题/样式 | 2,795 | 18 | 大头是静态 CSS 字符串——**低风险高收益的瘦身点** |
| Provider/请求层 | 2,540 | 152 | 边界最清晰的大块 |
| 输入框/润色/双语 | 2,268 | 137 | 已有 ComposerWriter 配合 |
| 设置 UI（面板/控件） | ~2,500-3,000 | 65+未归类里的 row 构建器 | DOM 构建器，逻辑少 |
| 诊断/日志 | 1,070 | 54 | |
| 设置核心（读写/迁移） | 845 | 34 | 契约最严（读失败不覆盖） |
| 翻译缓存 | 815 | 58 | |
| 渲染/译文 DOM | 558 | 30 | |
| Observer/Mutation/媒体查看器 | 553 | 46 | |
| 消息身份/文本提取 | 553 | 32 | 与 MessageTracker 联动 |
| 其他（生命周期、工具、设置 UI 细件等） | ~3,800 | 231 | |

### 2.2 一个决定拆分方式的硬约束：测试对类表面的耦合

对 `scripts/verify-plugin.js` 的静态统计：

- `new Plugin()` 实例化 **479 次**；
- 以 `plugin.method = …` 方式**桩替换 145 个**不同方法；
- 直接调用 **368 个**不同方法；
- 合计 **426 个方法（占类表面 35%）是测试的载荷 API**。

这意味着：**任何把方法从类上移走/改名的拆法都会大面积炸测试**——而这套 1.3 万行回归恰恰是项目最值钱的资产。本次修复批次已经踩过一次雷（`injectPolishButton` 在 src 内零调用、看似死代码，实际被测试使用，删除后测试立刻失败，已恢复）。

由此推导出三条拆分纪律：

1. **门面代理（facade delegation）**：逻辑搬进模块，主类保留一行代理方法（`buildBaiduTranslateRequest(...args) { return this.providers.buildBaiduRequest(...args); }`）。426 个被测方法的代理清单可以用脚本自动生成（本次统计脚本即可复用）。
2. **过渡期禁止模块间直接 import**：模块只拿 `plugin` 门面回调其他子系统（ComposerWriter/MessageTracker 现在就是这个模式）。否则测试对 `plugin.xxx` 的桩替换会被绕过，出现"测试绿但桩没生效"的假阳性。
3. **搬移与改动分离**：每阶段先"纯搬移 + 代理"（产物行为逐字节等价可验），跑绿全量回归，再做该模块的行为改动。两者绝不同 commit。

### 2.3 分阶段路线（沿用 HANDOFF §12 P2 次序，按数据微调）

**阶段 0（使能，半天-一天）**
- 以 baseline-2026-07-26 建 git 首个 commit + tag（无历史可回退是当前最大流程风险）。
- 固化上面三条拆分纪律进 CONTRIBUTING/architecture 文档；生成 426 个被测方法清单入库。
- 每阶段的验收口径统一为：`npm run build && npm run ci` 全绿 + 产物 diff 审查。

**阶段 0.5（计划外但值得先做的"无脑瘦身"，各半天）**
- 把静态 CSS 字符串挪到 `src/styles.js`（~2,000+ 行纯文本，零逻辑风险）；
- I18N 两张表挪到 `src/i18n.js`（~700 行）+ `t()` 留在类上。
- 仅这两步主文件即可缩 ~3,000 行，为后续阶段减少认知负担。

**阶段 1：TranslationResult 值对象（HANDOFF P2-1，小）**
把"是否走了 fallback、哪个 provider"从 `options.requestContext` 副作用改成显式返回值。本次修复的 `joinSharedModelRequest`/promise 打标（`daitFallbackProvider`）正是这个副作用通道的补丁——值对象化之后这两个补丁可以自然消解。消费点约 4 处（18472/19684 等），已有去重-fallback 回归护航。

**阶段 2：设置核心 → `src/settings/settings-store.js`（~845 行）**
loadSettings/saveSettings/flush/ensureSettingsShape/mergeSettings/setSetting + BdApi.Data 访问。契约"读失败不得覆盖已存配置"已有完整测试覆盖，抽离风险主要是代理纪律执行。

**阶段 3：Provider 层 → `src/providers/`（~2,540 行，最大净收益）**
registry（PROVIDER_DEFAULTS/CAPABILITIES）、endpoint 安全策略、七家 request builder、parser、错误映射、fallback 策略。近乎纯函数（fetch 经注入以便测试桩），本次的百度行组/请求键/emoji 回归都压在这层。建议按 builder→parser→policy 三小步走。

**阶段 4：缓存 → `src/cache/translation-cache.js`（~815 行）**
key/别名/TTL/紧凑编码/持久化仓库。契约：fallback 结果不进主命名空间、易失身份不持久化。

**阶段 5：输出校验 + 诊断（~1,070+ 行）**
`getAutoTranslationInvalidOutputReason` 家族是纯文本逻辑，最适合补密集单测；诊断记录器（聚合/上限/延迟写）独立成模块。

**阶段 6：自动翻译状态机（P2-6，最难，最后做）**
把 `autoTranslationQueue/QueuedKeys/PendingTargets/InFlight*/RenderQueue*/Failures*` 十余套并行集合收敛为单一任务状态机。建议路径：先引入 `TaskState` 只读视图（不改存储）→ 逐个集合迁入 → 最后删旧集合。每迁一个集合跑一次全量回归。本次修复中发现的问题（in-flight 计数钳制、terminal 失败清扫、pendingTargets 与 queuedKeys 语义重叠）都是这套并行集合天然的病灶，状态机化是根治。

**阶段 7：Discord 适配层（observer/身份/DOM 渲染，P2-7）**
最后收口。此时主文件应只剩生命周期 + 编排，目标 ~5-7k 行。

### 2.4 里程碑与不做清单

- 每阶段独立可发布：阶段间随时可以停下来出版本，不存在"拆一半不能发"的状态。
- 预期主文件行数轨迹：26.0k → 阶段0.5 后 ~23k → 阶段3 后 ~20k → 阶段6 后 ~10k → 阶段7 后 ~5-7k。
- **不做**：一次性重写；引入 TypeScript/打包器变更/测试框架迁移（与模块化正交，别捆绑）；在阶段 6 之前动 MessageTracker/TranslationScheduler 的行为。

### 2.5 与问题一的排期关系

intake 修复（方案 A）只碰 `scheduleIncrementalMessageScan` 一个方法，与 P2 各阶段无重叠，建议顺序：**intake 修复 → 宿主验收（HANDOFF P0）→ 阶段 0/0.5 → P2 逐阶段**。先修 intake 的理由：它是用户可感知的功能缺口；且它的差分回归恰好会成为阶段 6 重构自动翻译子系统时的护栏资产。
