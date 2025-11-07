/* =============================================================================
 * Project : アストロキングス - 蠱毒な銀河へようこそ！
 * File    : map-overlay.js
* Version : Ver. 0.02 / Rev. 020
* Date    : 2025-10-18 (土)
 * Library : -
 * Function: オブジェクト overlay 描画（ネスト・禁域・ラベル配置）
 * Notes   :
 *   - ★本改修: redrawOverlay で world 外オブジェクトを除外し正典 clamp を遵守。
 *   - ★本改修: 進入禁止領域の描画で isInsideWorld チェックを追加し、world 外描画を抑止。
 *   - ★本改修: ネスト外周のハイライト線を強調し、正典境界強調仕様を復旧。
 *   - ★本改修: 弾着計算線を OBJECTS.measurement の線のみ描画し、マーカーとラベルを削除。
 * =============================================================================
 */

import { OBJECTS as OBJECT_STYLE, THEME, Z_INDEX } from './map-config.js';
import {
  HEX_METRICS,
  WORLD_BOUNDS,
  hexToWorld,
  worldToScreen,
  getState,
  addZoomListener,
} from './map-core.js';
import { clamp, snap05 } from './map-utils.js';
import objectList, { CATEGORY } from './map-object.js';

let overlayRoot = null;
let noEntryLayer = null;
let shapeLayer = null;
let measurementLayer = null;
let labelLayer = null;
let targetLayer = null;
let selectedKey = null;
let selectedHexKey = null;
let nestOuterIntensity = 1;
let nestOuterAlpha =
  OBJECT_STYLE.nest.outerAlpha ?? THEME.nest?.outerAlpha ?? OBJECT_STYLE.nest.fillAlpha ?? 0.12;
let detachZoomListener = null;
let currentLabelRecords = [];
let targetMarkers = [];
let measurementData = null;
const TARGET_CATEGORY = 'TARGET';
const TARGET_DEFAULT_COLOR = 0x49a8ff;
const TARGET_DEFAULT_ALPHA = 0.6;
const TARGET_BORDER_ALPHA = 0.9;
const TARGET_BORDER_WIDTH = 2;
const MEASUREMENT_CATEGORY = 'MEASURE';
const MEASUREMENT_DEFAULT_COLOR = 0xff9f1a;
const MEASUREMENT_DEFAULT_ALPHA = 0.9;
const MEASUREMENT_DEFAULT_WIDTH = 3;
const MEASUREMENT_DEFAULT_MARKER_RADIUS = 6;
const MEASUREMENT_DEFAULT_MARKER_ALPHA = 0.95;
const NEST_COORD_HIDE_ZOOM = 0.10;
const NEST_SCALE_SHRINK_ZOOM = 0.05;
const NEST_MIN_SCREEN_FONT = 10;

function getSafeZoom(){
  const state = typeof getState === 'function' ? getState() : null;
  if (!state) return 1;
  const zoom = Number(state.zoom);
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return zoom;
}

function updateLabelLayerScale(explicitZoom){
  const zoom = Number.isFinite(explicitZoom) && explicitZoom > 0 ? explicitZoom : getSafeZoom();
  if (labelLayer){
    const scale = zoom > 0 ? 1 / zoom : 1;
    labelLayer.scale.set(scale, scale);
  }
  return zoom;
}

function ensureZoomListener(){
  if (detachZoomListener || typeof addZoomListener !== 'function') return;
  detachZoomListener = addZoomListener((zoom) => {
    refreshLabelsForView(zoom);
  });
  refreshLabelsForView();
}

function refreshLabelsForView(explicitZoom){
  const zoom = updateLabelLayerScale(explicitZoom);
  if (!Array.isArray(currentLabelRecords) || !currentLabelRecords.length) return;
  for (const record of currentLabelRecords){
    applyZoomDependentStyles(record, zoom);
    positionLabel(record);
  }
  applySatelliteVisibility(currentLabelRecords);
}

export function ensureOverlay(world){
  if (overlayRoot) return overlayRoot;

  overlayRoot = new PIXI.Container();
  overlayRoot.name = 'overlay-root';
  overlayRoot.zIndex = Z_INDEX.OVERLAY_BASE;

  noEntryLayer = new PIXI.Container();
  noEntryLayer.name = 'overlay-noentry';

  shapeLayer = new PIXI.Container();
  shapeLayer.name = 'overlay-shapes';

  measurementLayer = new PIXI.Container();
  measurementLayer.name = 'overlay-measurements';

  targetLayer = new PIXI.Container();
  targetLayer.name = 'overlay-targets';

  labelLayer = new PIXI.Container();
  labelLayer.name = 'overlay-labels';
  labelLayer.zIndex = Z_INDEX.OVERLAY_LABELS;

  ensureZoomListener();

  overlayRoot.addChild(noEntryLayer);
  overlayRoot.addChild(shapeLayer);
  overlayRoot.addChild(measurementLayer);
  overlayRoot.addChild(targetLayer);
  overlayRoot.addChild(labelLayer);
  world.addChild(overlayRoot);

  redrawOverlay();
  return overlayRoot;
}

export function redrawOverlay(){
  if (!noEntryLayer || !shapeLayer || !labelLayer) return;
  if (targetLayer){
    targetLayer.removeChildren();
  }
  if (measurementLayer){
    measurementLayer.removeChildren();
  }
  noEntryLayer.removeChildren();
  shapeLayer.removeChildren();
  labelLayer.removeChildren();

  const labelRecords = [];

  for (const object of objectList){
    if (object.category === CATEGORY.NO_ENTRY){
      drawNoEntry(object);
      continue;
    }

    const coords = parseKey(object.key);
    if (!coords) continue;
    if (!isInsideWorld(coords.q, coords.r)) continue;
    const { x, y } = hexToWorld(coords.q, coords.r);
    const color = resolveColor(object);
    const isSelected = selectedKey && selectedKey === object.key;

    if (object.category === CATEGORY.FIXED){
      drawFixed(object, x, y, color, isSelected);
    } else if (object.category === CATEGORY.NEST){
      drawNest(object, x, y, color, isSelected);
    }

    if (object.name){
      drawLabel(object, x, y, labelRecords);
    }
  }
  drawTargets(labelRecords);
  drawMeasurement();
  drawSelectedHexOutline();
  currentLabelRecords = labelRecords;
  refreshLabelsForView();
}

