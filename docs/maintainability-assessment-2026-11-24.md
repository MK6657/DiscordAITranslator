# 长期可维护性与架构健康度评估（2026-11-24）

> **性质**：纯现状评估与架构诊断文档（未修改任何源码、测试或构建产物）。
> **评估基线**：分支 `main`，提交 `7709faa`（`v0.4.0` 预览版），基于源码静态统计与模块结构实查，不依赖过往文档推测。

---

## 一、总体结论与健康度评分卡

**直接回答核心问题：从长期可维护性来说，现在的插件可以了吗？**

- **作为“当前可用、质量防线扎实”的 `v0.4.0` 产品**：**合格且高于绝大多数 BetterDiscord 插件**。项目拥有罕见完备的测试体系、发布门禁、安全边界与安装回滚机制。
- **作为“未来 1–2 年持续新增大功能、多人/多 Agent 协同演进”的长期底座**：**还不够，目前正处在“再继续堆功能就会明显变难改、变容易改坏”的结构性拐点上**。

简言之：**外围工程防线是“专业级”的，但内部核心架构仍停留在“物理分文件、逻辑未解耦的巨型中心类（God Object）”过渡态**。

### 多维度评分卡（满分 10 分）

| 评估维度 | 评分 | 一句话诊断 |
| --- | :---: | --- |
| **工程防线与发布质量**（测试、CI、安装器、安全门禁） | **8.5** | 698+ 核心测试、1.4 万行回归、双版本 Windows CI、AppData 重定向拦截，属于项目最大资产 |
| **宿主抗脆弱性与真机验证闭环** | **5.5** | 已抽出 `src/discord/` 雏形与宿主健康卡片，但 DOM/Slate 依赖仍散落主文件且缺真机验收闭环 |
| **新功能扩展难易度**（横向加功能） | **5.0** | 加 Prompt 预设很容易；加新服务商需改 7 个文件 158 处分支；改自动翻译调度高风险 |
| **UI 层与样式可维护性** | **4.5** | 200+ 处裸 `createElement` 手工同步状态 + 5,100 行字符串 CSS，是近期主文件重新膨胀的头号原因 |
| **静态保障与开发体验** | **4.5** | 无 TypeScript / JSDoc 类型检查、无 ESLint，4.5 万行 JS 全靠人肉记忆与单测排错 |
| **模块边界与封装度** | **4.0** | 已拆出多个子文件，但 3,540+ 次 `this.plugin.*` 反向引用使所有模块仍强绑在主类上 |
| **状态管理与并发复杂度** | **4.0** | 主类构造函数平铺 183 个实例字段、44 个 Map/Set/WeakMap、14+ 套自动翻译并行集合 |

---

## 二、代码库量化体检数据（2026-11-24 实测）

### 2.1 规模分布

| 区域 | 文件数 | 总行数 | 关键观察 |
| --- | :---: | :---: | --- |
| `src/` 全部源码 | 39 | **45,732** | 代码规模已达到中型前端应用量级 |
| `src/discord-ai-translator.js`（主文件） | 1 | **20,495** | 占 `src/` 总行数 **44.8%**，含 3 个类、主类 **1,529 个方法** |
| `src/css/*.js`（CSS-in-JS） | 8 | **5,100** | 全部以 JS 模板字符串硬编码 |
| `src/constants.js` + `src/i18n.js` | 2 | **3,562** | `constants.js` 达 2,036 行（含 59 套大段 Prompt）；i18n 中英各 **745 键零缺失** |
| `tests/core/*.test.js` | 51 | **24,950** | 模块聚焦测试覆盖度高、颗粒度好 |
| `scripts/verify-plugin.js` | 1 | **14,029** | 单文件巨型产物回归脚本（强白盒依赖主类内部方法） |
| `DiscordAITranslator.plugin.js`（产物） | 1 | — | **2.20 MB**（2,199,534 字节，未压缩） |

