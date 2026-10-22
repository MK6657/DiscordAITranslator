"use strict";

// What counts as a channel for the per-channel auto-translate rule; queue-core, the settings and the quick panel
// all ask here. Discord's route is /channels/<guild>/<channel> (the route key is "<guild>:<channel>:<message>").
// Text channels, threads and forum posts, DMs and group DMs (/channels/@me/<id>) have a numeric id there and are
// channels. Discord's own guild pages share the route with a name instead: Browse Channels, Channels & Roles,
// Onboarding, Members, Server Subscriptions, Server Shop, and the Server Guide (@home). Those, the DM list
// (/channels/@me) and screens outside /channels (scheduled events open at /events/...) are not channels and get no
// rule. Any other name is still taken as a channel, as before: only the pages above are known not to be.
const DISCORD_GUILD_PAGE_SEGMENTS = new Set([
    "channel-browser",
    "customize-community",
    "onboarding",
    "member-safety",
    "role-subscriptions",
    "shop"
]);

function getChannelRouteParts(routeKey) {
    const [guildId = "", channelId = ""] = String(routeKey || "").split(":");
    return { guildId, channelId };
}

function isChannelRouteSegment(segment) {
    const value = String(segment || "");
    if (!value) return false;
    if (/^\d+$/.test(value)) return true;
    return !value.startsWith("@") && !DISCORD_GUILD_PAGE_SEGMENTS.has(value.toLowerCase());
}

// "<guild>:<channel>" (the key a channel's rule is stored under) for a route that shows a channel, "" otherwise.
function getChannelRuleKey(routeKey) {
    const { guildId, channelId } = getChannelRouteParts(routeKey);
    return isChannelRouteSegment(channelId) ? `${guildId}:${channelId}` : "";
}

module.exports = {
    DISCORD_GUILD_PAGE_SEGMENTS,
    getChannelRouteParts,
    getChannelRuleKey,
    isChannelRouteSegment
};