export function setSelectedKey(key){
  selectedKey = key ?? null;
}

export function getSelectedKey(){
  return selectedKey;
}

export function setSelectedHex(key){
  selectedHexKey = key ?? null;
}

export function getSelectedHex(){
  return selectedHexKey;
}

export function setTargetMarkers(markers){
  if (!Array.isArray(markers)){
    targetMarkers = [];
  } else {
    targetMarkers = markers.map((marker) => ({
      key: marker?.key,
      label: marker?.label,
      name: marker?.name ?? null,
      color: marker?.color,
      fillAlpha: marker?.fillAlpha,
      borderColor: marker?.borderColor,
      borderAlpha: marker?.borderAlpha,
      borderWidth: marker?.borderWidth,
    }));
  }
  redrawOverlay();
}

export function setMeasurementData(data){
  const ready =
    overlayRoot && measurementLayer && labelLayer && shapeLayer && noEntryLayer && typeof redrawOverlay === 'function';
  if (
    !data ||
    !data.fromKey ||
    !data.toKey ||
    data.fromKey === data.toKey
  ){
    measurementData = null;
    if (ready){
      redrawOverlay();
    }
    return;
  }

  measurementData = {
    fromKey: String(data.fromKey),
    toKey: String(data.toKey),
    label: typeof data.label === 'string' ? data.label : '',
    lineColor: Number.isFinite(data.lineColor) ? data.lineColor : null,
    lineAlpha: Number.isFinite(data.lineAlpha) ? data.lineAlpha : null,
    lineWidth: Number.isFinite(data.lineWidth) ? data.lineWidth : null,
    markerRadius: Number.isFinite(data.markerRadius) ? data.markerRadius : null,
    markerColor: Number.isFinite(data.markerColor) ? data.markerColor : null,
    markerAlpha: Number.isFinite(data.markerAlpha) ? data.markerAlpha : null,
    labelFontSize: Number.isFinite(data.labelFontSize) ? data.labelFontSize : null,
    labelColor: Number.isFinite(data.labelColor) ? data.labelColor : null,
  };
  if (ready){
    redrawOverlay();
  }
}

function drawFixed(object, x, y, color, isSelected){
  const center = parseKey(object.key);
  if (!center) return;
  const baseColor = color ?? OBJECT_STYLE.palette.DEFAULT;
  const radiusHex = Math.max(0, Math.round(object.radiusHex ?? 0));

  const gfx = new PIXI.Graphics();
  gfx.lineStyle(0);
  renderHexArea(gfx, center.q, center.r, radiusHex, (cell) => {
    const fillAlpha = cell.distance === 0 ? 1 : 0.5;
    drawHexCell(gfx, cell.q, cell.r, baseColor, fillAlpha);
  });
  shapeLayer.addChild(gfx);

  if (isSelected){
    const highlight = new PIXI.Graphics();
    const expansion = HEX_METRICS.radius * 0.35;
    const highlightPoints = getHexPoints(x, y, HEX_METRICS.radius + expansion);
    const selectionStyle = resolveSelectionOutlineStyle();
    highlight.lineStyle({
      width: selectionStyle.width,
      color: selectionStyle.color,
      alpha: selectionStyle.alpha,
      alignment: 0.5,
      join: PIXI.LINE_JOIN.MITER,
      cap: PIXI.LINE_CAP.BUTT,
    });
    highlight.drawPolygon(highlightPoints);
    shapeLayer.addChild(highlight);
  }
}
function drawNest(object, x, y, color, isSelected){
  const center = parseKey(object.key);
  if (!center) return;
  const baseColor = OBJECT_STYLE.palette.NEST ?? 0x5a2a11;
  const accentColor = color ?? THEME.nest?.iff?.SELF ?? baseColor;
  const radiusHex = Math.max(0, Math.round(object.radiusHex ?? 0));
  const cells = gatherHexCells(center.q, center.r, radiusHex);

  const fillLayer = new PIXI.Graphics();
  fillLayer.lineStyle(0);
  for (const cell of cells){
    if (!isInsideWorld(cell.q, cell.r)) continue;
    const isCore = cell.distance === 0;
    let cellColor;
    if (isCore){
      cellColor = baseColor;
    } else if (cell.distance === 1){
      cellColor = baseColor;
    } else {
      cellColor = scaleColor(accentColor, nestOuterIntensity);
    }
    const fillAlpha = isCore ? 1 : nestOuterAlpha;
    drawHexCell(fillLayer, cell.q, cell.r, cellColor, fillAlpha);
  }
  shapeLayer.addChild(fillLayer);

  if (radiusHex > 0){
    const outerEdges = collectPerimeterEdges(cells);
    if (outerEdges.length){
      drawOuterHighlightLine(accentColor, outerEdges);
    }
  }

  // ネスト選択時の追加強調は行わない（検索結果表示と差異を発生させない）
}
function drawNoEntry(object){
  if (!noEntryLayer) return;

  const color = OBJECT_STYLE.palette.NO_ENTRY ?? OBJECT_STYLE.palette.DEFAULT;
  const noEntryStyle = OBJECT_STYLE.noEntry ?? {};
  const fillAlpha = noEntryStyle.fillAlpha ?? 0.3;
  const borderWidth = noEntryStyle.borderWidth ?? OBJECT_STYLE.strokeWidth ?? 2;

  const fill = new PIXI.Graphics();
  fill.lineStyle(0);

  let outline = null;

  const includeCell = (q, r) => {
    if (!isInsideWorld(q, r)) return;
    drawHexCell(fill, q, r, color, fillAlpha);
  };

  if (object.attrs?.rect){
    const { q0, r0, q1, r1 } = object.attrs.rect;
    const qMin = Math.min(q0, q1);
    const qMax = Math.max(q0, q1);
    const rMin = Math.min(r0, r1);
    const rMax = Math.max(r0, r1);
    for (let q = qMin; q <= qMax; q++){
      for (let r = rMin; r <= rMax; r++){
        includeCell(q, r);
      }
    }
  } else if (Array.isArray(object.attrs?.outer) && object.attrs.outer.length){
    const parsed = object.attrs.outer
      .map((key) => parseKey(key))
      .filter((coords) => coords && isInsideWorld(coords.q, coords.r));
    if (parsed.length >= 3){
      const halfWidth = HEX_METRICS.width / 2;
      const radius = HEX_METRICS.radius;

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (const coords of parsed){
        const center = hexToWorld(coords.q, coords.r);
        minX = Math.min(minX, center.x - halfWidth);
        maxX = Math.max(maxX, center.x + halfWidth);
        minY = Math.min(minY, center.y - radius);
        maxY = Math.max(maxY, center.y + radius);
      }

      if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minY) && Number.isFinite(maxY)){
        const width = maxX - minX;
        const height = maxY - minY;
        fill.beginFill(color, fillAlpha);
        fill.drawRect(minX, minY, width, height);
        fill.endFill();

        outline = new PIXI.Graphics();
        outline.lineStyle(borderWidth, color, OBJECT_STYLE.strokeAlpha);
        outline.drawPolygon([minX, minY, maxX, minY, maxX, maxY, minX, maxY]);
      }
    }
  } else {
    const coords = parseKey(object.key);
    if (coords){
      includeCell(coords.q, coords.r);
    }
  }

  noEntryLayer.addChild(fill);
  if (outline){
    noEntryLayer.addChild(outline);
  }
}

