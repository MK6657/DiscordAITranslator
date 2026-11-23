"use strict";

// Crisp pixel-art SVG icons (16x16 grid, shape-rendering="crispEdges") for UI chrome and CSS masks.
// Never replaces readable body typography — used strictly for crisp icon glyphs and pixel trim.

const PIXEL_ICON_RECTS = Object.freeze({
    // 16x16 pixel gear (settings)
    gear: [
        [6, 1, 4, 2], [6, 13, 4, 2], [1, 6, 2, 4], [13, 6, 2, 4],
        [3, 3, 2, 2], [11, 3, 2, 2], [3, 11, 2, 2], [11, 11, 2, 2],
        [5, 3, 6, 2], [5, 11, 6, 2], [3, 5, 2, 6], [11, 5, 2, 6],
        [5, 5, 1, 1], [10, 5, 1, 1], [5, 10, 1, 1], [10, 10, 1, 1]
    ],
    // 16x16 stepped pixel close X
    close: [
        [3, 3, 2, 2], [5, 5, 2, 2], [7, 7, 2, 2], [9, 9, 2, 2], [11, 11, 2, 2],
        [11, 3, 2, 2], [9, 5, 2, 2], [5, 9, 2, 2], [3, 11, 2, 2]
    ],
    // 16x16 pixel checkmark
    check: [
        [2, 8, 2, 2], [4, 10, 2, 2], [6, 12, 2, 2],
        [8, 10, 2, 2], [10, 8, 2, 2], [12, 6, 2, 2], [13, 4, 2, 2]
    ],
    // 16x16 stepped pixel downward chevron
    chevronDown: [
        [2, 5, 2, 2], [4, 7, 2, 2], [6, 9, 4, 2],
        [10, 7, 2, 2], [12, 5, 2, 2]
    ],
    // 16x16 pixel shield / host health
    shield: [
        [3, 2, 10, 2], [2, 4, 2, 5], [12, 4, 2, 5],
        [3, 9, 2, 2], [11, 9, 2, 2], [5, 11, 2, 2], [9, 11, 2, 2], [7, 13, 2, 2],
        [7, 5, 2, 4], [6, 6, 4, 2]
    ],
    // 16x16 pixel diamond gem (status / accent)
    gem: [
        [7, 2, 2, 2], [5, 4, 6, 2], [3, 6, 10, 4], [5, 10, 6, 2], [7, 12, 2, 2]
    ],
    // 16x16 pixel octagonal alert badge
    alert: [
        [5, 1, 6, 2], [5, 13, 6, 2], [1, 5, 2, 6], [13, 5, 2, 6],
        [3, 3, 2, 2], [11, 3, 2, 2], [3, 11, 2, 2], [11, 11, 2, 2],
        [7, 4, 2, 5], [7, 10, 2, 2]
    ],
    // 16x16 pixel clock (wait / cooldown)
    clock: [
        [5, 1, 6, 2], [5, 13, 6, 2], [1, 5, 2, 6], [13, 5, 2, 6],
        [3, 3, 2, 2], [11, 3, 2, 2], [3, 11, 2, 2], [11, 11, 2, 2],
        [7, 4, 2, 5], [7, 7, 4, 2]
    ],
    // 16x16 pixel copy sheets
    copy: [
        [2, 2, 7, 2], [2, 4, 2, 6], [4, 8, 1, 2],
        [6, 6, 8, 2], [6, 13, 8, 2], [6, 8, 2, 5], [12, 8, 2, 5]
    ],
    // 16x16 pixel refresh / retranslate loop
    retranslate: [
        [4, 2, 6, 2], [10, 1, 2, 6], [12, 3, 2, 2],
        [2, 4, 2, 8], [4, 12, 8, 2], [12, 10, 2, 2]
    ],
    // 16x16 pixel hidden eye with diagonal slash
    hide: [
        [6, 4, 5, 2], [11, 6, 3, 2], [12, 8, 2, 2],
        [2, 6, 2, 2], [3, 8, 3, 2], [5, 10, 5, 2],
        [2, 2, 2, 2], [4, 4, 2, 2], [6, 6, 2, 2],
        [8, 8, 2, 2], [10, 10, 2, 2], [12, 12, 2, 2]
    ]
});

function buildPixelSvgMarkup(name, color = "currentColor") {
    const rects = PIXEL_ICON_RECTS[name];
    if (!rects) return "";
    const body = rects
        .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`)
        .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${body}</svg>`;
}

function createPixelSvgDataUri(name, color = "#000000") {
    const svg = buildPixelSvgMarkup(name, color);
    if (!svg) return "";
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

module.exports = {
    PIXEL_ICON_RECTS,
    buildPixelSvgMarkup,
    createPixelSvgDataUri
};