### 2.2 最值得警惕的趋势：主文件“瘦身后又反弹”

```text
2026-07 基线            主文件 ~23,900 行（1,160 方法）
   │  完成 Phase 0.5 ~ 6 预拆（抽离样式/i18n/设置存储/Provider/缓存/校验/诊断/队列/管线）
   ▼
2026-09 (v0.3.0 后)     主文件 ~13,900 行（一度瘦身 10,000 行）
   │  叠加 v0.4.0 新功能（6 标签设置页、搜索、分裂式润色菜单、结果面板、性能优化）
   ▼
2026-11 (当前 v0.4.0)   主文件 20,495 行（1,529 方法 = 994 真实实现 + 535 外观代理）
```

**结论很直白**：前面辛辛苦苦拆出去了 1.4 万行后端逻辑，但因为 **设置 UI、输入框润色 UI、Discord DOM 渲染/监听** 三大块还留在主文件里，仅仅做了一轮 `v0.4.0` 功能迭代，主文件又涨回了 **2 万行以上**。如果不解决 UI 与宿主层归属问题，下一个大版本主文件就会冲向 2.5–3 万行。

### 2.3 已拆出模块的反向耦合度（`this.plugin.*` 引用统计）

| 模块文件 | 行数 | `this.plugin.*` 调用次数 | 触及不同属性/方法数 | 封装评价 |
| --- | :---: | :---: | :---: | --- |
| `src/auto-translation/queue-core.js` | 2,683 | **931** | **260** | 强耦合（仅物理搬移） |
| `src/auto-translation/request-pipeline.js` | 2,982 | **742** | **259** | 强耦合（仅物理搬移） |
| `src/providers/provider-layer.js` | 2,722 | **603** | **190** | 强耦合（大量共享字段） |
| `src/settings/settings-store.js` | 1,374 | **485** | **97** | 中高耦合 |
| `src/cache/translation-cache-store.js` | 1,415 | **328** | **85** | 中高耦合 |
| `src/diagnostics/diagnostics-recorder.js` | 627 | **207** | **70** | 中高耦合 |
| `src/validation/output-guard.js` | 549 | **84** | **44** | 中度耦合 |
| `src/quick-panel/quick-panel.js` | 1,983 | **108** | **32** | **较干净（正面示范）** |
| `src/discord/context-menu.js` | 270 | **41** | **29** | 较干净 |
| `src/discord/host-adapter.js` | 75 | **1** | **1** | **非常干净（正面示范）** |
| `src/discord/{selectors,stores,host-health}.js` | 446 | **0** | **0** | **纯独立模块（正面示范）** |

---

## 三、六个维度的深度架构剖析

### 视角 1：架构与耦合——“物理分文件”成功了，“逻辑解耦”尚未完成

在 2026 年 7 月制定拆分路线（[refactor-direction-2026-07-26.md](refactor-direction-2026-07-26.md)）时，项目确立了「外观代理纪律」：把逻辑搬到子模块，但在 `DiscordAITranslator` 上保留一行转发方法，且子模块之间不直接通信，必须通过 `this.plugin.xxx` 绕回主类。

- **历史价值**：这是一个非常务实的过渡策略，它让你在不破坏 1.4 万行回归测试的前提下，先把代码从单文件物理拆开。
- **长期副作用**：当过渡态变成常态时，架构退化成了**“分布式巨石（Distributed Monolith）”**：
  1. **没有真正的状态私有化**：缓存、队列、失败表、服务商健康度、定时器全部挂在 `this.plugin` 这块公共黑板上，任何模块都能直接读写其他模块的内部字段。
  2. **主类 API 表面无限膨胀**：`DiscordAITranslator` 目前有 **1,529 个方法**（其中 **535 个**是 1 行转发方法，分布在 9,387–20,488 行），IDE 跳转、全局搜索和认知成本都被严重拉高。
  3. **难以独立复用或单独测试子模块**：想单测 `AutoTranslationQueueCore` 或 `ProviderLayer`，往往还是要实例化一个完整的 `new Plugin()` 或伪造几十个 `plugin` 属性。