function drawTargets(labelRecords){
  if (!targetLayer || !Array.isArray(targetMarkers) || !targetMarkers.length) return;
  const targetStyle = OBJECT_STYLE.target ?? {};
  for (const marker of targetMarkers){
    const coords = parseKey(marker.key);
    if (!coords) continue;
    if (!isInsideWorld(coords.q, coords.r)) continue;

    const fillColor = Number.isFinite(marker.color)
      ? marker.color
      : targetStyle.fillColor ?? TARGET_DEFAULT_COLOR;
    const fillAlpha = clamp(
      Number.isFinite(marker.fillAlpha) ? marker.fillAlpha : targetStyle.fillAlpha ?? TARGET_DEFAULT_ALPHA,
      0,
      1
    );
    const borderColor = Number.isFinite(marker.borderColor)
      ? marker.borderColor
      : targetStyle.borderColor ?? fillColor;
    const borderAlpha = clamp(
      Number.isFinite(marker.borderAlpha) ? marker.borderAlpha : targetStyle.borderAlpha ?? TARGET_BORDER_ALPHA,
      0,
      1
    );
    const borderWidth =
      Number.isFinite(marker.borderWidth) && marker.borderWidth >= 0
        ? marker.borderWidth
        : targetStyle.borderWidth ?? TARGET_BORDER_WIDTH;

    const targetGraphic = new PIXI.Graphics();
    if (borderWidth > 0){
      targetGraphic.lineStyle(borderWidth, borderColor, borderAlpha);
    } else {
      targetGraphic.lineStyle(0);
    }
    drawHexCell(targetGraphic, coords.q, coords.r, fillColor, fillAlpha);
    targetLayer.addChild(targetGraphic);

    const displayLabel = String(
      (marker.name && String(marker.name).trim()) || (marker.label && String(marker.label).trim()) || ''
    ).trim();
    if (!displayLabel){
      continue;
    }

    const fontSize =
      Number.isFinite(targetStyle.labelFontSize) && targetStyle.labelFontSize > 0
        ? targetStyle.labelFontSize
        : OBJECT_STYLE.coordinateLabelFontSize ?? 16;
    const labelColor =
      Number.isFinite(targetStyle.labelColor) && targetStyle.labelColor >= 0
        ? targetStyle.labelColor
        : OBJECT_STYLE.label?.tint ?? 0xffffff;

    const { x, y } = hexToWorld(coords.q, coords.r);
    const text = new PIXI.Text(displayLabel, {
      fill: labelColor,
      fontSize,
      fontFamily: 'Segoe UI, Hiragino Sans, sans-serif',
      fontWeight: '600',
    });
    text.anchor.set(0.5, 0.5);
    text.zIndex = Z_INDEX.OVERLAY_LABELS;
    if (OBJECT_STYLE.label?.dropShadow){
      text.dropShadow = true;
      text.dropShadowDistance = OBJECT_STYLE.label.dropShadowDistance;
      text.dropShadowBlur = OBJECT_STYLE.label.dropShadowBlur;
      text.dropShadowAngle = Math.PI / 2;
      text.dropShadowColor = OBJECT_STYLE.label.dropShadowColor;
    }
    labelLayer.addChild(text);

    const record = registerLabelRecord(labelRecords, {
      object: { category: TARGET_CATEGORY, key: marker.key },
      text,
      worldX: snap05(x),
      worldY: snap05(y),
      anchorX: 0.5,
      anchorY: 0.5,
      baseFontSize: fontSize,
      baseScale: text.scale?.x ?? 1,
    });
    applyZoomDependentStyles(record, getSafeZoom());
    positionLabel(record);
  }
}

