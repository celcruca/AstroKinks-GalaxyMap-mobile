/* =============================================================================
 * Project : アストロキングス - 蠱毒な銀河へようこそ！
 * File    : map-hud.js
 * Version : Ver. 0.02 / Rev. 022
 * Date    : 2025-10-14 (火)
 * Library : -
 * Function: HUD 表示制御（ルーラー・クロスヘア・暗幕）
 * Notes   :
 *   - ★本改修: クロスヘア描画で THEME.crossColor の正典値と白フォールバックを適用。
 *   - ★本改修: ヘッダ体裁を Rev.022 に再整備。
 *   - ★本改修: 安全帯シェードの微小ギャップ判定を調整し、999:999 列が完全表示されるよう補正。
 *   - ★本改修: ルーラーにおける 000〜999 正典範囲外の目盛とラベルを抑止。
 * =============================================================================
 */

import { HUD, THEME, Z_INDEX, OBJECTS as OBJECT_STYLE } from './map-config.js';
import {
  HEX_METRICS,
  WORLD_BOUNDS,
  screenToWorld,
  worldToHex,
  worldToScreen,
  hexToWorld,
  getRendererSafeArea,
} from './map-core.js';
import { snap05, clamp } from './map-utils.js';

let hudRoot = null;
let safeLayer = null;
let shadeLayer = null;
let rulerLayer = null;
let rulerLabels = null;
let crossLayer = null;
let crossLabel = null;
const labelPool = [];
let crosshairPosition = null;

export function ensureHUD(app){
  if (hudRoot) return hudRoot;

  hudRoot = new PIXI.Container();
  hudRoot.name = 'hud-root';
  hudRoot.zIndex = Z_INDEX.HUD_CROSSHAIR;
  hudRoot.sortableChildren = true;

  safeLayer = new PIXI.Graphics();
  safeLayer.name = 'hud-safe';
  safeLayer.zIndex = Z_INDEX.HUD_SHADE - 5;

  shadeLayer = new PIXI.Graphics();
  shadeLayer.name = 'hud-shade';
  shadeLayer.zIndex = Z_INDEX.HUD_SHADE;

  rulerLayer = new PIXI.Graphics();
  rulerLayer.name = 'hud-rulers';
  rulerLayer.zIndex = Z_INDEX.HUD_RULER;

  rulerLabels = new PIXI.Container();
  rulerLabels.name = 'hud-ruler-labels';
  rulerLabels.zIndex = Z_INDEX.HUD_RULER;

  crossLayer = new PIXI.Graphics();
  crossLayer.name = 'hud-crosshair';
  crossLayer.zIndex = Z_INDEX.HUD_CROSSHAIR;

  const crossFontSize = HUD.CROSSHAIR.fontSize ?? (OBJECT_STYLE.label.fontSize ?? 14);
  const labelStyle = {
    fill: OBJECT_STYLE.label.tint,
    fontSize: crossFontSize,
    fontFamily: 'Segoe UI, Hiragino Sans, sans-serif',
  };
  crossLabel = new PIXI.Text('', labelStyle);
  crossLabel.name = 'hud-crosshair-label';
  crossLabel.zIndex = Z_INDEX.HUD_CROSSHAIR + 1;
  crossLabel.visible = false;
  if (OBJECT_STYLE.label.dropShadow){
    crossLabel.dropShadow = true;
    crossLabel.dropShadowDistance = OBJECT_STYLE.label.dropShadowDistance;
    crossLabel.dropShadowBlur = OBJECT_STYLE.label.dropShadowBlur;
    crossLabel.dropShadowColor = OBJECT_STYLE.label.dropShadowColor;
    crossLabel.dropShadowAngle = Math.PI / 2;
  }

  hudRoot.addChild(safeLayer);
  hudRoot.addChild(shadeLayer);
  hudRoot.addChild(rulerLayer);
  hudRoot.addChild(rulerLabels);
  hudRoot.addChild(crossLayer);
  hudRoot.addChild(crossLabel);

  app.stage.addChild(hudRoot);
  return hudRoot;
}

export function updateHUD(app){
  if (!hudRoot) return;
  const renderer = app.renderer;
  const width = renderer.width;
  const height = renderer.height;
  const safe = getRendererSafeArea(renderer);

  drawSafeBands(width, height, safe);
  drawShade(width, height, safe);
  drawCrosshair(width, height, safe);
  drawRulers(width, height, safe);
}

export function setCrosshairPosition(x, y){
  if (Number.isFinite(x) && Number.isFinite(y)){
    crosshairPosition = { x, y };
  } else {
    crosshairPosition = null;
  }
}