**好消息**：后期新写的 `src/quick-panel/quick-panel.js`（1,983 行仅触及 32 个 `this.plugin` 成员）和 `src/discord/` 目录（几乎零反向依赖）证明团队完全有能力写出边界清晰的模块。

---

### 视角 2：功能扩展性——“以后加功能容不容易？”

是否容易加功能，不能一概而论，取决于你要加哪一类功能：

| 要加的新功能类型 | 难易度 | 真实改动面与原因分析 |
| --- | :---: | --- |
| **加新润色/翻译 Prompt 预设**（如新方言、新名人风格） | ✅ **很容易** | 数据驱动；只需改 `src/constants.js` + `src/i18n.js`，分类菜单和设置页会自动渲染 |
| **加简单显示开关 / 小配置项** | 🟡 **中等** | 需同步改 `DEFAULT_SETTINGS`、`settings-store.js` 清洗/迁移、设置页 DOM、快捷面板（如需）、`i18n.js`、恢复默认与脱敏快照，容易漏一处 |
| **加一个新的 AI / 翻译服务商**（如 Claude、Gemini、火山、腾讯翻译） | 🟠 **较麻烦、易漏改** | **缺少统一的 `ProviderAdapter` 插件契约**。当前 7 家服务商的硬编码分支散落在 **7 个文件、158 处**（`provider-layer.js` 57 处、`discord-ai-translator.js` 50 处、`constants.js` 34 处、`translation-cache-store.js` 11 处、`i18n.js` 4 处、`quick-panel.js` 1 处、`settings-schema.js` 1 处）。每加一家都要手改默认值、能力表、设置表单、凭据保留规则、请求构造、响应解析、错误码映射和缓存键 |
| **新增大型交互界面 / 重排设置页**（如设置导入导出、提示词市场、多模态预览） | 🟠 **较吃力** | 设置页（~5,000 行）和输入框弹窗（~2,500 行）全在主文件内用裸 `document.createElement` 拼装，状态同步全靠手写 `refresh*()`，极易出现双处控件不同步或焦点/主题回归 |
| **改动自动翻译调度 / 并发 / 重试策略** | 🔴 **高风险** | 涉及 14+ 个并行集合在 `queue-core.js`、`request-pipeline.js`、`discord-ai-translator.js` 三处交叉读写，极易破坏状态不变量或引入竞态与内存泄漏 |
| **适配 Discord 重大 DOM / Slate 编辑器改版** | 🔴 **中高风险** | 虽然已有 `src/discord/selectors.js` 和 `stores.js`，但主文件中仍残存大量直接 DOM 操作、`querySelector`（31 处）和 Slate 写入技巧 |

---

### 视角 3：状态管理与生命周期复杂度——隐性 Bug 的温床

实查 `src/discord-ai-translator.js` 的 `constructor()`（L923–L1119）：

1. **183 个实例属性平铺在同一对象上**，甚至出现了 **`this.autoTranslationRenderDueAt = 0;` 在 L1028 与 L1084 重复初始化两次** 这种典型的超长构造函数症状。
2. **自动翻译状态分裂成 14+ 套并行数据结构**：
   - 队列：`autoTranslationQueue` + `autoTranslationQueuedKeys` + `autoTranslationPendingTargets`
   - 在途：`autoTranslationInFlight` + `autoTranslationInFlightKeys` + `autoTranslationVisibleLongInFlightKeys` + `autoTranslationInFlightStartedAt` + `autoTranslationInFlightTokens` + `autoTranslationInFlightItems` + `autoTranslationPrefetchInFlight`
   - 渲染：`autoTranslationRenderQueue` + `autoTranslationRenderQueuedKeys` + `autoTranslationRenderQueuedTasks` + `autoTranslationRenderPendingKeys`
   - 失败与跳过：`autoTranslationFailures` + `autoTranslationFailureHistory` + `autoTranslationProviderFailures` + `autoTranslationPrecheckSkips` + `autoTranslationRecentRenders` + `dismissedTranslationMessages`
   - 目前只能靠 `AutoTranslationTaskState.checkInvariants()`（I1–I5 五条人工不变量）在测试里事后检查它们没有脱节，而不是在数据结构层面保证“不可能脱节”。
