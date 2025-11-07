/* =============================================================================
 * Project : アストロキングス - 蠱毒な銀河へようこそ！
 * File    : map-core.js
 * Version : Ver. 0.02 / Rev. 015
 * Date    : 2025-10-14 (火)
 * Library : -
 * Function: コア制御（ズーム・パン・座標変換）
 * Notes   :
 *   - ★本改修: 最小ズーム算出を再正典化し、全域表示と 1/2 短辺ルール双方を満たすよう補正。
 * =============================================================================
 */
import { CAMERA, GEOMETRY, UI } from './map-config.js';
import { SQRT3, clamp } from './map-utils.js';

const HEX_R = GEOMETRY.HEX_R;
const HEX_WIDTH = SQRT3 * HEX_R;
const HEX_HEIGHT = 2 * HEX_R;
const HEX_ROW_HEIGHT = HEX_HEIGHT * 0.75;

const WORLD_COLS = GEOMETRY.WORLD_COLS;
const WORLD_ROWS = GEOMETRY.WORLD_ROWS;
const WORLD_MARGIN = GEOMETRY.WORLD_MARGIN_HEX;

const zoomListeners = new Set();

const state = {
  app: null,
  world: null,
  zoom: CAMERA.initialZoom,
  dragging: false,
  dragStart: {
    x: 0,
    y: 0,
    worldX: 0,
    worldY: 0,
  },
};

export const HEX_METRICS = Object.freeze({
  radius: HEX_R,
  width: HEX_WIDTH,
  height: HEX_HEIGHT,
  rowHeight: HEX_ROW_HEIGHT,
});

export const WORLD_BOUNDS = Object.freeze({
  minQ: 0,
  maxQ: WORLD_COLS - 1,
  minR: 0,
  maxR: WORLD_ROWS - 1,
  margin: WORLD_MARGIN,
});

const WORLD_EXTENTS = Object.freeze({
  minX: -HEX_WIDTH / 2,
  maxX: HEX_WIDTH * (WORLD_BOUNDS.maxQ + 0.5) + HEX_WIDTH / 2,
  minY: -HEX_HEIGHT / 2,
  maxY: HEX_ROW_HEIGHT * WORLD_BOUNDS.maxR + HEX_HEIGHT / 2,
});

export function getRendererSafeArea(renderer){
  const resolution = renderer?.resolution ?? 1;
  const safe = UI.SAFE ?? {};
  const scale = Number.isFinite(resolution) && resolution > 0 ? resolution : 1;
  return {
    left: (safe.left ?? 0) * scale,
    right: (safe.right ?? 0) * scale,
    top: (safe.top ?? 0) * scale,
    bottom: (safe.bottom ?? 0) * scale,
    resolution: scale,
  };
}

export function getWorldExtents(){
  return WORLD_EXTENTS;
}

export function attach(app, world){
  state.app = app;
  state.world = world;
  if (state.app?.stage){
    state.app.stage.sortableChildren = true;
  }
  if (state.world){
    state.world.sortableChildren = true;
    state.world.scale.set(state.zoom);
    clampWorldIntoView();
  }
  notifyZoomListeners(state.zoom);
}

export function getState(){
  return state;
}

export function setZoom(z, origin){
  const minZoom = getDynamicMinZoom();
  const target = clamp(z, minZoom, CAMERA.maxZoom);
  if (!state.world){
    state.zoom = target;
    return state.zoom;
  }

  const reference = origin ? screenToWorld(origin.x, origin.y) : null;
  state.zoom = target;
  state.world.scale.set(target);

  if (reference && origin){
    const sx = origin.x - reference.x * state.zoom;
    const sy = origin.y - reference.y * state.zoom;
    state.world.position.set(sx, sy);
  }

  clampWorldIntoView();
  notifyZoomListeners(state.zoom);
  return state.zoom;
}

export function zoomBy(delta, origin){
  const factor = 1 + delta * CAMERA.wheelStep;
  const next = factor > 0 ? state.zoom * factor : state.zoom;
  return setZoom(next, origin);
}

export function startDrag(screenX, screenY){
  if (!state.world) return;
  state.dragging = true;
  state.dragStart = {
    x: screenX,
    y: screenY,
    worldX: state.world.x,
    worldY: state.world.y,
  };
}

export function dragTo(screenX, screenY){
  if (!state.dragging || !state.world) return;
  const dx = screenX - state.dragStart.x;
  const dy = screenY - state.dragStart.y;
  state.world.position.set(state.dragStart.worldX + dx, state.dragStart.worldY + dy);
  clampWorldIntoView();
  notifyZoomListeners(state.zoom);
}

export function endDrag(){
  state.dragging = false;
}

export function screenToWorld(screenX, screenY){
  if (!state.world) return { x: screenX, y: screenY };
  return {
    x: (screenX - state.world.x) / state.zoom,
    y: (screenY - state.world.y) / state.zoom,
  };
}

export function worldToScreen(worldX, worldY){
  if (!state.world) return { x: worldX, y: worldY };
  return {
    x: worldX * state.zoom + state.world.x,
    y: worldY * state.zoom + state.world.y,
  };
}

export function hexToWorld(q, r){
  const x = HEX_WIDTH * (q + 0.5 * (r & 1));
  const y = HEX_ROW_HEIGHT * r;
  return { x, y };
}