function drawSafeBands(width, height, safe){
  if (!safeLayer) return;
  const left = Math.max(0, safe.left ?? 0);
  const right = Math.max(0, safe.right ?? 0);
  const top = Math.max(0, safe.top ?? 0);
  const bottom = Math.max(0, safe.bottom ?? 0);
  const bodyHeight = Math.max(0, height - top - bottom);
  const shadeAlpha = THEME.shadeAlpha ?? 0.35;
  const clampedLeftWidth = Math.min(left, width);
  const clampedRightWidth = Math.min(right, width);
  const rightStart = Math.max(0, width - clampedRightWidth);

  safeLayer.clear();
  safeLayer.beginFill(THEME.shadeColor, shadeAlpha);
  safeLayer.drawRect(0, 0, width, top);
  safeLayer.drawRect(0, height - bottom, width, bottom);
  safeLayer.endFill();

  safeLayer.beginFill(THEME.shadeColor, shadeAlpha);
  safeLayer.drawRect(0, top, clampedLeftWidth, bodyHeight);
  safeLayer.drawRect(rightStart, top, clampedRightWidth, bodyHeight);
  safeLayer.endFill();
}

function drawShade(width, height, safe){
  shadeLayer.clear();

  const worldRect = computeWorldBoundsInScreen();
  if (!worldRect) return;

  const left = Math.max(0, safe.left ?? 0);
  const right = Math.max(0, safe.right ?? 0);
  const top = Math.max(0, safe.top ?? 0);
  const bottom = Math.max(0, safe.bottom ?? 0);
  const innerLeft = left;
  const innerRight = Math.max(innerLeft, width - right);
  const innerTop = top;
  const innerBottom = Math.max(innerTop, height - bottom);

  const shadeAlpha = THEME.shadeAlpha ?? 0.35;
  const shadeColor = THEME.shadeColor ?? 0x000000;

  const minX = clamp(worldRect.minX, innerLeft, innerRight);
  const maxX = clamp(worldRect.maxX, innerLeft, innerRight);
  const minY = clamp(worldRect.minY, innerTop, innerBottom);
  const maxY = clamp(worldRect.maxY, innerTop, innerBottom);

  const shadeMinX = snap05(minX);
  const shadeMaxX = snap05(maxX);
  const shadeMinY = snap05(minY);
  const shadeMaxY = snap05(maxY);

  const gapEpsilon = 0.75;
  const trimGap = (gap) => (gap > gapEpsilon ? gap : 0);

  const leftGap = trimGap(Math.max(0, shadeMinX - innerLeft));
  const rightGap = trimGap(Math.max(0, innerRight - shadeMaxX));
  const topGap = trimGap(Math.max(0, shadeMinY - innerTop));
  const bottomGap = trimGap(Math.max(0, innerBottom - shadeMaxY));

  shadeLayer.beginFill(shadeColor, shadeAlpha);
  if (topGap > 0){
    shadeLayer.drawRect(innerLeft, innerTop, innerRight - innerLeft, topGap);
  }
  if (bottomGap > 0){
    shadeLayer.drawRect(innerLeft, shadeMaxY, innerRight - innerLeft, bottomGap);
  }
  if (leftGap > 0){
    shadeLayer.drawRect(innerLeft, shadeMinY, leftGap, shadeMaxY - shadeMinY);
  }
  if (rightGap > 0){
    shadeLayer.drawRect(shadeMaxX, shadeMinY, rightGap, shadeMaxY - shadeMinY);
  }
  shadeLayer.endFill();
}

function drawCrosshair(width, height, safe){
  crossLayer.clear();
  crossLayer.visible = false;
  if (crossLabel){
    crossLabel.visible = false;
  }

  const left = Math.max(0, safe.left ?? 0);
  const right = Math.max(left, width - Math.max(0, safe.right ?? 0));
  const top = Math.max(0, safe.top ?? 0);
  const bottom = Math.max(top, height - Math.max(0, safe.bottom ?? 0));

  if (!crosshairPosition) return;
  const rawX = crosshairPosition.x;
  const rawY = crosshairPosition.y;
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return;

  const worldPos = screenToWorld(rawX, rawY);
  if (!worldPos) return;
  const hex = worldToHex(worldPos.x, worldPos.y);
  if (!hex) return;
  const q = Math.trunc(hex.q);
  const r = Math.trunc(hex.r);
  const inside =
    Number.isFinite(q) &&
    Number.isFinite(r) &&
    q >= WORLD_BOUNDS.minQ &&
    q <= WORLD_BOUNDS.maxQ &&
    r >= WORLD_BOUNDS.minR &&
    r <= WORLD_BOUNDS.maxR;
  if (!inside) return;

  const centerWorld = hexToWorld(q, r);
  const centerScreen = worldToScreen(centerWorld.x, centerWorld.y);
  if (!centerScreen) return;
  const cx = snap05(centerScreen.x);
  const cy = snap05(centerScreen.y);
  if (cx < left || cx > right || cy < top || cy > bottom) return;

  const crossWidth = HUD.CROSSHAIR.lineWidth ?? 2;
  const crossColor = Number.isFinite(THEME.crossColor) ? THEME.crossColor : 0xffffff;
  crossLayer.lineStyle(crossWidth, crossColor, 1);
  crossLayer.moveTo(left, cy);
  crossLayer.lineTo(right, cy);
  crossLayer.moveTo(cx, top);
  crossLayer.lineTo(cx, bottom);
  crossLayer.visible = true;

  if (crossLabel){
    crossLabel.text = `[${pad3(q)}:${pad3(r)}]`;
    const labelWidth = crossLabel.width;
    const labelHeight = crossLabel.height;
    const desiredX = cx + 16;
    const desiredY = cy + 16;
    const minX = left + 4;
    const maxX = right - 4 - labelWidth;
    const minY = top + 4;
    const maxY = bottom - 4 - labelHeight;
    const clampedX = maxX >= minX ? clamp(desiredX, minX, maxX) : minX;
    const clampedY = maxY >= minY ? clamp(desiredY, minY, maxY) : minY;
    crossLabel.position.set(snap05(clampedX), snap05(clampedY));
    crossLabel.visible = true;
  }
}