function drawMeasurement(){
  if (!measurementLayer || !measurementData) return;

  const fromCoords = parseKey(measurementData.fromKey);
  const toCoords = parseKey(measurementData.toKey);
  if (!fromCoords || !toCoords) return;
  if (!isInsideWorld(fromCoords.q, fromCoords.r)) return;
  if (!isInsideWorld(toCoords.q, toCoords.r)) return;

  const measurementStyle = OBJECT_STYLE.measurement ?? {};

  const fromWorld = hexToWorld(fromCoords.q, fromCoords.r);
  const toWorld = hexToWorld(toCoords.q, toCoords.r);

  const startX = snap05(fromWorld.x);
  const startY = snap05(fromWorld.y);
  const endX = snap05(toWorld.x);
  const endY = snap05(toWorld.y);

  const lineWidth = Number.isFinite(measurementData.lineWidth)
    ? measurementData.lineWidth
    : measurementStyle.lineWidth ?? MEASUREMENT_DEFAULT_WIDTH;
  const lineColor = Number.isFinite(measurementData.lineColor)
    ? measurementData.lineColor
    : measurementStyle.lineColor ?? MEASUREMENT_DEFAULT_COLOR;
  const lineAlpha = clamp(
    Number.isFinite(measurementData.lineAlpha)
      ? measurementData.lineAlpha
      : measurementStyle.lineAlpha ?? MEASUREMENT_DEFAULT_ALPHA,
    0,
    1
  );

  const line = new PIXI.Graphics();
  line.lineStyle({
    width: lineWidth,
    color: lineColor,
    alpha: lineAlpha,
    alignment: 0.5,
    join: PIXI.LINE_JOIN.ROUND,
    cap: PIXI.LINE_CAP.ROUND,
  });
  line.moveTo(startX, startY);
  line.lineTo(endX, endY);
  measurementLayer.addChild(line);
}

function drawLabel(object, x, y, labelRecords){
  const style = OBJECT_STYLE.label;
  const isNest = object.category === CATEGORY.NEST;
  const isSatellite = object.category === CATEGORY.FIXED && object.type === 'satellite';
  const objectType = object.type;
  const coords = parseKey(object.key);

  let fontSize = style.fontSize;
  let anchorX = 0.5;
  let anchorY = 0.5;
  const labelX = snap05(x);
  let labelY = snap05(y);

  if (isNest){
    fontSize = OBJECT_STYLE.nestLabelFontSize ?? fontSize;
    anchorY = 0.5;
    labelY = snap05(y);
  } else {
    if (objectType === 'tenebris'){
      fontSize = OBJECT_STYLE.tenebrisLabelFontSize ?? fontSize;
    } else if (objectType === 'planet'){
      fontSize = OBJECT_STYLE.planetLabelFontSize ?? fontSize;
    }
  }

  if (isSatellite){
    fontSize = OBJECT_STYLE.satelliteLabelFontSize ?? fontSize;
    anchorY = 0;
    labelY = snap05(y + HEX_METRICS.radius + (OBJECT_STYLE.satelliteLabelOffset ?? 16));
  }

  const text = new PIXI.Text(object.name, {
    fill: style.tint,
    fontSize,
    fontFamily: 'Segoe UI, Hiragino Sans, sans-serif',
  });
  text.anchor.set(anchorX, anchorY);
  text.zIndex = Z_INDEX.OVERLAY_LABELS;
  if (style.dropShadow){
    text.dropShadow = true;
    text.dropShadowDistance = style.dropShadowDistance;
    text.dropShadowBlur = style.dropShadowBlur;
    text.dropShadowAngle = Math.PI / 2;
    text.dropShadowColor = style.dropShadowColor;
  }
  labelLayer.addChild(text);

  const record = registerLabelRecord(labelRecords, {
    object,
    text,
    worldX: labelX,
    worldY: labelY,
    anchorX,
    anchorY,
    isSatellite,
    baseFontSize: fontSize,
    baseScale: text.scale?.x ?? 1,
  });

  if ((isNest || objectType === 'planet') && coords){
    const coordinateLabel = formatCoordinateLabel(coords);
    if (coordinateLabel){
      const coordinateFontSize = OBJECT_STYLE.coordinateLabelFontSize ?? fontSize;
      const coordinateGap = OBJECT_STYLE.coordinateLabelGap ?? 4;
      const coordinate = new PIXI.Text(coordinateLabel, {
        fill: style.tint,
        fontSize: coordinateFontSize,
        fontFamily: 'Segoe UI, Hiragino Sans, sans-serif',
      });
      coordinate.anchor.set(0.5, 0);
      coordinate.zIndex = Z_INDEX.OVERLAY_LABELS;
      if (style.dropShadow){
        coordinate.dropShadow = true;
        coordinate.dropShadowDistance = style.dropShadowDistance;
        coordinate.dropShadowBlur = style.dropShadowBlur;
        coordinate.dropShadowAngle = Math.PI / 2;
        coordinate.dropShadowColor = style.dropShadowColor;
      }
      labelLayer.addChild(coordinate);
      attachCoordinateLabel(record, coordinate, coordinateGap, coordinateFontSize);
    }
  }

  applyZoomDependentStyles(record, getSafeZoom());
  positionLabel(record);
}

function registerLabelRecord(records, params){
  if (!Array.isArray(records)) return null;
  const record = {
    object: params.object,
    text: params.text,
    worldX: params.worldX,
    worldY: params.worldY,
    anchorX: params.anchorX,
    anchorY: params.anchorY,
    isSatellite: Boolean(params.isSatellite),
    coordinate: null,
    screenX: 0,
    screenY: 0,
    baseFontSize: params.baseFontSize,
    baseScale: params.baseScale ?? 1,
  };
  records.push(record);
  return record;
}

function attachCoordinateLabel(record, coordinateText, gap, baseFontSize){
  if (!record || !coordinateText) return;
  record.coordinate = {
    text: coordinateText,
    anchorX: coordinateText.anchor?.x ?? 0.5,
    anchorY: coordinateText.anchor?.y ?? 0,
    gap: Number.isFinite(gap) ? gap : 4,
    screenX: 0,
    screenY: 0,
    baseFontSize,
    baseScale: coordinateText.scale?.x ?? 1,
  };
}