3. **生命周期清理压力巨大**：`stop()` 方法长达 **159 行**，需要手工逐一清理几十个 `Timer` / `RAF` / `IdleCallback` / `AbortController` / DOM 浮层 / 事件监听。以后每新增一个异步定时器或窗口事件，只要 `stop()` 忘清一行，插件禁用/重载后就会留下幽灵回调或内存泄漏。
4. **注**：2026-10-22 交接文档中提到的三项高优缺陷（M-01 群体提及注入、M-02 取消清空冷却、M-03 无总重试上限）在当前 `main` 源码中均已能看到对应防护实现（`output-guard` 提及校验、`preserveFailures`、`AUTO_TRANSLATE_MAX_RETRY_ATTEMPTS`），但历史文档中部分过时描述尚未同步清理，容易误导新接手者。

---

### 视角 4：UI 层与样式层——为什么主文件怎么拆都还会变胖？

当前 `src/discord-ai-translator.js` 剩下的 20,495 行里，最大头不再是算法或网络，而是 **UI 与 DOM 胶水代码**：

- **完整设置窗口（~5,000+ 行）**：含长达 **301 行** 的 `createPromptManager`、156 行的 `openQuickSettingsPanel`、104 行的 `createTaskProviderSettingsBlock` 等。
- **输入框润色与双语交互（~2,500+ 行）**：含 `publicBilingualCurrentDraft`（214 行）、`polishCurrentDraft`（187 行）、`renderPolishPresetMenuContent`（174 行）、`openPolishPresetMenu`（167 行）、`showPolishResultPanel`（157 行）、`openInputActionMenu`（104 行）。
- **消息 DOM 扫描、提取与译文行渲染（~6,500+ 行）**：含 `MessageTracker`、`TranslationScheduler`、Observer、`translateMessage`（207 行）、`renderAutoTranslationResult`（147 行）、`scanDiscordUi`（120 行）等。
- **裸 DOM 手工同步税**：主文件有 **202 处 `document.createElement`**，没有统一的轻量状态订阅机制（比如 `store.subscribe(key, fn)`），导致同一项设置在“完整设置页”、“快捷面板”和“输入框按钮”之间需要手写大量 `refresh*()`、`sync*()` 同步调用。
- **5,100 行 CSS-in-JS**：虽然按序号拆了 `src/css/01..08`，可读性比以前好，但本质仍是 JS 字符串，缺少 CSS 语法校验、未使用选择器检测与变量引用检查。

---

### 视角 5：测试、构建与静态检查——最强护城河与隐藏的“测试债”

#### 显著优势（必须守住）
- **自动化测试覆盖极厚**：51 个核心模块测试（24,950 行）+ 14,029 行产物级回归，且覆盖了真实 loopback HTTP 防重定向、缓存迁移兼容、PowerShell 安装回滚、README 发布资产一致性等高价值场景。
- **中英文 i18n 严格对齐**：745 vs 745 键，零遗漏。
- **发布工程严谨**：`esbuild` 确定性构建、`build:check` 防产物漂移、`release-check.js` 敏感信息/许可证/浏览器 Profile/快照一致性门禁、Windows Node 22/24 双 CI 绿灯。

