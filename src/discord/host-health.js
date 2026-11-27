"use strict";

// Live read-only Discord + BetterDiscord host health check.
// Lets maintainers and users see immediately which Discord anchor broke after a client update.

const { PLUGIN_VERSION } = require("../version");
const { normalizeUiLocale } = require("../i18n");

const HOST_HEALTH_DETAILS = Object.freeze({
    "zh-CN": Object.freeze({
        bdApiMissing: ({ items }) => `缺少：${items}`,
        bdApiUnavailable: () => "BdApi 不可用",
        chatRootFound: ({ tag, bound }) => `<${tag}>（${bound ? "观察器已绑定" : "观察器空闲"}）`,
        chatRootSettings: () => "当前处于 Discord 设置页（返回聊天频道可检测实时 DOM）",
        chatRootMissing: () => "当前视图未挂载聊天容器",
        messagesFound: ({ count, sample, total }) => `已挂载 ${count} 条消息（抽样可读 ${sample}/${total}）`,
        hiddenBehindSettings: () => "已被 Discord 设置层遮挡",
        messagesEmpty: () => "当前视图没有已挂载的聊天消息",
        composerReady: () => "输入框与工具栏锚点就绪",
        composerNoToolbar: () => "已找到输入框，缺少工具栏锚点",
        composerMissing: () => "当前视图没有可编辑输入框",
        disabledInSettings: () => "已在设置中关闭",
        userPanelReady: () => "AI 快捷入口已挂载到用户栏",
        userPanelSettings: () => "Discord 设置层已打开（用户栏暂时隐藏）",
        userPanelUnmounted: () => "已找到设置齿轮，AI 快捷入口未挂载",
        userPanelMissing: () => "未找到左下角用户栏设置锚点",
        contextMenuActive: ({ count }) => `${count} 个菜单补丁已生效`,
        contextMenuMissing: () => "未注册右键菜单补丁",
        themeDetail: ({ discordTheme, resolvedPanelTheme }) => `Discord：${discordTheme} → 面板：${resolvedPanelTheme}`
    }),
    "zh-TW": Object.freeze({
        bdApiMissing: ({ items }) => `缺少：${items}`,
        bdApiUnavailable: () => "BdApi 無法使用",
        chatRootFound: ({ tag, bound }) => `<${tag}>（${bound ? "觀察器已綁定" : "觀察器閒置"}）`,
        chatRootSettings: () => "目前處於 Discord 設定頁（返回聊天頻道可檢測即時 DOM）",
        chatRootMissing: () => "目前檢視未掛載聊天容器",
        messagesFound: ({ count, sample, total }) => `已掛載 ${count} 則訊息（抽樣可讀 ${sample}/${total}）`,
        hiddenBehindSettings: () => "已被 Discord 設定層遮擋",
        messagesEmpty: () => "目前檢視沒有已掛載的聊天訊息",
        composerReady: () => "輸入框與工具列錨點就緒",
        composerNoToolbar: () => "已找到輸入框，缺少工具列錨點",
        composerMissing: () => "目前檢視沒有可編輯輸入框",
        disabledInSettings: () => "已在設定中關閉",
        userPanelReady: () => "AI 快捷入口已掛載至使用者列",
        userPanelSettings: () => "Discord 設定層已開啟（使用者列暫時隱藏）",
        userPanelUnmounted: () => "已找到設定齒輪，AI 快捷入口未掛載",
        userPanelMissing: () => "找不到左下角使用者列設定錨點",
        contextMenuActive: ({ count }) => `${count} 個選單修補已生效`,
        contextMenuMissing: () => "尚未註冊右鍵選單修補",
        themeDetail: ({ discordTheme, resolvedPanelTheme }) => `Discord：${discordTheme} → 面板：${resolvedPanelTheme}`
    }),
    en: Object.freeze({
        bdApiMissing: ({ items }) => `Missing: ${items}`,
        bdApiUnavailable: () => "BdApi unavailable",
        chatRootFound: ({ tag, bound }) => `<${tag}> (${bound ? "observer bound" : "observer idle"})`,
        chatRootSettings: () => "Discord settings view active (return to a chat channel to inspect live DOM)",
        chatRootMissing: () => "Chat container not mounted on current view",
        messagesFound: ({ count, sample, total }) => `${count} nodes (${sample}/${total} readable)`,
        hiddenBehindSettings: () => "Hidden behind Discord settings overlay",
        messagesEmpty: () => "No chat messages mounted in current view",
        composerReady: () => "Textbox + toolbar anchor ready",
        composerNoToolbar: () => "Textbox found, toolbar anchor missing",
        composerMissing: () => "No editable composer on current view",
        disabledInSettings: () => "Disabled in settings",
        userPanelReady: () => "AI launcher mounted in user panel",
        userPanelSettings: () => "Discord settings overlay open (user panel hidden)",
        userPanelUnmounted: () => "Settings button found, AI launcher not mounted",
        userPanelMissing: () => "User panel settings anchor not found",
        contextMenuActive: ({ count }) => `${count} menu patch(es) active`,
        contextMenuMissing: () => "No context menu patches registered",
        themeDetail: ({ discordTheme, resolvedPanelTheme }) => `Discord: ${discordTheme} → Panel: ${resolvedPanelTheme}`
    }),
    ru: Object.freeze({
        bdApiMissing: ({ items }) => `Отсутствует: ${items}`,
        bdApiUnavailable: () => "BdApi недоступен",
        chatRootFound: ({ tag, bound }) => `<${tag}> (${bound ? "наблюдатель привязан" : "наблюдатель ожидает"})`,
        chatRootSettings: () => "Открыты настройки Discord (вернитесь в чат для проверки DOM)",
        chatRootMissing: () => "Контейнер чата не смонтирован в текущем виде",
        messagesFound: ({ count, sample, total }) => `Узлов: ${count} (читаемо ${sample}/${total})`,
        hiddenBehindSettings: () => "Скрыто за окном настроек Discord",
        messagesEmpty: () => "В текущем виде нет сообщений чата",
        composerReady: () => "Поле ввода и панель инструментов готовы",
        composerNoToolbar: () => "Поле ввода найдено, якорь панели отсутствует",
        composerMissing: () => "Нет доступного поля ввода в текущем виде",
        disabledInSettings: () => "Отключено в настройках",
        userPanelReady: () => "Кнопка AI установлена в панели пользователя",
        userPanelSettings: () => "Открыты настройки Discord (панель пользователя скрыта)",
        userPanelUnmounted: () => "Кнопка настроек найдена, кнопка AI не установлена",
        userPanelMissing: () => "Якорь настроек панели пользователя не найден",
        contextMenuActive: ({ count }) => `Активно патчей меню: ${count}`,
        contextMenuMissing: () => "Патчи контекстного меню не зарегистрированы",
        themeDetail: ({ discordTheme, resolvedPanelTheme }) => `Discord: ${discordTheme} → Панель: ${resolvedPanelTheme}`
    }),
    ar: Object.freeze({
        bdApiMissing: ({ items }) => `مفقود: \u2066${items}\u2069`,
        bdApiUnavailable: () => "BdApi غير متاح",
        chatRootFound: ({ tag, bound }) => `${bound ? "المراقب مرتبط" : "المراقب خامل"} (\u2066<${tag}>\u2069)`,
        chatRootSettings: () => "عرض إعدادات Discord نشط (عُد إلى قناة دردشة لفحص DOM المباشر)",
        chatRootMissing: () => "حاوية الدردشة غير مثبتة في العرض الحالي",
        messagesFound: ({ count, sample, total }) => `العقد: ${count} (قابل للقراءة \u2066${sample}/${total}\u2069)`,
        hiddenBehindSettings: () => "مخفي خلف طبقة إعدادات Discord",
        messagesEmpty: () => "لا توجد رسائل دردشة مثبتة في العرض الحالي",
        composerReady: () => "مربع النص ومرساة شريط الأدوات جاهزان",
        composerNoToolbar: () => "تم العثور على مربع النص، مرساة شريط الأدوات مفقودة",
        composerMissing: () => "لا يوجد مربع إدخال قابل للتحرير في العرض الحالي",
        disabledInSettings: () => "معطّل في الإعدادات",
        userPanelReady: () => "تم تثبيت مشغّل AI في لوحة المستخدم",
        userPanelSettings: () => "طبقة إعدادات Discord مفتوحة (لوحة المستخدم مخفية)",
        userPanelUnmounted: () => "تم العثور على زر الإعدادات، مشغّل AI غير مثبت",
        userPanelMissing: () => "لم يتم العثور على مرساة إعدادات لوحة المستخدم",
        contextMenuActive: ({ count }) => `تعديلات القائمة النشطة: ${count}`,
        contextMenuMissing: () => "لا توجد تعديلات مسجلة لقائمة النقر الأيمن",
        themeDetail: ({ discordTheme, resolvedPanelTheme }) => `سمة Discord: \u2066${discordTheme}\u2069 ← اللوحة: \u2066${resolvedPanelTheme}\u2069`
    }),
    es: Object.freeze({
        bdApiMissing: ({ items }) => `Falta: ${items}`,
        bdApiUnavailable: () => "BdApi no disponible",
        chatRootFound: ({ tag, bound }) => `<${tag}> (${bound ? "observador vinculado" : "observador inactivo"})`,
        chatRootSettings: () => "Vista de ajustes de Discord activa (vuelve a un canal para inspeccionar el DOM)",
        chatRootMissing: () => "Contenedor de chat no montado en la vista actual",
        messagesFound: ({ count, sample, total }) => `${count} nodos (${sample}/${total} legibles)`,
        hiddenBehindSettings: () => "Oculto tras la capa de ajustes de Discord",
        messagesEmpty: () => "No hay mensajes montados en la vista actual",
        composerReady: () => "Cuadro de texto y barra de herramientas listos",
        composerNoToolbar: () => "Cuadro de texto encontrado, falta anclaje de barra",
        composerMissing: () => "No hay cuadro de texto editable en la vista actual",
        disabledInSettings: () => "Desactivado en ajustes",
        userPanelReady: () => "Botón AI montado en el panel de usuario",
        userPanelSettings: () => "Ajustes de Discord abiertos (panel de usuario oculto)",
        userPanelUnmounted: () => "Botón de ajustes encontrado, botón AI no montado",
        userPanelMissing: () => "No se encontró el anclaje del panel de usuario",
        contextMenuActive: ({ count }) => `${count} parche(s) de menú activos`,
        contextMenuMissing: () => "No hay parches de menú contextual registrados",
        themeDetail: ({ discordTheme, resolvedPanelTheme }) => `Discord: ${discordTheme} → Panel: ${resolvedPanelTheme}`
    })
});

