/* =============================================================================
 * Project : アストロキングス - 蠱毒な銀河へようこそ！
 * File    : map-hexgrid.js
 * Version : Ver. 0.02 / Rev. 015
 * Date    : 2025-10-08 (水)
 * Library : -
 * Function: 正典ヘクスグリッド描画（間引き制御・200ガイド描画）
 * Notes   :
 *   - ★本改修: デバッグ UI から間引き閾値/加速度を動的調整可能に。
 * =============================================================================
 */

import { HEXGRID, HUD, THEME, Z_INDEX } from './map-config.js';
import { HEX_METRICS, WORLD_BOUNDS, hexToWorld } from './map-core.js';
import { clamp, quantizeUp } from './map-utils.js';


let gridRoot = null;
let baseLayer = null;
let guideLayer = null;
let lastStep = null;
let decimateStart = HEXGRID.DECIMATE_START_Z;
let decimateGamma = HEXGRID.DECIMATE_GAMMA;

export function ensureGrid(world){
  if (gridRoot) return gridRoot;
  gridRoot = new PIXI.Container();
  gridRoot.name = 'grid-root';
  gridRoot.zIndex = Z_INDEX.GRID_BASE;

  baseLayer = new PIXI.Graphics();
  baseLayer.name = 'grid-base';

  guideLayer = new PIXI.Graphics();
  guideLayer.name = 'grid-guides';
  guideLayer.zIndex = Z_INDEX.GRID_GUIDES;

  gridRoot.addChild(baseLayer);
  gridRoot.addChild(guideLayer);
  world.addChild(gridRoot);

  return gridRoot;
}

export function updateGrid(zoom){
  if (!baseLayer || !guideLayer) return;
  const step = computeStep(zoom ?? 1);
  if (step !== lastStep){
    drawBase(step);
    lastStep = step;
  }
  drawGuides(zoom ?? 1);
}

function computeStep(z){
  if (z >= 1) return 1;
  const raw = Math.max(
    HEXGRID.DECIMATE_MIN_STEP,
    quantizeUp((HEXGRID.DECIMATE_START_Z / Math.max(z, 0.0001)) ** HEXGRID.DECIMATE_GAMMA)
  );
  const series = HEXGRID.DECIMATE_SERIES;
  if (!Array.isArray(series) || !series.length) return raw;
  for (const candidate of series){
    if (candidate >= raw) return candidate;
  }
  return series[series.length - 1];
}

function drawBase(step){
  const isV7 = typeof baseLayer.stroke === 'function';
  baseLayer.clear();
  if (isV7){
    baseLayer.stroke({ width: HUD.GRID.lineWidth, color: THEME.gridColor, alpha: HUD.GRID.alpha });
  } else {
    baseLayer.lineStyle(HUD.GRID.lineWidth, THEME.gridColor, HUD.GRID.alpha);
  }

  const minQ = WORLD_BOUNDS.minQ - WORLD_BOUNDS.margin;
  const maxQ = WORLD_BOUNDS.maxQ + WORLD_BOUNDS.margin;
  const minR = WORLD_BOUNDS.minR - WORLD_BOUNDS.margin;
  const maxR = WORLD_BOUNDS.maxR + WORLD_BOUNDS.margin;

  for (let r = minR; r <= maxR; r += step){
    for (let q = minQ; q <= maxQ; q += step){
      const { x, y } = hexToWorld(q, r);
      traceHex(baseLayer, x, y, HEX_METRICS.radius);
    }
  }

  if (isV7) baseLayer.stroke();
}

function drawGuides(zoom){
  const isV7 = typeof guideLayer.stroke === 'function';
  guideLayer.clear();
  const color = HUD.GUIDES.color ?? THEME.guideColor;
  const alpha = HUD.GUIDES.alpha ?? HUD.GRID.alpha;
  const widthBase = HUD.GUIDES.lineWidth ?? HUD.GRID.lineWidth;
  const width = widthBase / Math.max(zoom ?? 1, 0.0001);
  if (isV7){
    guideLayer.stroke({ width, color, alpha });
  } else {
    guideLayer.lineStyle(width, color, alpha);
  }

  const steps = HUD.GUIDES.steps;
  if (!Array.isArray(steps) || !steps.length){
    if (isV7) guideLayer.stroke();
    return;
  }

  const minQ = WORLD_BOUNDS.minQ;
  const maxQ = WORLD_BOUNDS.maxQ;
  const minR = WORLD_BOUNDS.minR;
  const maxR = WORLD_BOUNDS.maxR;
  const margin = WORLD_BOUNDS.margin;

  const yStart = hexToWorld(0, minR - margin).y - HEX_METRICS.radius;
  const yEnd = hexToWorld(0, maxR + margin).y + HEX_METRICS.radius;
  const xStart = hexToWorld(minQ - margin, minR).x - HEX_METRICS.width;
  const xEnd = hexToWorld(maxQ + margin, minR).x + HEX_METRICS.width;

  for (const q of steps){
    if (q < minQ || q > maxQ) continue;
    const x = HEX_METRICS.width * q;
    guideLayer.moveTo(x, yStart);
    guideLayer.lineTo(x, yEnd);
  }

  for (const r of steps){
    if (r < minR || r > maxR) continue;
    const y = HEX_METRICS.rowHeight * r;
    guideLayer.moveTo(xStart, y);
    guideLayer.lineTo(xEnd, y);
  }

  if (isV7) guideLayer.stroke();
}

function traceHex(graphics, cx, cy, radius){
  const points = getHexPoints(cx, cy, radius);
  graphics.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2){
    graphics.lineTo(points[i], points[i + 1]);
  }
  graphics.closePath();
}

function getHexPoints(cx, cy, radius){
  const coords = [];
  for (let i = 0; i < 6; i++){
    const angle = (Math.PI / 180) * (60 * i - 30);
    coords.push(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
  }
  return coords;
}

export function setDecimateStartZ(value){
  if (Number.isFinite(value)){
    decimateStart = clamp(value, 0.05, 5);
  }
  return decimateStart;
}

export function setDecimateGamma(value){
  if (Number.isFinite(value)){
    decimateGamma = clamp(value, 0.2, 5);
  }
  return decimateGamma;
}

export function getDecimateConfig(){
  return {
    start: decimateStart,
    gamma: decimateGamma,
  };
}