#### 隐藏的工程债
1. **白盒巨石测试反锁架构**：`scripts/verify-plugin.js` 单文件 **14,029 行**，直接桩替换并调用主类上数百个内部方法。这形成了一种“锁定效应”——**你不敢删掉那 535 个外观转发方法，因为一删测试就大面积红掉**。
2. **零静态类型检查与零 Lint**：`scripts/check-source.js` 只跑 `node --check`（语法解析）和版本号核对。没有 TypeScript / JSDoc `checkJs`、没有 ESLint（无未使用变量/不可达代码/重复赋值/无效属性访问检查）。在 4.5 万行动态 JS 里，拼错一个 `this.plugin.xxx` 或改了一个配置对象字段名，只能指望测试刚好走到那一行。
3. **产物单文件持续膨胀**：`DiscordAITranslator.plugin.js` 已达 **2.20 MB**（含 59 套大段中文 Prompt 文本 + 5,100 行未压缩 CSS + 4.5 万行未压缩 JS）。虽然本地磁盘加载依然很快，但 Git diff 噪音极大（每次小改动产物都跳几百上千行），且 `constants.js` 已被 900+ 行纯文本 Prompt 撑到 2,036 行。

---

### 视角 6：宿主生态与长期演进风险

- **Discord 上游变更风险**：BetterDiscord 插件天然寄生于 Discord 网页端 DOM、内部 Webpack Store 和 Slate 富文本编辑器。目前虽然有 `src/discord/host-health.js` 提供健康检查，但只有把所有 DOM/Store 触点彻底收拢进 `src/discord/` 适配层，才能在 Discord 改版时做到“只修一个目录即可恢复”。
- **离线验证 vs. 真机验收的剪刀差**：目前绝大部分测试运行在 Node + Mock DOM 上。真实 Electron/Discord 环境里的输入法 IME、Slate 选区撤销栈、滚动锚定、Discord 主题切换与真实云服务商报错，仍缺乏标准化的真机冒烟脚本或轻量验收检查表闭环。
- **桌面端之外与凭据存储边界**：仅面向 Windows BetterDiscord，且受限于 BetterDiscord `BdApi.Data` 明文落盘机制（无系统凭据保险库）。

---

## 四、按 ROI 排序的渐进式演进路线（不推倒重来）

> **核心原则**：**绝对不要停下来“推倒重写”（例如整体迁移到 React + TypeScript 重写）**。那样会立刻摧毁项目最值钱的 3.9 万行回归测试护城河，且极易引入大量未知宿主回归。正确做法是在全套测试绿灯保护下，按投资回报率（ROI）分阶段演进。

### 阶段 P0：低成本加护栏（预计 1–2 天，几乎零风险）
先把“防止继续变糟”的机械护栏立起来：
1. **引入静态 Lint + 渐进式类型检查**：引入轻量的 ESLint 基础规则（捕捉重复属性赋值、未定义变量、死代码等）与 JSDoc `checkJs`（先从新模块 `src/discord/`、`src/quick-panel/` 开启，不强求一次性标注旧代码）。
2. **自动化 i18n 审计**：在 `tests/core/` 中补一条测试，校验 `zh-CN` / `en` 键完全对称，并检测代码里引用了不存在的 `t("...")` 键。
3. **引入统一资源释放器（`DisposableScope`）**：用统一注册表管理定时器、RAF、IdleCallback、DOM 监听器与 `AbortController`，让新功能自动接入 `stop()` 清理，不再手工往 159 行的 `stop()` 里堆代码。