function positionLabel(record){
  if (!record?.text) return;
  const state = typeof getState === 'function' ? getState() : null;
  const screen = worldToScreen(record.worldX, record.worldY);
  const anchorY = Number.isFinite(record.anchorY) ? record.anchorY : record.text.anchor?.y ?? 0;
  const textHeight = record.text.height ?? 0;

  const baseScreenX = screen.x;
  let baseScreenY = screen.y;

  const coordinateVisible = record.coordinate?.text && record.coordinate.text.visible !== false;

  if (coordinateVisible){
    const coordHeight = record.coordinate.text.height ?? 0;
    const gap = record.coordinate.gap ?? 0;
    const top = baseScreenY - textHeight * anchorY;
    const mainBottom = baseScreenY + textHeight * (1 - anchorY);
    const combinedBottom = mainBottom + gap + coordHeight;
    const combinedCenter = (top + combinedBottom) * 0.5;
    const offset = baseScreenY - combinedCenter;
    baseScreenY += offset;
  }

  record.screenX = baseScreenX;
  record.screenY = baseScreenY;

  const worldOffsetX = state?.world?.x ?? 0;
  const worldOffsetY = state?.world?.y ?? 0;
  record.text.x = snap05(baseScreenX - worldOffsetX);
  record.text.y = snap05(baseScreenY - worldOffsetY);

  if (record.coordinate){
    positionCoordinate(record);
  }
}

function positionCoordinate(record){
  const coordinate = record.coordinate;
  if (!coordinate?.text || coordinate.text.visible === false) return;
  const state = typeof getState === 'function' ? getState() : null;
  const worldOffsetX = state?.world?.x ?? 0;
  const worldOffsetY = state?.world?.y ?? 0;

  const anchorY = Number.isFinite(record.anchorY) ? record.anchorY : record.text.anchor?.y ?? 0;
  const baseHeight = record.text.height ?? 0;
  const baseBottom = record.screenY + baseHeight * (1 - anchorY);

  coordinate.screenX = record.screenX;
  coordinate.screenY = baseBottom + (coordinate.gap ?? 0);
  coordinate.text.x = snap05(coordinate.screenX - worldOffsetX);
  coordinate.text.y = snap05(coordinate.screenY - worldOffsetY);
}

function applyZoomDependentStyles(record, zoom){
  if (!record?.text) return;
  const object = record.object;
  const baseScale = record.baseScale ?? 1;
  const baseFontSize = record.baseFontSize ?? record.text.style?.fontSize ?? 14;
  const effectiveZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : getSafeZoom();

  const isNest = object?.category === CATEGORY.NEST;
  const isTenebris = object?.category === CATEGORY.FIXED && object?.type === 'tenebris';
  const isPlanet = object?.category === CATEGORY.FIXED && object?.type === 'planet';

  if (isNest){
    const showCoordinate = effectiveZoom > NEST_COORD_HIDE_ZOOM;
    if (record.coordinate?.text){
      record.coordinate.text.visible = showCoordinate;
      const coordBaseScale =
        record.coordinate.baseScale ?? record.coordinate.text.scale?.x ?? 1;
      if (Math.abs(record.coordinate.text.scale.x - coordBaseScale) > 1e-3){
        record.coordinate.text.scale.set(coordBaseScale, coordBaseScale);
      }
    }

    applyScaleWithMinimum(record.text, baseScale, baseFontSize, effectiveZoom);
  } else {
    if (Math.abs(record.text.scale.x - baseScale) > 1e-3){
      record.text.scale.set(baseScale, baseScale);
    }
    const coordinateVisible = !isPlanet || effectiveZoom > NEST_COORD_HIDE_ZOOM;
    handleCoordinateVisibility(record, coordinateVisible, effectiveZoom, isPlanet);
    if (isTenebris || isPlanet){
      applyScaleWithMinimum(
        record.text,
        baseScale,
        baseFontSize,
        effectiveZoom,
        NEST_MIN_SCREEN_FONT
      );
    }
  }
}

function handleCoordinateVisibility(record, visible, effectiveZoom, isPlanet){
  if (!record?.coordinate?.text) return;
  record.coordinate.text.visible = visible;
  const coordBaseScale = record.coordinate.baseScale ?? record.coordinate.text.scale?.x ?? 1;
  const coordBaseFontSize = record.coordinate.baseFontSize ?? record.coordinate.text.style?.fontSize ?? 14;

  if (!visible){
    if (Math.abs(record.coordinate.text.scale.x - coordBaseScale) > 1e-3){
      record.coordinate.text.scale.set(coordBaseScale, coordBaseScale);
    }
    return;
  }

  let minFont = NEST_MIN_SCREEN_FONT;
  if (isPlanet){
    minFont = 8;
  }

  applyScaleWithMinimum(
    record.coordinate.text,
    coordBaseScale,
    coordBaseFontSize,
    effectiveZoom,
    minFont
  );
}

function applyScaleWithMinimum(text, baseScale, baseFontSize, effectiveZoom, targetMinFont = NEST_MIN_SCREEN_FONT){
  if (!text) return;
  let scaleFactor = baseScale;
  if (effectiveZoom <= NEST_SCALE_SHRINK_ZOOM){
    const ratio = effectiveZoom > 0 ? effectiveZoom / NEST_SCALE_SHRINK_ZOOM : 0;
    const minScale = baseFontSize > 0 ? targetMinFont / baseFontSize : 0;
    scaleFactor = clamp(ratio, minScale, baseScale);
  }
  if (Math.abs(text.scale.x - scaleFactor) > 1e-3){
    text.scale.set(scaleFactor, scaleFactor);
  }
}

function resolveColor(object){
  if (object.category === CATEGORY.NEST){
    const key = object.iff ?? 'NEUT';
    return THEME.nest.iff[key] ?? OBJECT_STYLE.palette.NEST ?? OBJECT_STYLE.palette.DEFAULT;
  }
  if (object.category === CATEGORY.FIXED){
    if (object.style && OBJECT_STYLE.palette[object.style]){
      return OBJECT_STYLE.palette[object.style];
    }
    return OBJECT_STYLE.palette.FIXED ?? OBJECT_STYLE.palette.DEFAULT;
  }
  if (object.category === CATEGORY.NO_ENTRY){
    return OBJECT_STYLE.palette.NO_ENTRY ?? OBJECT_STYLE.palette.DEFAULT;
  }
  return OBJECT_STYLE.palette.DEFAULT;
}

function resolveSelectionOutlineStyle(){
  const selectionStyle = OBJECT_STYLE.selection ?? {};
  const color =
    selectionStyle.color ??
    THEME.selection?.color ??
    THEME.crossColor ??
    OBJECT_STYLE.palette.DEFAULT;
  const width = selectionStyle.borderWidth ?? Math.max(OBJECT_STYLE.strokeWidth ?? 2, 2);
  const alpha = selectionStyle.alpha ?? 1;
  return { color, width, alpha };
}