function runHostHealthCheck(plugin) {
    const locale = normalizeUiLocale(plugin?.getLocale?.() || plugin?.settings?.ui?.language, "zh-CN");
    const strings = HOST_HEALTH_DETAILS[locale] || HOST_HEALTH_DETAILS.en;
    const checks = [];
    const add = (id, labelKey, status, detail, meta = {}) => {
        checks.push({ id, labelKey, status, detail, meta });
    };

    const bdApi = globalThis.BdApi || null;
    const bdCaps = {
        Data: Boolean(bdApi?.Data?.load && bdApi?.Data?.save),
        DOM: Boolean(bdApi?.DOM?.addStyle && bdApi?.DOM?.removeStyle),
        UI: Boolean(bdApi?.UI?.showToast),
        Webpack: Boolean(bdApi?.Webpack?.getStore || bdApi?.Webpack?.getByKeys),
        ContextMenu: Boolean(bdApi?.ContextMenu?.patch && bdApi?.ContextMenu?.buildMenuChildren)
    };
    const missingBd = Object.entries(bdCaps).filter(([, ok]) => !ok).map(([name]) => name);
    add(
        "bdApi",
        "hostHealthItemBdApi",
        missingBd.length === 0 ? "ok" : bdApi ? "warn" : "error",
        missingBd.length === 0
            ? "Data / DOM / UI / Webpack / ContextMenu"
            : bdApi ? strings.bdApiMissing({ items: missingBd.join(", ") }) : strings.bdApiUnavailable(),
        bdCaps
    );

    const storeHealth = {
        messageStore: Boolean(plugin.getDiscordMessageStore?.()),
        channelStore: Boolean(plugin.getDiscordNamedStore?.("ChannelStore") || plugin.getDiscordNamedStore?.("SelectedChannelStore")),
        guildRoleStore: Boolean(plugin.getDiscordNamedStore?.("GuildRoleStore") || plugin.getDiscordNamedStore?.("GuildStore"))
    };
    const storeParts = [
        `MessageStore:${storeHealth.messageStore ? "ok" : "miss"}`,
        `ChannelStore:${storeHealth.channelStore ? "ok" : "miss"}`,
        `RoleStore:${storeHealth.guildRoleStore ? "ok" : "miss"}`
    ];
    add(
        "stores",
        "hostHealthItemStores",
        storeHealth.messageStore ? (storeHealth.channelStore ? "ok" : "warn") : "warn",
        storeParts.join(" · "),
        storeHealth
    );

    const hasDoc = typeof document !== "undefined" && typeof document.querySelector === "function";
    const settingsOverlayOpen = hasDoc
        && Boolean(plugin.isDiscordSettingsSurfaceOpen?.({ force: true }))
        && !document.querySelector?.(".dait-quick-settings-modal-root");
    const chatRoot = hasDoc ? plugin.getDiscordChatMutationObserverRoot?.() : null;
    add(
        "chatRoot",
        "hostHealthItemChatRoot",
        chatRoot ? "ok" : "warn",
        chatRoot
            ? strings.chatRootFound({
                tag: String(chatRoot.tagName || "div").toLowerCase(),
                bound: Boolean(plugin.observerRoot)
            })
            : settingsOverlayOpen
                ? strings.chatRootSettings()
                : strings.chatRootMissing(),
        { found: Boolean(chatRoot), observerBound: Boolean(plugin.observerRoot), settingsOverlayOpen }
    );

    const messageSelector = plugin.discordHost?.selectors?.getMessageNodeSelector?.() || "[id^='chat-messages-'], [data-list-item-id*='chat-messages']";
    const messageNodes = hasDoc ? [...(document.querySelectorAll?.(messageSelector) || [])] : [];
    const sampleContent = messageNodes.slice(0, 5).filter(node => Boolean(plugin.getMessageContentElement?.(node))).length;
    add(
        "messages",
        "hostHealthItemMessages",
        messageNodes.length > 0 && sampleContent > 0 ? "ok" : "warn",
        messageNodes.length > 0
            ? strings.messagesFound({
                count: messageNodes.length,
                sample: sampleContent,
                total: Math.min(5, messageNodes.length)
            })
            : settingsOverlayOpen
                ? strings.hiddenBehindSettings()
                : strings.messagesEmpty(),
        { messageCount: messageNodes.length, readableSample: sampleContent, settingsOverlayOpen }
    );

    const textbox = hasDoc ? (plugin.getActiveTextbox?.() || plugin.getTextbox?.()) : null;
    const toolbar = textbox ? plugin.getPolishButtonContainer?.(textbox) : null;
    add(
        "composer",
        "hostHealthItemComposer",
        textbox && toolbar ? "ok" : textbox ? "warn" : "warn",
        textbox && toolbar
            ? strings.composerReady()
            : textbox
                ? strings.composerNoToolbar()
                : settingsOverlayOpen
                    ? strings.hiddenBehindSettings()
                    : strings.composerMissing(),
        { hasTextbox: Boolean(textbox), hasToolbar: Boolean(toolbar), settingsOverlayOpen }
    );

    const launcherEnabled = plugin.settings?.ui?.showQuickSettingsPanelButton !== false;
    const userSettingsBtn = hasDoc && launcherEnabled ? plugin.findDiscordUserSettingsButton?.({ force: true }) : null;
    const launcher = hasDoc ? document.querySelector?.(".dait-quick-settings-button") : null;
    add(
        "userPanel",
        "hostHealthItemUserPanel",
        !launcherEnabled ? "ok" : launcher ? "ok" : (userSettingsBtn || settingsOverlayOpen) ? "warn" : "error",
        !launcherEnabled
            ? strings.disabledInSettings()
            : launcher
                ? strings.userPanelReady()
                : settingsOverlayOpen
                    ? strings.userPanelSettings()
                    : userSettingsBtn
                        ? strings.userPanelUnmounted()
                        : strings.userPanelMissing(),
        { enabled: launcherEnabled, hasSettingsButton: Boolean(userSettingsBtn), hasLauncher: Boolean(launcher), settingsOverlayOpen }
    );

    const contextEnabled = plugin.settings?.ui?.injectMessageContextMenu !== false;
    const patchCount = Array.isArray(plugin.unpatches) ? plugin.unpatches.length : 0;
    add(
        "contextMenu",
        "hostHealthItemContextMenu",
        !contextEnabled ? "ok" : patchCount > 0 ? "ok" : (bdCaps.ContextMenu ? "warn" : "error"),
        !contextEnabled
            ? strings.disabledInSettings()
            : patchCount > 0
                ? strings.contextMenuActive({ count: patchCount })
                : strings.contextMenuMissing(),
        { enabled: contextEnabled, patchCount }
    );

    const discordTheme = plugin.getDiscordThemeClass?.() || "unknown";
    const resolvedPanelTheme = plugin.resolvePanelTheme?.() || "dark";
    add(
        "theme",
        "hostHealthItemTheme",
        "ok",
        strings.themeDetail({ discordTheme, resolvedPanelTheme }),
        { discordTheme, resolvedPanelTheme, setting: plugin.settings?.ui?.panelTheme || "auto" }
    );

    const ok = checks.filter(item => item.status === "ok").length;
    const warn = checks.filter(item => item.status === "warn").length;
    const error = checks.filter(item => item.status === "error").length;
    const overall = error > 0 ? "error" : warn > 0 ? "warn" : "ok";

    return {
        timestamp: new Date().toISOString(),
        version: PLUGIN_VERSION,
        route: plugin.getCurrentRouteKey?.() || "",
        summary: { ok, warn, error, total: checks.length, overall },
        checks
    };
}

module.exports = { runHostHealthCheck };