### 阶段 P1：止血瘦身——把“膨胀最快的三块”移出主文件（最高 ROI）
先把 `src/discord-ai-translator.js` 从 20,495 行砍到 ~10,000 行以内，阻止新功能继续往主文件里堆：
1. **拆分内置预设数据**：把 59 套润色预设与 6 套翻译预设从 `src/constants.js` 移至 `src/presets/`（如 `polish-general.js`、`polish-dialects.js`、`polish-personas.js`、`translation-presets.js`），让 `constants.js` 回归纯配置常量。
2. **抽离完整设置窗口 UI → `src/settings/settings-panel.js`（及子 tab 模块）**：参照 `src/quick-panel/quick-panel.js` 的设计，把 ~5,000 行设置页、搜索框、Prompt 管理器和确认对话框搬出主文件。
3. **抽离输入框工具与润色菜单 UI → `src/composer/composer-ui.js`**：把分裂式润色按钮、分类语气选择器、公开双语交互与晚到结果面板搬出主文件。
4. **补充轻量配置变更订阅（Event/Signal）**：让设置页、快捷面板与输入框按钮订阅设置变更事件，逐步淘汰散落各处的 `refresh*Controls()` 手工连环调用。

### 阶段 P2：真正提升“加新功能”的爽度（核心架构升级）
完成这一阶段后，横向扩展新能力会从“改 7 个文件”变成“加 1 个文件”：
1. **服务商插件化（`ProviderAdapter` 注册表）**：
   - 定义统一接口：`{ id, label, capabilities, defaultProfile, fields, buildRequest, parseResponse, classifyError, buildCacheScope }`。
   - 7 家服务商各自独立成 `src/providers/adapters/<name>.js`。
   - **收益**：以后接入 Claude、Gemini、腾讯翻译、火山翻译等，只需新增 1 个 adapter 文件 + 注册 1 行，不再散改 7 个文件 158 处分支。
2. **完成 Phase 6 正式版：自动翻译单一状态机**：
   - 将 14+ 套并行 Map/Set/Array 收敛到单一 `Map<cacheKey, AutoTranslationTask>`（明确状态流转：`queued -> inFlight -> renderQueued -> done | failed | skipped`），彻底消灭“集合不同步”类 Bug。
3. **完成 Phase 7：收口 `src/discord/` 宿主适配层**：
   - 把 `MessageTracker`、MutationObserver、译文行 DOM 挂载与 Slate 写入彻底封装到 `src/discord/` 后，Discord 改版时的修复半径将缩小 80%。

### 阶段 P3：长期减债（细水长流）
1. **逐步解耦白盒测试与退休外观层**：新建测试只测模块公开接口或黑盒行为，不再新增对主类私有方法的桩替换；待某个子系统的旧回归迁移到 `tests/core/` 后，成批删除对应的 1 行外观转发方法。
2. **清理与拆分 `scripts/verify-plugin.js`**：按领域把 14,029 行巨型测试脚本逐步拆成独立测试文件，提升单次定位失败和并行跑测的速度。
3. **评估产物体积控制**：如果未来继续增加大量预设或 UI，可考虑在 `scripts/build-plugin.js` 中对静态 CSS 做空白压缩或拆分可选预设包，避免 `.plugin.js` 无限逼近 3–5 MB。

---

## 五、给你的决策参考：现在该不该动架构？

架构没有“绝对及格线”，取决于你接下来半年的产品计划：

| 你的后续计划 | 建议策略 |
| --- | --- |
| **路线 A：进入稳定维护期**（只做真机验收、修 Bug、偶尔加几套 Prompt 预设、跟进 Discord 兼容） | **当前架构已经够用，无需大重构。** 优先完成 `v0.4.0` 真机验收并发布正式版，顺手做 **P0**（Lint + i18n 检查 + 资源释放器）即可。 |
| **路线 B：持续做大功能**（接入更多大模型/翻译服务商、增加配置导入导出、更多写作/聊天增强功能、长期迭代 v0.5/v1.0） | **建议先做 P1 + P2（服务商插件化），再堆大功能。** 否则每多加两三个大功能，主文件就会逼近 2.5–3 万行，改一处坏两处的维护税会指数级上升。 |
| **路线 C：引入多人协作或高频多 Agent 并行开发** | **强烈建议先做 P1（拆 UI + 拆预设）**，把 `discord-ai-translator.js` 拆开，否则多人/多 Agent 同时改同一个 2 万行文件必然频繁冲突。 |
