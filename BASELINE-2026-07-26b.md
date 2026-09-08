# 基线快照说明 b 版 · 2026-07-26

> 历史归档：本文的清单、回退压缩包和 a 版说明属于原始本地交付包，不随当前源码仓库分发。当前状态以 README 和 2026-09-08 整理记录为准。

> 本基线取代同日早些时候的 `DiscordAITranslator-baseline-2026-07-26.zip`（a 版）。a 版对应"修复批次完成、重构未开始"的状态；**b 版在其上完成了 intake 修复与模块化阶段 0.5-5**。完整背景：`HANDOFF.md`（2026-07-14 历史快照）→ `BASELINE-2026-07-26.md`（a 版差异）→ 本文（b 版差异）→ `docs/refactor-direction-2026-07-26.md`（路线依据）。

## 1. 生成产物指纹

```text
文件：DiscordAITranslator.plugin.js
大小：1,281,929 bytes
SHA256：5008A7F5550C327D7436F33FC67728AC8E6489965E6FE6DC1E9CBD3AF7CAD43C
```

全部文件哈希见 `BASELINE-MANIFEST-SHA256.txt`。

## 2. 相对 a 版的改动

**intake 修复（方案 A）**：增量扫描接入 `ui.autoTranslateIntakeMode`。BDFDB/Store 身份增强与 store-full 长文升级现在对主扫描路径生效；intake 诊断报告真实配置；"一轮扫描一份 Store 快照"约束跨 idle 切片保持。附 6 组聚焦回归（差分等价、intake 状态、快照单取、代际失效、切片预算、store-full 端到端），实现前先行红灯验证。

**模块化阶段 0.5-5**（全部为门面代理式搬移，主类方法表面不变，行为与测试契约不变）：

| 阶段 | 新模块 | 内容 | 规模 |
| --- | --- | --- | --- |
| 0.5 | `src/styles.js` / `src/i18n.js` | 静态样式表（逐字节一致）/ 中英文文案表 | 2,572 + 699 行 |
| 前置 | `src/constants.js` | 150 个模块级常量 | 889 行 |
| 1 | （主文件内） | `runModelTaskWithResult` 返回显式 TranslationResult `{text, fallbackProvider}`；去重回退元数据改为带内传递，废除共享 Promise 打标 hack；`runModelTask` 保持字符串门面 | — |
| 2 | `src/settings/settings-store.js` | 设置读写/迁移/任务配置/提示词模板 CRUD（24 方法） | 809 行 |
| 3 | `src/providers/provider-layer.js` | provider 注册表、endpoint 安全策略、七家请求构建/解析、错误映射、fallback 策略、Google Key 池、本地健康探测（113 方法） | 1,926 行 |
| 4 | `src/cache/translation-cache-store.js` | 缓存键/别名/TTL/紧凑编码/负查找/持久化（47 方法） | 671 行 |
| 5a | `src/validation/output-guard.js` | 输出校验族（emoji 完整性、泄漏/拒答/词典/标注形态、简繁检查等 23 方法） | 434 行 |
| 5b | `src/diagnostics/diagnostics-recorder.js` | 诊断记录/聚合/元数据/持久化（23 方法） | 563 行 |

主文件：26,013 → **18,305 行**。源码文件 11 → 19 个。

**拆分纪律（已验证执行）**：主类为每个搬移方法保留一行代理；模块内所有跨子系统调用一律经 `this.plugin` 门面（保证测试对类表面的 145 处桩替换全部继续生效）；搬移与行为改动分 commit 粒度执行；每阶段全量回归绿灯后才进下一阶段。静态审计：0 处 `plugin.plugin` 改写残留、0 处未解析的门面调用。

## 3. 验证状态

本快照通过（2026-07-26，Node 22）：源码检查（19 文件）、3 项核心模块测试、完整离线回归（含本批全部新增回归与既有 2300+ 断言）、产物结构检查、干净解压副本复验。

与 a 版相同、仍未完成：真实 Discord 宿主验收（HANDOFF §10/§13）、Windows 安装器测试、`release:check`（需 Git 仓库）。**接手后先在本机 `npm ci && npm run verify` 用锁定 esbuild 0.28.1 复核构建。**

## 4. 剩余目标（按计划挂起，非遗漏）

阶段 6（自动翻译状态机收敛，~6,200 行 279 方法）与阶段 7（Discord 适配层）按 `docs/refactor-direction-2026-07-26.md` 的门槛，**必须先完成当前状态的真机宿主验收**再启动——它们改的是行为结构而非位置，需要真机确认阶段 1-5 无回归后才有安全基础。宿主验收清单沿用 HANDOFF §13，本批需重点加验：开启 BDFDB 时的自动翻译（intake 增强首次进入主路径）、长消息 store-full 升级、滚动流畅度（确认切片内 Store 匹配无感）。

## 5. 建议的 Git 基线

解压后 `git init`，把 a 版内容做首个 commit（tag `baseline-2026-07-26a`），再把本版做第二个 commit（tag `baseline-2026-07-26b`）——两个 tag 正好构成"重构前/后"的可回退对照。
