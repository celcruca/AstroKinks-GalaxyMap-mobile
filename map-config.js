/* =============================================================================
 * Project : アストロキングス - 蠱毒な銀河へようこそ！
 * File    : map-config.js
 * Version : Ver. 0.02 / Rev. 025
 * Date    : 2025-03-08 (土)
 * Library : -
 * Function: 正典パラメータの単一管理（SSoT）とガバナンス設定
 * Notes   :
 *   - ★本改修: THEME.crossColor を正典色 0x3a7700 に戻し、HUD クロスヘア色の逸脱を解消。
 *   - ★本改修: CAMERA.minZoom を再正典化し、最小ズームが表示領域短辺 1/2 ルールに従うよう補正。
 *   - ★本改修: ネスト外周 outerAlpha を 0.45 に統一し、外周描画差異を解消。
 *   - ★本改修: OBJECTS.measurement を追加し、距離計測ラインとラベルの正典スタイルを定義。
 *   - ★本改修: STRIKE の行軍時間補正秒数と弾着時間既定値を正典化。
 *   - ★本改修: OBJECTS.measurement の線幅を増強し、距離ライン視認性を改善。
 * =============================================================================
 */

export const APP = Object.freeze({
  background: 0x0b0f16,
  antialias: true,
  autoDensity: true,
});

export const CAMERA = Object.freeze({
  initialZoom: 1,
  minZoom: 0.001,
  maxZoom: 3,
  wheelStep: 0.15,
});

export const UI = Object.freeze({
  SAFE: Object.freeze({
    top: 40,
    left: 48,
    right: 4,
    bottom: 6,
  }),
  FIXED: Object.freeze({
    top: Object.freeze({ height: 40 }),
    left: Object.freeze({ width: 48 }),
    right: Object.freeze({ width: 4 }),
    bottom: Object.freeze({ height: 6 }),
  }),
});

export const GEOMETRY = Object.freeze({
  HEX_R: 24,
  OFFSET_LAYOUT: 'odd-r',
  ORIENTATION: 'pointy-top',
  WORLD_COLS: 1000,
  WORLD_ROWS: 1000,
  WORLD_MARGIN_HEX: 0,
  STANDARD_CENTER: Object.freeze({ q: 500, r: 478 }),
});

export const HEXGRID = Object.freeze({
  Z_SEAMLESS: 1.25,
  Z_DECIMATE: 2.0,
  DECIMATE_MODE: 'exp',
  DECIMATE_START_Z: 0.7,
  DECIMATE_GAMMA: 1.25,
  DECIMATE_SERIES: Object.freeze([1, 5, 10, 25, 50, 100]),
  DECIMATE_MIN_STEP: 1,
});

export const HUD = Object.freeze({
  GRID: Object.freeze({
    lineWidth: 1,
    alpha: 0.35,
  }),
  GUIDES: Object.freeze({
    steps: Object.freeze([200, 400, 600, 800]),
    lineWidth: 4,
    alpha: 0.25,
  }),
  RULER: Object.freeze({
    majorTick: 10,
    minorTick: 6,
    fontSize: 16,
    steps: Object.freeze([1, 5, 10, 25, 50, 100]),
  }),
  CROSSHAIR: Object.freeze({
    lineWidth: 2,
    smallRadius: 0,
    fontSize: 16,
  }),
});

export const THEME = Object.freeze({
  gridColor: 0x2f5678,
  guideColor: 0xffffff,
  crossColor: 0x3a7700,
  shadeColor: 0x000000,
  shadeAlpha: 0.35,
  rulerColor: 0xffffff,
  selection: Object.freeze({
    color: 0xffd400,
    glowAlpha: 0.6,
  }),
  nest: Object.freeze({
    iff: Object.freeze({
      SELF: 0x33aa55,
      FRND: 0x3388ff,
      ENMY: 0xdd3344,
      NEUT: 0x9aa0a6,
      SUBF: 0x7acfa0,
      CHEK: 0xe6b422,
    }),
    outerAlpha: 0.45,
  }),
});

export const OBJECTS = Object.freeze({
  strokeWidth: 2,
  strokeAlpha: 0.95,
  fillAlpha: 0.55,
  nestLabelFontSize: 18,
  tenebrisLabelFontSize: 20,
  satelliteLabelFontSize: 16,
  planetLabelFontSize: 18,
  coordinateLabelFontSize: 16,
  satelliteLabelOffset: 10,
  label: Object.freeze({
    fontSize: 14,
    tint: 0xffffff,
    dropShadow: true,
    dropShadowDistance: 1,
    dropShadowBlur: 1,
    dropShadowColor: 0x000000,
  }),
  palette: Object.freeze({
    FIXED: 0x5a0a11,
    SATELLITE: 0x258ab5,
    PLANET: 0x2a9d8f,
    NEST: 0x5a0a11,
    DEFAULT: 0x909090,
    NO_ENTRY: 0x7b1c74,
  }),
  nest: Object.freeze({
    outerAlpha: 0.45,
    borderAlpha: 1,
    fillAlpha: 0.12,
    borderWidth: 2,
    highlightWidth: 4,
    highlightOffset: 1,
    edgeWidth: 0,
  }),
  noEntry: Object.freeze({
    fillAlpha: 0.2,
    hatchStep: 8,
    hatchAlpha: 0.8,
    borderWidth: 2,
  }),
  selection: Object.freeze({
    glowAlpha: 0.6,
  }),
  target: Object.freeze({
    fillColor: 0x49a8ff,
    fillAlpha: 0.6,
    borderColor: 0x0f3a99,
    borderAlpha: 0.9,
    borderWidth: 2,
    labelFontSize: 16,
    labelColor: 0xffffff,
  }),
  measurement: Object.freeze({
    lineColor: 0xff9f1a,
    lineAlpha: 0.9,
    lineWidth: 5,
    markerRadius: 6,
    markerColor: 0xffffff,
    markerAlpha: 0.95,
    labelFontSize: 16,
    labelColor: 0xffffff,
  }),
});

export const STRIKE = Object.freeze({
  secondsPerHex: Object.freeze({
    planet: 1.13,
    pvp: 1.175,
    base: 1.23,
    satellite: 1.53,
  }),
  marchAdjustmentSeconds: -1,
  impact: Object.freeze({
    defaultSeconds: 40 * 60,
  }),
});

export const Z_INDEX = Object.freeze({
  GRID_BASE: 100,
  GRID_GUIDES: 120,
  OVERLAY_BASE: 300,
  OVERLAY_LABELS: 320,
  HUD_SHADE: 900,
  HUD_GUIDES: 910,
  HUD_RULER: 920,
  HUD_CROSSHAIR: 930,
  UI_FIXED: 1000,
});