export function worldToHex(x, y){
  const axialQ = ((SQRT3 / 3) * x - (1 / 3) * y) / HEX_R;
  const axialR = ((2 / 3) * y) / HEX_R;

  const cube = cubeRound(axialQ, -axialQ - axialR, axialR);

  const row = cube.z;
  const col = cube.x + (row - (row & 1)) / 2;

  return { q: col, r: row };
}

export function focusOnWorldPoint(worldX, worldY){
  if (!state.app?.renderer || !state.world) return;
  const { width, height } = state.app.renderer;
  const targetX = width * 0.5 - worldX * state.zoom;
  const targetY = height * 0.5 - worldY * state.zoom;
  state.world.position.set(targetX, targetY);
  clampWorldIntoView();
  notifyZoomListeners(state.zoom);
}

export function focusOnHex(q, r){
  const { x, y } = hexToWorld(q, r);
  focusOnWorldPoint(x, y);
}

export function getStandardCenter(){
  return GEOMETRY.STANDARD_CENTER ?? { q: 0, r: 0 };
}

export function focusOnStandardCenter(){
  const center = getStandardCenter();
  if (!Number.isFinite(center?.q) || !Number.isFinite(center?.r)) return;
  focusOnHex(center.q, center.r);
}

function cubeRound(x, y, z){
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);

  if (dx > dy && dx > dz){
    rx = -ry - rz;
  } else if (dy > dz){
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { x: rx, y: ry, z: rz };
}

function clampWorldIntoView(){
  if (!state.app?.renderer || !state.world) return;
  const { width: viewWidth, height: viewHeight } = state.app.renderer;
  const zoom = state.zoom;

  const safe = getRendererSafeArea(state.app.renderer);
  const innerLeft = safe.left ?? 0;
  const innerRight = viewWidth - (safe.right ?? 0);
  const innerTop = safe.top ?? 0;
  const innerBottom = viewHeight - (safe.bottom ?? 0);
  const innerWidth = Math.max(0, innerRight - innerLeft);
  const innerHeight = Math.max(0, innerBottom - innerTop);

  const scaledMinX = WORLD_EXTENTS.minX * zoom;
  const scaledMaxX = WORLD_EXTENTS.maxX * zoom;
  const scaledMinY = WORLD_EXTENTS.minY * zoom;
  const scaledMaxY = WORLD_EXTENTS.maxY * zoom;
  const mapWidth = scaledMaxX - scaledMinX;
  const mapHeight = scaledMaxY - scaledMinY;

  let targetX;
  if (mapWidth <= innerWidth){
    targetX = innerLeft - scaledMinX;
  } else {
    const minOffsetX = innerRight - scaledMaxX;
    const maxOffsetX = innerLeft - scaledMinX;
    targetX = clamp(state.world.x, minOffsetX, maxOffsetX);
  }

  let targetY;
  if (mapHeight <= innerHeight){
    targetY = innerTop - scaledMinY;
  } else {
    const minOffsetY = innerBottom - scaledMaxY;
    const maxOffsetY = innerTop - scaledMinY;
    targetY = clamp(state.world.y, minOffsetY, maxOffsetY);
  }

  state.world.position.set(targetX, targetY);
}

function getDynamicMinZoom(){
  const targets = computeZoomTargets();
  if (!targets) return CAMERA.minZoom;

  // Canon: 最小ズームは短辺基準で 1/2。world 全域が見切れないよう zoomForFit も下限に採用する。
  const desired = Math.min(targets.halfShortZoom, targets.fitZoom);
  const normalized = clamp(desired, CAMERA.minZoom, CAMERA.maxZoom);
  return Math.min(normalized, 1);
}

export function getFitZoom(){
  const targets = computeZoomTargets();
  if (!targets) return CAMERA.minZoom;
  const normalized = clamp(targets.fitZoom, CAMERA.minZoom, CAMERA.maxZoom);
  return normalized;
}

function computeZoomTargets(){
  if (!state.app?.renderer) return null;
  const { width: viewWidth, height: viewHeight } = state.app.renderer;
  const mapWidth = WORLD_EXTENTS.maxX - WORLD_EXTENTS.minX;
  const mapHeight = WORLD_EXTENTS.maxY - WORLD_EXTENTS.minY;
  if (mapWidth <= 0 || mapHeight <= 0) return null;

  const safe = getRendererSafeArea(state.app.renderer);
  const innerWidth = Math.max(0, viewWidth - (safe.left ?? 0) - (safe.right ?? 0));
  const innerHeight = Math.max(0, viewHeight - (safe.top ?? 0) - (safe.bottom ?? 0));
  if (innerWidth <= 0 || innerHeight <= 0) return null;

  const mapShort = Math.min(mapWidth, mapHeight);
  const innerShort = Math.min(innerWidth, innerHeight);
  if (mapShort <= 0 || innerShort <= 0) return null;

  const halfShortZoom = innerShort / (mapShort * 2);
  const fitZoom = Math.min(innerWidth / mapWidth, innerHeight / mapHeight);
  if (!Number.isFinite(halfShortZoom) || !Number.isFinite(fitZoom)) return null;

  return {
    halfShortZoom,
    fitZoom,
  };
}

function notifyZoomListeners(zoom){
  for (const listener of zoomListeners){
    try {
      listener(zoom);
    } catch (err){
      console.error(err);
    }
  }
}

export function addZoomListener(listener){
  if (typeof listener !== 'function') return () => {};
  zoomListeners.add(listener);
  return () => {
    zoomListeners.delete(listener);
  };
}
