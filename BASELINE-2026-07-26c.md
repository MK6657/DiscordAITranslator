# 基线快照说明 c 版 · 2026-07-26（待宿主验收版）

> 历史归档：文中的“明日”是原计划，并非已完成的测试。当前仓库基于此 c 版；原打包清单和 b 版回退压缩包不随仓库分发。当前验证范围见 [2026-09-08 整理记录](docs/repository-intake-2026-09-08.md)。

> 版本链：`HANDOFF.md`（07-14 历史）→ a 版（修复批次）→ b 版（intake 修复 + 模块化阶段 0.5-5）→ **本 c 版（阶段 6 前置完成）**。
> **明日测试对象是本 c 版；回退点是 b 版**（`DiscordAITranslator-baseline-2026-07-26b.zip`）。b→c 之间的全部改动都属于"设计上行为不变"的搬移与只读视图，理论上与 b 行为一致；若真机发现回归，直接用 b 版覆盖即可。

## 1. 生成产物指纹

```text
文件：DiscordAITranslator.plugin.js
大小：1,335,794 bytes
SHA256：BA7CDD6729BD09CAA67A4F5D1B87CF4E318742F2D7EE93888A0F51BB3023E94B
```

## 2. 相对 b 版的改动（全部行为等价）

1. **阶段 6 前置 A**：`src/auto-translation/queue-core.js` —— 队列状态/调度/失败/决策/频道策略/时间窗，142 方法、2,016 行，门面代理搬移。
2. **阶段 6 前置 B**：`src/auto-translation/request-pipeline.js` —— 扫描工作流、批量/长文本请求、重试、请求选项、文本可译性策略，98 方法、2,506 行，门面代理搬移。
3. **阶段 6.0**：`src/auto-translation/task-state.js` —— 只读 TaskState 视图：`getAutoTranslationTaskSnapshot(key)` 统一快照、`checkAutoTranslationTaskInvariants()` 不变量检查（I1-I5：queue/queuedKeys 对齐、in-flight 三表对齐、渲染队列三结构对齐、计数非负）。**不改任何存储，不主动运行**；配套生命周期回归覆盖 enqueue→take→in-flight→finish→remove 与渲染队列全流程。
4. DOM 渲染、候选 intake、observer 刻意留在主文件——那是阶段 7 Discord 适配层的边界。

主文件：18,305 → **13,930 行**（原始 26,013，累计 -46%）。源码 22 个文件。

## 3. 明日验收要点（在 HANDOFF §13 矩阵之上加验）

- b 版新增项照旧：开 BDFDB 的自动翻译、超长消息 store-full 升级、快速滚动流畅度。
- c 版重点：**自动翻译全链路行为与 b 版一致性**——排队顺序、并发上限、失败冷却、渲染时机肉眼无差异；启停三次无异常（门面装配在构造器最前，重点看启动无报错）。
- 回归感知点：若出现"某功能完全不动"类故障，多半是门面代理断链（会伴随 console 报错 `xxx is not a function`），导出诊断即可精确定位。

## 4. 回退操作

1. 关闭 Discord；
2. 用 `DiscordAITranslator-baseline-2026-07-26b.zip` 解压覆盖项目文件夹；
3. 把 b 版根目录 `DiscordAITranslator.plugin.js` 复制进 BetterDiscord plugins 目录覆盖即可（设置/缓存数据与版本无关，不受影响）。

## 5. 验证状态（离线，2026-07-26）

21+1 源文件语法检查、3 项核心模块测试、完整离线回归（含 TaskState 不变量回归与此前全部批次）、产物结构检查、干净解压副本复验全绿。真机宿主验收待明日进行。阶段 6 正式迁移与阶段 7 在宿主验收通过后启动（路线见 `docs/refactor-direction-2026-07-26.md` 与 `docs/architecture.md`）。
