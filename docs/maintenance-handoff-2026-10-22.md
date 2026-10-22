# 维护交接：v0.4.0 预览版（2026-10-22）

本文面向以后接手的维护者，记录截至 2026-10-22 的代码、GitHub、已知问题和验证边界。本分支用于保存完整工作成果和维护资料，不代表已知问题已经修复，也不代表已通过真实 Discord 验收。

## 1. 先读结论

- 接手分支：[`codex/maintenance-v0.4.0-2026-10-22`](https://github.com/MK6657/DiscordAITranslator/tree/codex/maintenance-v0.4.0-2026-10-22)。
- 本分支从 `main` 的 v0.3.0 基线创建，以合并提交 `05d774f` 纳入 `feat/v0.4.0` 的完整历史，再追加本次维护资料。继续修复时以本分支为起点。
- **功能代码仍等同于 `2fe3f0c84264256f592e8e417a03b8b14503fd0e`，版本号为 `0.4.0`。本次没有修复下列问题或改变模型、Discord、BetterDiscord 设置。**
- 原 [PR #3](https://github.com/MK6657/DiscordAITranslator/pull/3) 截至核对时仍然打开、无合并冲突，Windows Node 22/24 检查均成功。没有代码冲突或 CI 失败，不等于已知缺陷不存在。
- 已确认三项待修问题：模型结果可新增群体提及、取消自动翻译会清失败记录、持续失败没有总重试上限。详见第 4 节。
- v0.4.0 的九项真实 Discord 验收仍全部待执行。当前机器的安装文件也不是最新仓库构建，不能把旧安装的使用情况当成本分支验收结果。
- 后续建议顺序：处理三项已确认问题及其他高影响审查线索 → 修复测试宿主并确认安装指纹 → 完成真机验收 → 决定是否合入主分支或发布。

## 2. 分支、版本和产物的准确基线

下表是 2026-10-22 的快照；将来远端分支发生变化时，以实际提交为准。

| 对象 | 基线 / 状态 |
| --- | --- |
| `origin/main` | `964e51f123dbe52b7168224cccd5ef5d0b9bed2a`，2026-09-25 合并 PR #2，v0.3.0 |
| `origin/feat/v0.4.0` | `2fe3f0c84264256f592e8e417a03b8b14503fd0e`，2026-09-26 的最终主题构建 |
| 本机原开发分支 | 与上述远端 v0.4.0 分支相同，已跟踪文件无未提交修改 |
| 本维护分支合并点 | `05d774f`，父提交依次为 `964e51f`、`2fe3f0c` |
| 原 PR #3 | 打开、非草稿、GitHub 显示 `MERGEABLE / CLEAN`；没有提交评审记录 |
| 已发布版本 | `v0.3.0`，标记为预发布；尚无 v0.4.0 Release |
| 仓库可见性 | GitHub 当前为 Public；交接资料不包含凭据、个人配置或组织者的私有测试页面链接 |
| 新维护分支的用途 | 保存集成代码与明确的问题清单，供后续维护；原 PR #3 不包含这次交接文档 |

仓库中的 `DiscordAITranslator.plugin.js`：

```text
Version: 0.4.0
Bytes: 1782270
SHA256: ed718cac37b2bc1bcf5032c46647b2ee60e65ccd20cf20b00c5ce7226abd4570
```

本维护分支不改变源代码和构建产物，因此上述指纹应保持不变。以后修改源码时运行 `npm run build`，连同新的产物一起提交，并重新记录指纹。版本号相同不能证明安装文件相同。

截至接手核对，原 v0.4.0 相比主分支包含 171 个提交（包括合并提交）、67 个变更文件。原有工程 `wip/*` 分支的提交均已包含在 v0.4.0 中，不应再逐个重复合并。以后有新的分支提交时重新用 Git 核实。

## 3. 已经做到哪里

### 已在主分支的 v0.3.0

- 本地和云端自动翻译并发可配置为 1–10；实际吞吐还取决于模型服务的槽位和硬件。
- 区分请求主动取消与超时，取消不作为服务商故障；模型识别、长文本补救及晚到响应的取消处理。
- 滚动回看时，在聊天短暂停止后绘制已缓存译文；修正可见性判断、滚动锚定和贴底行为。
- 版本号从 `package.json` 统一生成，并提供安装文件一致性检查。
- 已合并 PR #2 并发布 v0.3.0 预览版；完整真机验收并未因此完成。

### 已集成在 v0.4.0 的功能

- 六标签设置窗口、设置搜索、概览上手清单、服务卡片、模型检测和“试译一句”。
- AI 快捷面板、五种状态标记，以及跟随 Discord / 浅色 / 深色窗口主题。
- 频道白名单规则；“总是翻译”可在总开关关闭时工作，“不翻译”优先。
- 译文加载行、错误动作、悬停工具栏、复制/重新翻译/隐藏、右到左语言支持。
- Google、Microsoft、DeepL、百度的语言代码及错误分类等修正。
- 请求取消、截断补救、批量失败退避、长消息部分结果、手动请求预算等改动。
- 输入框多行草稿和 token 处理、晚到结果面板，以及发送确认流程调整。
- 缓存与诊断独立数据文件、旧数据迁移、缓存按消息计数、退出前保存。
- 安装器拒绝 AppData 重定向环境，发布检查增加浏览器数据和嵌套仓库守卫。

这些是已经实现并进入代码的内容，不是“所有相关问题均解决”的保证。第 4 节列出的缺陷说明其中仍存在遗漏。完整用户变化见 [CHANGELOG](../CHANGELOG.md)，架构见 [architecture.md](architecture.md)，应保留的行为见 [关键链契约](critical-chain-contracts.md)。

## 4. 三项本次确认的待修问题

证据级别：**源码审查 + 不联网的 Node 纯内存调用**。没有发送 Discord 消息，没有调用真实模型，也没有运行真实 Discord 端到端重现。这里确认的是代码路径和状态变化；用户实际收到通知、真实服务请求数量等宿主效果还需验证。

下文源码行号以 `2fe3f0c` 为准；后续改动可能导致行号变化，优先按方法名定位。

### M-01：模型结果可新增 `@everyone` / `@here`

- 状态：待修。建议优先级 P0，先于发送流程的真机验收处理。
- 代码入口：[`ProviderLayer.parseModelResponse()`](../src/providers/provider-layer.js#L2210)；[`polishCurrentDraft()`](../src/discord-ai-translator.js#L12710) 中取得结果后调用 `composerWriter.replaceTextSafely()` 的分支。
- 内存观测：构造合法的 Chat Completions JSON，模型内容为 `@everyone @here Please take a look.`，解析结果会原样保留两个群体提及。
- 源码观测：润色结果可以写回草稿，相关写入路径没有将新增群体提及与原始草稿比较。
- 影响：原文没有这种可执行提及时，模型输出却可能把它加入草稿。用户随后发送或走确认发送流程时，可能产生非预期群体提及；是否真的通知成员取决于频道权限和 Discord 行为。本次没有发消息验证。
- 修复原则：在润色/公开双语的公共写入与发送边界比较源文和结果；对模型新增的群体提及采用明确策略，例如阻止写入、转成不可触发文本并提示、或要求单独明确确认。不要只依赖提示词，也不要无条件破坏原文中用户有意输入的提及。
- 需要覆盖：正常写回、晚到结果的“插入输入框”、恢复原文、公开双语、发送确认，以及真实 mention token。解析器允许返回文字本身不是唯一修复点，必须覆盖结果真正进入输入框的边界。
- 验收：源文无群体提及时结果不能静默引入可执行群体提及；原文有意输入的提及处理符合明确约定；任何发送动作仍遵守原有草稿与频道归属检查。
- 建议测试位置：`tests/core/composer.test.js`，必要时补 `tests/core/providers.test.js`；真机只在有授权的专用测试频道验收。

### M-02：取消自动翻译清空失败记录，可绕过冷却

- 状态：待修。建议优先级 P1，与 M-03 一起处理。
- 代码入口：[`cancelAutoTranslationRuntimeWork()`](../src/auto-translation/queue-core.js#L1061) 调用 `invalidateAutoTranslationQueue({ preserveNotices: true })`；同文件 [`invalidateAutoTranslationQueue()`](../src/auto-translation/queue-core.js#L85) 在没有 `preserveFailures` 时清空消息失败和服务商失败 Map。
- 内存观测：分别放入一条消息失败和一条服务商失败，并设置待重试 timer 后调用取消，两个 Map 的大小从 `1 / 1` 变成 `0 / 0`。
- 影响：进入不自动翻译的频道等取消路径会丢失失败冷却；返回原频道后可能重新请求刚失败的消息，绕过原本的等待。失败历史或通知去重与冷却记录并非同一份状态，不能把“通知还在”当成“冷却还在”。
- 修复原则：区分“停止当前工作”“更换服务/配置”“用户明确清理错误”。普通频道切换或暂停应取消无主请求并阻止晚到写入，同时保留仍然有效的消息/服务冷却。失效凭据修好后又必须能恢复，不要全局永久保留错误状态。
- 验收：在自动频道 A 产生失败 → 进入不自动翻译的 B → 返回 A，在冷却到期前不产生新的失败请求；冷却到期或修正凭据/服务后能恢复；停用插件仍释放 timer、请求和节点。
- 建议测试位置：`tests/core/queue.test.js`，结合 `tests/core/settings-data.test.js` 覆盖频道规则变化和服务配置失效策略。

### M-03：失败计数封顶，但没有总自动重试上限

- 状态：待修。建议优先级 P1；持续请求可能消耗服务额度或占用本地模型。
- 代码入口：[`getNextAutoTranslationFailureCount()` / `createAutoTranslationFailure()`](../src/auto-translation/queue-core.js#L2286)、[`getAutoTranslationRetryAfter()`](../src/auto-translation/queue-core.js#L2389)，以及 `markAutoTranslationFailure()` 内对非终止失败安排下一次扫描的逻辑。
- 内存观测：同一消息连续创建 8 次普通 401 失败并存回失败 Map，得到：

```text
count:        1, 2, 3, 4, 5, 5, 5, 5
retryAfterMs: 15000, 30000, 60000, 120000, 120000, 120000, 120000, 120000
terminal:     false, false, false, false, false, false, false, false
```

- 影响：计数最大值 5 只限制退避计算，没有自动把失败变为终止。重试达到约 120 秒的等待上限后，满足调度条件时仍可能继续尝试。这里不是说“所有错误从第一次就固定间隔重试”：错误类别、服务冷却及可见性等仍会影响真实调度。
- 修复原则：认证/配置/额度错误需要明确暂停与恢复条件；网络、5xx、限流等可恢复错误使用有总预算、遵守 `Retry-After` 的退避。区分单次请求内部重试、消息重试、服务探测，防止多层相乘；用户明确重试或改配置应可恢复。
- 验收：401/403、错误接口、额度不足在规定条件下停止；临时故障在预算内恢复；预算耗尽时有可操作提示；不会因频道切换绕过预算；主动取消仍不算失败；不同消息/服务互不误伤。
- 建议测试位置：`tests/core/queue.test.js`、`tests/core/providers.test.js`，用可控时间和计数器验证，避免为测试真的等待数分钟。

### 最小纯内存观测方法

下面代码应在仓库根目录使用 Node.js 22/24 执行，不会调用网络或发送消息。它用于演示当前缺陷，**不是应长期保持通过的产品行为测试**；修复后请用断言安全行为的回归测试替代，并更新本说明。

```javascript
const assert = require("node:assert/strict");
const Plugin = require("./src");

const mentions = new Plugin();
const output = mentions.parseModelResponse(JSON.stringify({
    choices: [{ message: { content: "@everyone @here Please take a look." } }]
}));
assert.equal(output, "@everyone @here Please take a look.");
console.log("M-01 parser result:", output);

const cancellation = new Plugin();
cancellation.autoTranslationFailures.set("handoff-message", { count: 1 });
cancellation.autoTranslationProviderFailures.set("handoff-provider", { type: "auth" });
cancellation.autoTranslationRetryTimer = setTimeout(() => {}, 60000);
try {
    cancellation.cancelAutoTranslationRuntimeWork("channel-policy-disabled");
    assert.equal(cancellation.autoTranslationFailures.size, 0);
    assert.equal(cancellation.autoTranslationProviderFailures.size, 0);
    console.log("M-02 failures after cancellation: 0 / 0");
} finally {
    clearTimeout(cancellation.autoTranslationRetryTimer);
}

const retry = new Plugin();
const failures = [];
for (let attempt = 0; attempt < 8; attempt++) {
    const error = Object.assign(new Error("HTTP 401"), { status: 401 });
    const failure = retry.createAutoTranslationFailure("handoff-message", error);
    retry.autoTranslationFailures.set("handoff-message", failure);
    failures.push(failure);
}
assert.deepEqual(failures.map(f => f.count), [1, 2, 3, 4, 5, 5, 5, 5]);
assert.deepEqual(failures.map(f => f.retryAfterMs), [15000, 30000, 60000, 120000, 120000, 120000, 120000, 120000]);
assert.ok(failures.every(f => !f.terminal));
console.table(failures.map(({ count, retryAfterMs, terminal }) => ({ count, retryAfterMs, terminal })));
```

此代码只直接验证解析结果、取消时的状态清理和失败记录生成；从这些结果到真实输入框写入/网络重试的调用关系还需结合上述源码审查。不要将它描述为完整宿主复现。

## 5. 更早审查记录：需要定向核实的线索

原本仅在本机的 [盲测计划](blind-test-plan.md) 已纳入本维护分支。它写于 2026-09-27，针对 `2fe3f0c`，属于测试组织者资料，含答案表；给测试者只提供不含答案的任务材料。外部测试页面和 `work/` 内离线副本不属于本次保证交付的仓库内容，失效时可从该计划重建。

以下线索来自那次记录，**本次没有逐项重新复现，不要直接写成已确认或已修复**：

| 线索 | 建议核实方向 |
| --- | --- |
| 晚到结果的“插入输入框”可能写入键盘切换后的其他频道 | 记录创建结果时的频道、composer、草稿版本；覆盖插入和恢复操作 |
| 快捷键可接受 Ctrl+K、Alt+方向键等冲突组合，AltGr 识别问题 | 录制与触发两处采用同一校验规则，验证中英文键盘布局 |
| Discord 主题切换后 AI 按钮仍保持旧颜色 | 观察真实主题变化，检查 token 与重绘，不只测模拟页面 |
| 恢复默认会改变服务和频道规则 | 对照 UI 承诺审查“保留凭据”和“保留行为”各自范围，避免意外翻译频道 |
| 降级后再次升级，旧“本频道启用”可能变成“总是翻译” | 使用 0.3 → 0.4 → 0.3 → 0.4 的真实数据 fixture 和主开关组合 |
| 确认发送的模拟回车可能被自动补全、斜杠命令接管 | 在专用测试频道验证草稿、频道归属和发送后结果，不靠事件发出即判成功 |
| 长草稿润色可能残留 `message.txt` 附件 | 用超过普通消息长度的草稿测试写入、附件区和回滚 |
| 非中英文界面的 AI 启动入口、上下文菜单兼容性 | 用当前 Discord / BetterDiscord 的实际 DOM、API 检查 |

其余条目、测试任务及分级见 [盲测计划第 7/8 节](blind-test-plan.md#7-answer-key-private-what-each-task-can-reveal)。这些工作应先于大规模状态机或 Discord 适配层重构，避免同时引入更多行为差异。

## 6. 本机安装与宿主缺口

2026-10-22 仅做文件只读检查，未修复或重启宿主：

| 对象 | 本次观测 |
| --- | --- |
| 仓库构建 | v0.4.0，1,782,270 字节，SHA256 `ed718cac…abd4570` |
| `%APPDATA%/BetterDiscord/plugins/DiscordAITranslator.plugin.js` | v0.4.0，1,765,243 字节，SHA256 `256a3dcae5427020e5057800622cd655476a04c7c2c5b6b0b1cd15f9e1b481fd`；对应较早 `df07a55` 构建，非当前产物 |
| 打包应用的 AppData 私有副本 | 发现与上述旧安装相同的副本；从不同环境启动 Discord 可能读到不同位置 |
| 当前 Discord Stable 安装 | `1.0.9262` 的 `discord_desktop_core/index.js` 不包含 BetterDiscord 加载钩子 |
| 运行时证明 | 没有观察当前 Discord 成功加载本分支；安装文件存在不等于已经被客户端加载 |

后续在普通 PowerShell 窗口修复/安装 BetterDiscord，安装选定构建并执行 `npm run plugin:check`。保存结果时记录实际运行的 Discord / BetterDiscord 版本、插件指纹和启动方式。不要只按插件版本号判断；打包应用私有目录重定向仍需排除。

数据首次迁移前，把 `DiscordAITranslator.config.json`、`DiscordAITranslator.cache.config.json`、`DiscordAITranslator.diagnostics.config.json` 备份到仓库外。不要提交这些数据文件或 API Key。

## 7. 验证记录与边界

- 历史 CI：代码提交 `2fe3f0c` 的 [Node 22 Windows 检查](https://github.com/MK6657/DiscordAITranslator/actions/runs/36231207802/job/108374583903) 和 [Node 24 Windows 检查](https://github.com/MK6657/DiscordAITranslator/actions/runs/36231207802/job/108374584023) 均于 2026-09-26 成功。
- 2026-10-22 本次核对：远端 SHA 与本机开发代码相同；`npm run build:check`、`npm run artifact:check` 通过；三个缺陷的纯内存观测符合第 4 节记录。
- 本次交接分支的本地 `npm run release:check` 已通过：源码检查、构建一致性、445 项核心测试、完整产物回归、隔离目录中的 Windows 安装/回滚测试、产物检查和发布内容守卫。三项缺陷仍未修复，既有测试没有阻止它们。GitHub 后续检查应核对其实际提交 SHA，不应拿旧提交的绿灯代替。
- **真实 Discord 验收仍未完成**：快捷面板、设置/搜索、重置、发送确认、快捷键、云服务错误、本地模型检测、试译、v0.3 升级迁移，详见 [九项宿主清单](host-smoke-test.md#v040-pending-acceptance-2026-09-26)。
- 此分支只完成集成与交接；CI 通过和问题观测成功都不能解释成三项缺陷已经修复。

## 8. 下一个维护者的操作顺序

1. 获取本维护分支并确认身份：

   ```powershell
   git fetch origin
   git switch --track origin/codex/maintenance-v0.4.0-2026-10-22
   git status --short --branch
   git log -4 --oneline
   npm ci
   npm run release:check
   ```

   已有本地同名分支时使用 `git switch codex/maintenance-v0.4.0-2026-10-22`，检查未提交内容后再 `git pull --ff-only`。不要强制重置工作区。

2. 为 M-01、M-02、M-03 和高影响审查线索建单、分配负责人。修复时先写失败回归用例，再改源码；每项提交写明影响和恢复条件。
3. 运行相关模块测试，再执行完整 `npm run release:check`；源码改变后先 `npm run build`，保持产物与源码一致。
4. 修复测试宿主、确认安装指纹，在受控频道执行九项宿主验收和问题的定向验证。结果追加到 `docs/host-smoke-test.md`，逐项记录实际结果，不能用模拟页面代替。
5. 提交修复后，更新本文的问题状态、证据、产物指纹和剩余任务。选择从本维护分支发起后续 PR，或让原 PR #3 采用相同修复；避免将两个包含同一 v0.4.0 的 PR 当作两份独立功能重复评估。
6. 真机验证和高影响问题处理完成后再决定主分支合并与 Release。P2 内存缓存、分项数据清理、统计，以及 P3 状态机和 Discord 适配层是后续工作，未在本次完成。

## 9. English summary

This maintenance branch merges the complete v0.4.0 preview history into a branch based on v0.3.0 main, then adds the handoff documents. Runtime source and the plugin artifact remain identical to `2fe3f0c`. The original PR #3 has passing Windows Node 22/24 CI but no live Discord acceptance.

Three issues remain open and were independently checked with source review and network-free, in-memory calls: model output can add mass mentions; runtime cancellation clears message/provider failure cooldown maps; repeated failures cap the counter but do not terminate automatic retries. The checks do not constitute end-to-end host reproduction. Additional September review leads require revalidation; see section 5 and the organizer-only blind test plan.

The installed v0.4.0 file is an older build, and the current Discord Stable startup file lacks the BetterDiscord hook. Fix the host, confirm the installed SHA256, address the issues, and complete the nine host acceptance scenarios before treating this preview as release-ready. Keep all credentials and personal test data outside Git.
