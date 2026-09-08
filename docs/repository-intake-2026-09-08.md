# Repository intake / 仓库整理 · 2026-09-08

> 本文记录首次整理时的状态；后续运行时修复和最新产物指纹见 [复查记录](review-2026-09-08.md)。This is the initial intake record; see the [follow-up review](review-2026-09-08.md) for subsequent runtime changes and the updated hash.

## 中文

当前源码来自原始 `DiscordAITranslator-handoff-2026-07-14` 目录，但其内容已经是 2026-07-26 c 版，而不是 7 月 14 日版本。仓库作为该快照的首次 Git 基线，不虚构此前的提交历史。旧快照和 a/b/c 压缩包保留在本地，不在仓库中分发。

本次仅修复安装器及测试入口的哈希命令依赖，并整理中英文说明、忽略规则和历史文档标记。首次检查中，默认 `npm run ci` 的安装器测试报告无法找到 `Get-FileHash`；显式加载 Utility 模块后本地通过，但首次 GitHub Windows CI 仍失败。因此最终改用 .NET 流式 SHA256，并在测试中故意屏蔽 `Get-FileHash`，确保安装、备份、启用及回滚不再依赖该命令。哈希流和算法对象均在 finally 中释放。

插件运行逻辑和 `0.2.0` 元数据未改动，未发布修改继续保留在 CHANGELOG 的 Unreleased 节，不创建稳定版 Release。

原 c 版压缩包与当前生成物指纹一致：

```text
DiscordAITranslator.plugin.js
Bytes: 1335794
SHA256: BA7CDD6729BD09CAA67A4F5D1B87CF4E318742F2D7EE93888A0F51BB3023E94B
```

离线验证环境：Windows、Node.js v22.23.1、npm 10.9.8、Windows PowerShell 5.1。修复后 `npm run release:check` 已通过，包含 22 个 JavaScript 文件检查、构建一致性、3 个核心模块测试、完整插件回归、隔离临时目录内的安装/回滚测试、产物结构及仓库边界检查。GitHub Actions 的实际结果以仓库运行记录为准，不用本地通过结果代替云端结果。

真实 Discord 只存在 2026-07-13 旧产物的宿主冒烟记录。本次没有操作真实 Discord、发送消息或调用真实翻译服务。当前 c 版真机验收仍待完成；历史记录中的“明日测试”不能视为验收已完成。敏感信息模式扫描也不是完整安全审计。

## English

This is the first Git baseline for the July 26 c source snapshot, which was stored in a directory still named `DiscordAITranslator-handoff-2026-07-14`. Earlier Git history is not reconstructed. Older source snapshots and a/b/c ZIP archives remain local and are not distributed here.

Intake changes fix the installer's hash-command dependency, add Chinese/English documentation, and clarify archive exclusions and historical records. The original default CI command failed to resolve `Get-FileHash`. Explicitly loading Utility passed locally but still failed in the first GitHub Windows run, so the final implementation computes SHA256 directly through .NET streams, disposing both the stream and algorithm in finally. The regression fixtures deliberately make `Get-FileHash` unavailable to verify installation/backup/enablement/rollback without that command.

Plugin runtime code and the `0.2.0` metadata are unchanged; later work remains under Unreleased. This upload is not a stable Release. The artifact size and SHA256 above match the original c archive.

Local validation uses Windows, Node v22.23.1, npm 10.9.8, and Windows PowerShell 5.1. After the fix, `npm run release:check` passed: 22 JavaScript files, reproducible build consistency, 3 core module tests, full offline plugin regressions, isolated installer rollback fixtures, artifact shape, and repository boundaries. Consult actual GitHub Actions runs for cloud CI results.

No real Discord profile, message, or translation service was used during intake. The July 13 host smoke record applies only to an older artifact. Current c-snapshot host acceptance remains pending, and secret-pattern scanning is not a complete security audit.