function drawSelectedHexOutline(){
  if (!shapeLayer || !selectedHexKey) return;
  const coords = parseKey(selectedHexKey);
  if (!coords) return;
  if (!isInsideWorld(coords.q, coords.r)) return;
  const { x, y } = hexToWorld(coords.q, coords.r);
  const selectionStyle = resolveSelectionOutlineStyle();
  const outline = new PIXI.Graphics();
  outline.lineStyle({
    width: selectionStyle.width,
    color: selectionStyle.color,
    alpha: selectionStyle.alpha,
    alignment: 0.5,
    join: PIXI.LINE_JOIN.MITER,
    cap: PIXI.LINE_CAP.BUTT,
  });
  const points = getHexPoints(x, y, HEX_METRICS.radius);
  outline.drawPolygon(points);
  shapeLayer.addChild(outline);
}

function getHexPoints(cx, cy, radius){
  const coords = [];
  for (let i = 0; i < 6; i++){
    const angle = (Math.PI / 180) * (60 * i - 30);
    coords.push(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
  }
  return coords;
}

function getCanonicalEdgeKey(p1, p2){
  if (p1.x < p2.x || (p1.x === p2.x && p1.y <= p2.y)){
    return `${Number(p1.x).toFixed(3)},${Number(p1.y).toFixed(3)}|${Number(p2.x).toFixed(3)},${Number(p2.y).toFixed(3)}`;
  }
  return `${Number(p2.x).toFixed(3)},${Number(p2.y).toFixed(3)}|${Number(p1.x).toFixed(3)},${Number(p1.y).toFixed(3)}`;
}

function parseKey(key){
  const match = /^(\d+):(\d+)$/.exec(String(key));
  if (!match) return null;
  return { q: Number(match[1]), r: Number(match[2]) };
}

function applySatelliteVisibility(records){
  if (!Array.isArray(records) || !records.length) return;
  const satelliteRecords = records.filter((record) => record.isSatellite && record.text);
  const tenebrisRecords = records.filter(
    (record) =>
      record.object?.category === CATEGORY.FIXED &&
      record.object?.type === 'tenebris' &&
      record.text
  );
  if (!satelliteRecords.length && !tenebrisRecords.length) return;

  for (const sat of satelliteRecords){
    if (sat.text) sat.text.visible = true;
    if (sat.coordinate?.text) sat.coordinate.text.visible = true;
  }

  const boundsCache = new Map();
  const getBoundsForRecord = (record) => {
    if (boundsCache.has(record)) return boundsCache.get(record);
    const bounds = computeRecordBounds(record);
    boundsCache.set(record, bounds);
    return bounds;
  };

  let overlapDetected = false;
  for (const sat of satelliteRecords){
    const satBounds = getBoundsForRecord(sat);
    if (!satBounds) continue;
    for (const other of records){
      if (other === sat) continue;
      const otherBounds = getBoundsForRecord(other);
      if (!otherBounds) continue;
      if (rectsOverlap(satBounds, otherBounds)){
        overlapDetected = true;
        break;
      }
    }
    if (overlapDetected) break;
  }

  if (overlapDetected){
    for (const sat of satelliteRecords){
      if (sat.text) sat.text.visible = false;
      if (sat.coordinate?.text) sat.coordinate.text.visible = false;
    }
  }

  for (const tenebris of tenebrisRecords){
    if (!tenebris.text) continue;
    const tenebrisBounds = getBoundsForRecord(tenebris);
    if (!tenebrisBounds) continue;
    let tenebrisOverlap = false;
    for (const other of records){
      if (!other?.text || other === tenebris) continue;
      if (other.isSatellite) continue;
      if (other.object?.category === CATEGORY.FIXED && other.object?.type === 'tenebris'){
        if (other !== tenebris){
          const otherBounds = getBoundsForRecord(other);
          if (otherBounds && rectsOverlap(tenebrisBounds, otherBounds)){
            tenebrisOverlap = true;
            break;
          }
        }
        continue;
      }
      const otherBounds = getBoundsForRecord(other);
      if (!otherBounds) continue;
      if (rectsOverlap(tenebrisBounds, otherBounds)){
        tenebrisOverlap = true;
        break;
      }
    }
    if (tenebrisOverlap){
      tenebris.text.visible = false;
      if (tenebris.coordinate?.text) tenebris.coordinate.text.visible = false;
    } else {
      tenebris.text.visible = true;
      if (tenebris.coordinate?.text) tenebris.coordinate.text.visible = true;
    }
  }

}

function computeRecordBounds(record){
  if (!record) return null;
  const boxes = [];
  const mainBox = computeTextBounds(
    record.text,
    record.screenX,
    record.screenY,
    record.anchorX,
    record.anchorY
  );
  if (mainBox) boxes.push(mainBox);
  if (record.coordinate?.text){
    const coordBox = computeTextBounds(
      record.coordinate.text,
      record.coordinate.screenX,
      record.coordinate.screenY,
      record.coordinate.anchorX,
      record.coordinate.anchorY
    );
    if (coordBox) boxes.push(coordBox);
  }
  if (!boxes.length) return null;
  return boxes.reduce((acc, box) => {
    if (!acc) return { ...box };
    return {
      left: Math.min(acc.left, box.left),
      right: Math.max(acc.right, box.right),
      top: Math.min(acc.top, box.top),
      bottom: Math.max(acc.bottom, box.bottom),
    };
  }, null);
}

function computeTextBounds(text, screenX, screenY, anchorX, anchorY){
  if (!text || !Number.isFinite(screenX) || !Number.isFinite(screenY)) return null;
  const width = text.width ?? 0;
  const height = text.height ?? 0;
  const ax = Number.isFinite(anchorX) ? anchorX : text.anchor?.x ?? 0;
  const ay = Number.isFinite(anchorY) ? anchorY : text.anchor?.y ?? 0;
  const left = screenX - width * ax;
  const top = screenY - height * ay;
  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
  };
}