function drawRulers(width, height, safe){
  rulerLayer.clear();
  const removed = rulerLabels.removeChildren();
  for (const child of removed){
    if (child instanceof PIXI.Text) labelPool.push(child);
  }

  const left = Math.max(0, safe.left ?? 0);
  const right = Math.max(left, width - Math.max(0, safe.right ?? 0));
  const top = Math.max(0, safe.top ?? 0);
  const bottom = Math.max(top, height - Math.max(0, safe.bottom ?? 0));
  if (right <= left || bottom <= top) return;

  const bandTop = 0;
  const bandBottom = top;
  const bandLeft = 0;
  const bandRight = left;

  const centerScreenX = (left + right) / 2;
  const centerScreenY = (top + bottom) / 2;
  const centerWorld = screenToWorld(centerScreenX, centerScreenY);
  if (!centerWorld) return;
  const centerHex = worldToHex(centerWorld.x, centerWorld.y);
  if (!centerHex) return;

  const worldAtLeft = screenToWorld(left, centerScreenY);
  const worldAtRight = screenToWorld(right, centerScreenY);
  if (!worldAtLeft || !worldAtRight) return;
  const hexAtLeft = worldToHex(worldAtLeft.x, worldAtLeft.y);
  const hexAtRight = worldToHex(worldAtRight.x, worldAtRight.y);
  if (!hexAtLeft || !hexAtRight) return;
  const qMin = Math.floor(Math.min(hexAtLeft.q, hexAtRight.q)) - 1;
  const qMax = Math.ceil(Math.max(hexAtLeft.q, hexAtRight.q)) + 1;

  const worldAtTop = screenToWorld(centerScreenX, top);
  const worldAtBottom = screenToWorld(centerScreenX, bottom);
  if (!worldAtTop || !worldAtBottom) return;
  const hexAtTop = worldToHex(worldAtTop.x, worldAtTop.y);
  const hexAtBottom = worldToHex(worldAtBottom.x, worldAtBottom.y);
  if (!hexAtTop || !hexAtBottom) return;
  const rMin = Math.floor(Math.min(hexAtTop.r, hexAtBottom.r)) - 1;
  const rMax = Math.ceil(Math.max(hexAtTop.r, hexAtBottom.r)) + 1;

  const fallbackCrossColor = Number.isFinite(THEME.crossColor) ? THEME.crossColor : 0xffffff;
  const rulerColor = Number.isFinite(THEME.rulerColor) ? THEME.rulerColor : fallbackCrossColor;
  rulerLayer.lineStyle(1, rulerColor, 0.8);

  const rulerStep = resolveRulerStep(centerHex);

  const labelBandY = snap05((bandBottom - bandTop) / 2);
  const labelBandX = snap05((bandRight - bandLeft) / 2);

  const qStartStep = Math.ceil(qMin / rulerStep) * rulerStep;
  for (let qIter = qStartStep; qIter <= qMax; qIter += rulerStep){
    if (qIter < WORLD_BOUNDS.minQ || qIter > WORLD_BOUNDS.maxQ) continue;
    const worldPos = hexToWorld(qIter, centerHex.r);
    const screenPos = worldToScreen(worldPos.x, worldPos.y);
    if (!screenPos) continue;
    const x = snap05(screenPos.x);
    if (x < left || x > right) continue;
    const tickStartY = bandBottom;
    const tickEndY = Math.max(bandBottom - HUD.RULER.majorTick, bandTop);
    rulerLayer.moveTo(x, tickStartY);
    rulerLayer.lineTo(x, tickEndY);
    const label = createRulerLabel(pad3(qIter), x, labelBandY, 0.5, 0.5);
    const halfWidth = label.width / 2;
    label.x = snap05(clamp(label.x, left + halfWidth, right - halfWidth));
    rulerLabels.addChild(label);
  }

  const rStartStep = Math.ceil(rMin / rulerStep) * rulerStep;
  for (let rIter = rStartStep; rIter <= rMax; rIter += rulerStep){
    if (rIter < WORLD_BOUNDS.minR || rIter > WORLD_BOUNDS.maxR) continue;
    const worldPos = hexToWorld(centerHex.q, rIter);
    const screenPos = worldToScreen(worldPos.x, worldPos.y);
    if (!screenPos) continue;
    const y = snap05(screenPos.y);
    if (y < top || y > bottom) continue;
    const tickStartX = bandRight;
    const tickEndX = Math.max(bandRight - HUD.RULER.majorTick, bandLeft);
    rulerLayer.moveTo(tickStartX, y);
    rulerLayer.lineTo(tickEndX, y);
    const label = createRulerLabel(pad3(rIter), labelBandX, y, 0.5, 0.5);
    const halfHeight = label.height / 2;
    label.y = snap05(clamp(label.y, top + halfHeight, bottom - halfHeight));
    rulerLabels.addChild(label);
  }
}