function rectsOverlap(a, b){
  if (!a || !b) return false;
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function formatCoordinateLabel(coords){
  if (!coords) return '';
  const q = pad3(coords.q);
  const r = pad3(coords.r);
  return `[${q}:${r}]`;
}

function pad3(value){
  const n = Number.isFinite(value) ? Math.max(0, Math.min(999, Math.round(value))) : 0;
  return String(n).padStart(3, '0');
}

function renderHexArea(graphics, centerQ, centerR, radius, visitor){
  const maxRadius = Math.max(0, radius);
  const cells = gatherHexCells(centerQ, centerR, maxRadius);
  for (const cell of cells){
    if (!isInsideWorld(cell.q, cell.r)) continue;
    visitor(cell);
  }
}

function gatherHexCells(centerQ, centerR, radius){
  const results = [];
  const centerCube = oddrToCube(centerQ, centerR);
  for (let dx = -radius; dx <= radius; dx++){
    for (let dy = Math.max(-radius, -dx - radius); dy <= Math.min(radius, -dx + radius); dy++){
      const dz = -dx - dy;
      const cube = {
        x: centerCube.x + dx,
        y: centerCube.y + dy,
        z: centerCube.z + dz,
      };
      const distance = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
      const offset = cubeToOddr(cube.x, cube.z);
      results.push({ q: offset.q, r: offset.r, distance });
    }
  }
  return results;
}

function drawHexCell(graphics, q, r, color, alpha){
  const center = hexToWorld(q, r);
  const points = getHexPoints(center.x, center.y, HEX_METRICS.radius);
  graphics.beginFill(color, alpha);
  graphics.drawPolygon(points);
  graphics.endFill();
}

function scaleColor(color, factor){
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

function isInsideWorld(q, r){
  return (
    q >= WORLD_BOUNDS.minQ &&
    q <= WORLD_BOUNDS.maxQ &&
    r >= WORLD_BOUNDS.minR &&
    r <= WORLD_BOUNDS.maxR
  );
}

function oddrToCube(q, r){
  const x = q - (r - (r & 1)) / 2;
  const z = r;
  const y = -x - z;
  return { x, y, z };
}

function cubeToOddr(x, z){
  const r = z;
  const q = x + (z - (z & 1)) / 2;
  return { q, r };
}

function edgeKey(start, end){
  const ax = Number(start.x).toFixed(3);
  const ay = Number(start.y).toFixed(3);
  const bx = Number(end.x).toFixed(3);
  const by = Number(end.y).toFixed(3);
  return `${ax},${ay}|${bx},${by}`;
}

function collectPerimeterEdges(cells){
  const edgeData = new Map();

  for (const cell of cells){
    if (!isInsideWorld(cell.q, cell.r)) continue;
    const center = hexToWorld(cell.q, cell.r);
    const corners = getHexPoints(center.x, center.y, HEX_METRICS.radius);

    for (let i = 0; i < 6; i++){
      const startIdx = i * 2;
      const endIdx = ((i + 1) % 6) * 2;
      const p1 = { x: corners[startIdx], y: corners[startIdx + 1] };
      const p2 = { x: corners[endIdx], y: corners[endIdx + 1] };
      const key = getCanonicalEdgeKey(p1, p2);

      if (edgeData.has(key)){
        edgeData.get(key).count++;
      } else {
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const normalVec = { x: mid.x - center.x, y: mid.y - center.y };
        const length = Math.hypot(normalVec.x, normalVec.y) || 1;
        normalVec.x /= length;
        normalVec.y /= length;
        edgeData.set(key, {
          count: 1,
          edge: { start: p1, end: p2, normal: normalVec },
        });
      }
    }
  }

  const perimeter = [];
  for (const entry of edgeData.values()){
    if (entry.count === 1){
      perimeter.push(entry.edge);
    }
  }
  return perimeter;
}
const MIN_OUTER_MARGIN = 0.5;
const NORMAL_EPSILON = 1e-6;

function drawOuterHighlightLine(color, edges){
  const borderAlpha = OBJECT_STYLE.nest.borderAlpha ?? 1;
  const borderWidth = OBJECT_STYLE.nest.borderWidth ?? 2;
  const highlightWidth =
    OBJECT_STYLE.nest.highlightWidth ?? Math.max(borderWidth * 1.75, 3);
  if (!edges.length || borderAlpha <= 0) return;

  const highlightMargin = Math.max(
    OBJECT_STYLE.nest.highlightOffset ?? MIN_OUTER_MARGIN,
    MIN_OUTER_MARGIN
  );
  const highlightDistance = highlightMargin + highlightWidth * 0.5;
  const highlightColorScale = clamp(OBJECT_STYLE.nest.highlightColorScale ?? 1.2, 0, 2);
  const highlightColor =
    highlightColorScale !== 1 ? scaleColor(color, highlightColorScale) : color;

  const loops = buildEdgeLoops(edges);
  if (!loops.length){
    drawOuterHighlightSegments({
      highlightColor,
      borderAlpha,
      highlightWidth,
      highlightDistance,
      borderWidth,
      baseColor: color,
      edges,
    });
    return;
  }

  const highlight = new PIXI.Graphics();
  highlight.lineStyle({
    width: highlightWidth,
    color: highlightColor,
    alpha: borderAlpha,
    alignment: 0.5,
    join: PIXI.LINE_JOIN.MITER,
    cap: PIXI.LINE_CAP.BUTT,
  });

  const border = new PIXI.Graphics();
  border.lineStyle({
    width: borderWidth,
    color,
    alpha: borderAlpha,
    alignment: 0,
    join: PIXI.LINE_JOIN.MITER,
    cap: PIXI.LINE_CAP.BUTT,
  });

  for (const segments of loops){
    if (!segments || segments.length < 2) continue;
    const vertices = segmentsToVertices(segments);
    if (vertices.length < 3) continue;

    // Draw border along original perimeter.
    drawRing(border, vertices);

    const vertexNormals = computeVertexNormals(segments);
    const highlightVertices = offsetVerticesByNormals(vertices, vertexNormals, highlightDistance);
    drawRing(highlight, highlightVertices);
  }

  shapeLayer.addChild(border);
  shapeLayer.addChild(highlight);
}

function drawOuterHighlightSegments({
  highlightColor,
  borderAlpha,
  highlightWidth,
  highlightDistance,
  borderWidth,
  baseColor,
  edges,
}){
  const highlight = new PIXI.Graphics();
  highlight.lineStyle({
    width: highlightWidth,
    color: highlightColor,
    alpha: borderAlpha,
    alignment: 0.5,
    join: PIXI.LINE_JOIN.MITER,
    cap: PIXI.LINE_CAP.BUTT,
  });

  const border = new PIXI.Graphics();
  border.lineStyle({
    width: borderWidth,
    color: baseColor,
    alpha: borderAlpha,
    alignment: 0,
    join: PIXI.LINE_JOIN.MITER,
    cap: PIXI.LINE_CAP.BUTT,
  });

  for (const edge of edges){
    const highlightOffsetX = edge.normal.x * highlightDistance;
    const highlightOffsetY = edge.normal.y * highlightDistance;

    highlight.moveTo(edge.start.x + highlightOffsetX, edge.start.y + highlightOffsetY);
    highlight.lineTo(edge.end.x + highlightOffsetX, edge.end.y + highlightOffsetY);

    border.moveTo(edge.start.x, edge.start.y);
    border.lineTo(edge.end.x, edge.end.y);
  }

  shapeLayer.addChild(border);
  shapeLayer.addChild(highlight);
}

function buildEdgeLoops(edges){
  if (!edges.length) return [];

  const loops = [];
  const vertexMap = new Map();
  const visited = new Set();
  const guardLimit = edges.length * 2;

  edges.forEach((edge, index) => {
    edge.__id = index;
    const startKey = formatPointKey(edge.start);
    const endKey = formatPointKey(edge.end);
    addVertexConnection(vertexMap, startKey, { edge, forward: true });
    addVertexConnection(vertexMap, endKey, { edge, forward: false });
  });

  for (const edge of edges){
    if (visited.has(edge.__id)) continue;
    const forwardResult = traceLoop(edge, true, vertexMap, guardLimit);
    if (forwardResult){
      loops.push(forwardResult.segments);
      forwardResult.ids.forEach((id) => visited.add(id));
      continue;
    }
    const backwardResult = traceLoop(edge, false, vertexMap, guardLimit);
    if (backwardResult){
      loops.push(backwardResult.segments);
      backwardResult.ids.forEach((id) => visited.add(id));
    }
  }

  return loops;
}

function traceLoop(startEdge, forward, vertexMap, guardLimit){
  const segments = [];
  const usedIds = new Set();
  let currentEdge = startEdge;
  let currentForward = forward;
  const startPoint = currentForward ? currentEdge.start : currentEdge.end;
  const startKey = formatPointKey(startPoint);

  let guard = 0;
  while (++guard <= guardLimit){
    const segmentStart = currentForward ? currentEdge.start : currentEdge.end;
    const segmentEnd = currentForward ? currentEdge.end : currentEdge.start;
    const segmentNormal = currentForward ? currentEdge.normal : negateVector(currentEdge.normal);

    segments.push(makeSegment(segmentStart, segmentEnd, segmentNormal));
    usedIds.add(currentEdge.__id);

    const nextKey = formatPointKey(segmentEnd);
    if (nextKey === startKey){
      return { segments, ids: Array.from(usedIds) };
    }

    const connections = vertexMap.get(nextKey);
    if (!connections || !connections.length) break;

    let nextEntry = null;
    for (const entry of connections){
      if (entry.edge.__id === currentEdge.__id) continue;
      if (usedIds.has(entry.edge.__id)) continue;
      nextEntry = entry;
      break;
    }

    if (!nextEntry){
      break;
    }

    currentEdge = nextEntry.edge;
    currentForward = nextEntry.forward;
  }

  return null;
}

function addVertexConnection(map, key, entry){
  if (!map.has(key)){
    map.set(key, []);
  }
  map.get(key).push(entry);
}

function makeSegment(start, end, normal){
  return {
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    normal: { x: normal.x, y: normal.y },
  };
}

function negateVector(vector){
  return { x: -vector.x, y: -vector.y };
}

function segmentsToVertices(segments){
  const vertices = [];
  for (const segment of segments){
    vertices.push({ x: segment.start.x, y: segment.start.y });
  }
  return vertices;
}

function computeVertexNormals(segments){
  const count = segments.length;
  const normals = new Array(count);
  for (let i = 0; i < count; i++){
    const prev = segments[(i - 1 + count) % count].normal;
    const curr = segments[i].normal;
    const sumX = prev.x + curr.x;
    const sumY = prev.y + curr.y;
    const length = Math.hypot(sumX, sumY);
    if (length <= NORMAL_EPSILON){
      normals[i] = { x: curr.x, y: curr.y };
    } else {
      normals[i] = { x: sumX / length, y: sumY / length };
    }
  }
  return normals;
}

function offsetVerticesByNormals(vertices, vertexNormals, distance){
  return vertices.map((vertex, index) => ({
    x: vertex.x + vertexNormals[index].x * distance,
    y: vertex.y + vertexNormals[index].y * distance,
  }));
}

function drawRing(graphics, vertices){
  if (!vertices.length) return;
  const points = [];
  for (const vertex of vertices){
    points.push(vertex.x, vertex.y);
  }
  graphics.drawPolygon(points);
}

function formatPointKey(point){
  return `${Number(point.x).toFixed(3)},${Number(point.y).toFixed(3)}`;
}

export function setNestOuterStyle({ intensity, alpha } = {}){
  if (Number.isFinite(intensity)){
    nestOuterIntensity = clamp(intensity, 0, 2);
  }
  if (Number.isFinite(alpha)){
    nestOuterAlpha = clamp(alpha, 0, 1);
  }
  return getNestOuterStyle();
}

export function getNestOuterStyle(){
  return {
    intensity: nestOuterIntensity,
    alpha: nestOuterAlpha,
  };
}