function createRulerLabel(text, x, y, anchorX, anchorY){
  const fontSize = HUD.RULER.fontSize ?? (OBJECT_STYLE.label.fontSize ?? 14);
  const label =
    labelPool.pop() ??
    new PIXI.Text('', {
      fill: OBJECT_STYLE.label.tint,
      fontSize,
      fontFamily: 'Segoe UI, Hiragino Sans, sans-serif',
    });
  if (label.style){
    label.style.fill = OBJECT_STYLE.label.tint;
    label.style.fontSize = fontSize;
    label.style.fontFamily = 'Segoe UI, Hiragino Sans, sans-serif';
  }
  label.text = text;
  label.x = x;
  label.y = y;
  label.anchor.set(anchorX, anchorY);
  label.zIndex = Z_INDEX.HUD_RULER;
  return label;
}

function computeWorldBoundsInScreen(){
  const minQ = WORLD_BOUNDS.minQ - WORLD_BOUNDS.margin;
  const maxQ = WORLD_BOUNDS.maxQ + WORLD_BOUNDS.margin;
  const minR = WORLD_BOUNDS.minR - WORLD_BOUNDS.margin;
  const maxR = WORLD_BOUNDS.maxR + WORLD_BOUNDS.margin;

  const worldMinX = hexToWorld(minQ, minR).x - HEX_METRICS.radius;
  const worldMaxX = hexToWorld(maxQ, minR).x + HEX_METRICS.radius;
  const worldMinY = hexToWorld(minQ, minR).y - HEX_METRICS.radius;
  const worldMaxY = hexToWorld(minQ, maxR).y + HEX_METRICS.radius;

  const minPoint = worldToScreen(worldMinX, worldMinY);
  const maxPoint = worldToScreen(worldMaxX, worldMaxY);
  if (!minPoint || !maxPoint) return null;

  return {
    minX: Math.min(minPoint.x, maxPoint.x),
    maxX: Math.max(minPoint.x, maxPoint.x),
    minY: Math.min(minPoint.y, maxPoint.y),
    maxY: Math.max(minPoint.y, maxPoint.y),
  };
}

function pad3(value){
  const n = Number(value) || 0;
  return String(Math.trunc(n)).padStart(3, '0');
}

function resolveRulerStep(centerHex){
  const candidates =
    (Array.isArray(HUD.RULER.steps) && HUD.RULER.steps.length && HUD.RULER.steps) ||
    [1, 5, 10, 25, 50, 100];
  const minSpacing = 56;
  const baseQ = Number(centerHex?.q) || 0;
  const baseR = Number(centerHex?.r) || 0;
  for (const step of candidates){
    const horizontal = measureSpacing(baseQ, baseR, step, 0);
    const vertical = measureSpacing(baseQ, baseR, 0, step);
    if (horizontal >= minSpacing && vertical >= minSpacing){
      return step;
    }
  }
  return candidates[candidates.length - 1];
}

function measureSpacing(baseQ, baseR, dq, dr){
  const start = hexToWorld(baseQ, baseR);
  const end = hexToWorld(baseQ + dq, baseR + dr);
  const startScreen = worldToScreen(start.x, start.y);
  const endScreen = worldToScreen(end.x, end.y);
  if (!startScreen || !endScreen) return 0;
  if (dq !== 0){
    return Math.abs(snap05(endScreen.x) - snap05(startScreen.x));
  }
  return Math.abs(snap05(endScreen.y) - snap05(startScreen.y));
}
