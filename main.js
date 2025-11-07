/* =============================================================================
 * Project : アストロキングス - 蠱毒な銀河へようこそ！
 * File    : main.js
* Version : Ver. 0.02 / Rev. 019
* Date    : 2025-10-18 (土)
 * Library : -
 * Function: PIXI 初期化と HUD/グリッド統合・操作イベント制御
 * Notes   :
 *   - ★本改修: ズーム操作時に倍率をHUDステータスへ表示。
 *   - ★本改修: クロスヘア移動ではステータスを更新せず Ready を維持。
 *   - ★本改修: 検索を表示専用に整理し、弾着計算メニューで発地点/着弾点入力と距離算出・結果表示を統合。
 * =============================================================================
 */

import { APP, STRIKE } from './map-config.js';
import {
  ensureGrid,
  updateGrid,
  setDecimateStartZ,
  setDecimateGamma,
  getDecimateConfig,
} from './map-hexgrid.js';
import { ensureHUD, updateHUD, setCrosshairPosition } from './map-hud.js';
import {
  ensureOverlay,
  redrawOverlay,
  setSelectedKey,
  setSelectedHex,
  getSelectedHex,
  setTargetMarkers,
  setMeasurementData,
  setNestOuterStyle,
  getNestOuterStyle,
} from './map-overlay.js';
import {
  WORLD_BOUNDS,
  attach,
  endDrag,
  focusOnHex,
  focusOnStandardCenter,
  getStandardCenter,
  getState,
  screenToWorld,
  startDrag,
  worldToHex,
  zoomBy,
  setZoom,
  dragTo,
  worldToScreen,
  hexToWorld,
  getFitZoom,
} from './map-core.js';
import objectList from './map-object.js';

const CONFIG_IMPACT_DEFAULT_SECONDS = STRIKE?.impact?.defaultSeconds;
const IMPACT_DEFAULT_SECONDS = Number.isFinite(CONFIG_IMPACT_DEFAULT_SECONDS) ? CONFIG_IMPACT_DEFAULT_SECONDS : 40 * 60;
const IMPACT_MAX_SECONDS = 99 * 60 + 59;
const DEFAULT_STRIKE_SECONDS_PER_HEX = Object.freeze({
  planet: 1.128697,
  pvp: 1.1175,
  base: 1.23,
  satellite: 1.53,
});
const STRIKE_SECONDS_PER_HEX = (STRIKE && STRIKE.secondsPerHex) ? STRIKE.secondsPerHex : DEFAULT_STRIKE_SECONDS_PER_HEX;
const RALLY_BUTTON_LABEL = '集結カウント';
const DEFAULT_MARCH_ADJUSTMENT_SECONDS = -1;
const MARCH_ADJUSTMENT_SECONDS = Number.isFinite(STRIKE?.marchAdjustmentSeconds)
  ? STRIKE.marchAdjustmentSeconds
  : DEFAULT_MARCH_ADJUSTMENT_SECONDS;

const DOM_IDS = Object.freeze({
  app: 'app',
  status: 'status',
  cursor: 'cursor',
  topPanel: 'top-panel',
  panelDrawerToggle: 'panelDrawerToggle',
  panelBody: 'panel-body',
  mobileMenuButton: 'mobileMenuButton',
  btnFit: 'btnFit',
  btnStd: 'btnStd',
  btnSearch: 'btnSearch',
  btnClear: 'btnClear',
  kw: 'kw',
  distanceFrom: 'distanceFrom',
  distanceTo: 'distanceTo',
  btnDistance: 'btnDistance',
  btnRallyCountdown: 'btnRallyCountdown',
  distanceResult: 'distanceResult',
  ballisticToggle: 'ballisticToggle',
  ballisticSection: 'ballisticSection',
  btnNestInside: 'btnNestInside',
  btnNestOutside: 'btnNestOutside',
  btnRally5: 'btnRally5',
  btnRally10: 'btnRally10',
  btnRally15: 'btnRally15',
  btnRally30: 'btnRally30',
  btnTargetPlanet: 'btnTargetPlanet',
  btnTargetSatellite: 'btnTargetSatellite',
  btnTargetBase: 'btnTargetBase',
  btnTargetPvp: 'btnTargetPvp',
  marchTime: 'marchTime',
  impactTime: 'impactTime',
  btnTimeAdjust: 'btnTimeAdjust',
  rallyPopup: 'rallyPopup',
  rallyPopupTimer: 'rallyPopupTimer',
  rallyPopupTarget: 'rallyPopupTarget',
  rallyPopupCountdownLabel: 'rallyPopupCountdownLabel',
  btnRallyPopupClose: 'btnRallyPopupClose',
});

const dom = resolveDomRefs(DOM_IDS);
const state = {
  app: null,
  world: null,
  updateScheduled: false,
  pointerActive: false,
  pointerMoved: false,
  lastPointer: { x: 0, y: 0 },
  ballisticExpanded: false,
  nestMode: 'inside',
  marchDistanceHex: null,
  marchSeconds: null,
  marchTimeLabel: '00:00,00',
  distanceContext: null,
  rallyMinutes: 5,
  rallyCountdownSeconds: null,
  rallyTimerId: null,
  rallyContext: null,
  rallyCountdownMode: 'idle',
  strikeTarget: 'planet',
  impactSeconds: IMPACT_DEFAULT_SECONDS,
  impactTimerId: null,
  impactEndTimestamp: null,
  impactInitialized: false,
  impactEditing: false,
  impactAdjusting: false,
  rallyPopupVisible: false,
  rallyPopupTimerId: null,
  rallyPopupRemainingCentis: null,
  panelCollapsed: false,
};
let debugPanel = null;
let panelCollapseMedia = null;
const PANEL_COLLAPSE_QUERY = '(max-width: 640px)';

const targets = [];
let nextTargetId = 1;
let recycledTargetIds = [];

bootstrap().catch((error) => {
  console.error('[main] bootstrap failed', error);
  setStatus(`初期化エラー: ${error?.message ?? String(error)}`);
});

async function bootstrap(){
  ensurePixiReady();
  state.app = await createApplication(dom.app);
  state.world = createWorldRoot(state.app);

  attach(state.app, state.world);
  ensureGrid(state.world);
  ensureOverlay(state.world);
  ensureHUD(state.app);
  applyStandardView();

  bindUiEvents();
  bindPointerEvents();
  initializeResponsiveUi();
  createDebugPanel();
  applyBallisticVisibility();

  redrawOverlay();
  requestSceneUpdate();
}

function ensurePixiReady(){
  if (typeof PIXI === 'undefined'){
    throw new Error('PIXI がロードされていません。index.html のスクリプトを確認してください。');
  }
}

async function createApplication(host){
  const devicePixelRatio = window.devicePixelRatio || 1;
  const maxRendererResolution = Number.isFinite(APP?.maxRendererResolution) ? APP.maxRendererResolution : 2;
  const resolution = Math.min(devicePixelRatio, maxRendererResolution);
  const options = {
    background: APP.background,
    antialias: APP.antialias ?? false,
    autoDensity: APP.autoDensity ?? false,
    resolution,
    powerPreference: APP.powerPreference ?? 'high-performance',
    resizeTo: host,
  };

  let app;
  if (typeof PIXI.Application === 'function' && PIXI.Application.prototype?.init){
    app = new PIXI.Application();
    await app.init(options);
  } else {
    app = new PIXI.Application(options);
  }

  const canvas = app.canvas ?? app.view;
  if (!canvas){
    throw new Error('PIXI Application に canvas/view が存在しません。');
  }

  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.id = 'pixi-canvas';
  canvas.setAttribute('aria-label', 'Astro Kings Hex Map');
  canvas.setAttribute('role', 'application');
  canvas.tabIndex = 0;

  host.innerHTML = '';
  host.appendChild(canvas);
  return app;
}

function createWorldRoot(app){
  const world = new PIXI.Container();
  world.name = 'world-root';
  world.sortableChildren = true;
  app.stage.addChild(world);
  app.stage.sortableChildren = true;
  return world;
}

function bindUiEvents(){
  dom.btnFit.addEventListener('click', handleFitClick);
  dom.btnStd.addEventListener('click', handleStdClick);
  dom.btnSearch.addEventListener('click', handleSearch);
  dom.btnClear.addEventListener('click', clearSelection);
  dom.kw.addEventListener('keydown', (event) => {
    if (event.key === 'Enter'){
      event.preventDefault();
      handleSearch();
    }
  });

  dom.btnDistance.addEventListener('click', handleDistanceCalculation);
  const handleDistanceKey = (event) => {
    if (event.key === 'Enter'){
      event.preventDefault();
      handleDistanceCalculation();
    }
  };
  dom.distanceFrom.addEventListener('keydown', handleDistanceKey);
  dom.distanceTo.addEventListener('keydown', handleDistanceKey);
  dom.btnRallyCountdown.addEventListener('click', handleRallyCountdownStart);
  setRallyCountdownEnabled(false);
  updateRallyCountdownDisplay();

  dom.ballisticToggle.addEventListener('click', handleBallisticToggle);
  dom.btnNestInside.addEventListener('click', () => setNestMode('inside'));
  dom.btnNestOutside.addEventListener('click', () => setNestMode('outside'));
  dom.btnRally5.addEventListener('click', () => setRallyTime(5));
  dom.btnRally10.addEventListener('click', () => setRallyTime(10));
  dom.btnRally15.addEventListener('click', () => setRallyTime(15));
  dom.btnRally30.addEventListener('click', () => setRallyTime(30));
  if (dom.btnTargetPlanet){
    dom.btnTargetPlanet.addEventListener('click', () => setStrikeTarget('planet'));
  }
  if (dom.btnTargetSatellite){
    dom.btnTargetSatellite.addEventListener('click', () => setStrikeTarget('satellite'));
  }
  if (dom.btnTargetBase){
    dom.btnTargetBase.addEventListener('click', () => setStrikeTarget('base'));
  }
  if (dom.btnTargetPvp){
    dom.btnTargetPvp.addEventListener('click', () => setStrikeTarget('pvp'));
  }
  if (dom.btnTimeAdjust){
    dom.btnTimeAdjust.addEventListener('pointerdown', (event) => {
      if (document.activeElement === dom.impactTime){
        event.preventDefault();
      }
    });
    dom.btnTimeAdjust.addEventListener('click', handleImpactAdjust);
  }
  if (dom.impactTime){
    dom.impactTime.addEventListener('focus', enterImpactEditMode);
    dom.impactTime.addEventListener('keydown', handleImpactInputKey);
    dom.impactTime.addEventListener('blur', handleImpactBlur);
  }
  if (dom.btnRallyPopupClose){
    dom.btnRallyPopupClose.addEventListener('click', () => closeRallyPopup({ manual: true }));
  }
  if (dom.rallyPopup){
    dom.rallyPopup.addEventListener('click', () => closeRallyPopup({ manual: true }));
    const popupContent = dom.rallyPopup.querySelector('.rally-popup-content');
    if (popupContent){
      popupContent.addEventListener('click', (event) => event.stopPropagation());
    }
  }
}

function initializeResponsiveUi(){
  setupPanelDrawer();
  setupMobileActionProxies();
  setupPanelMediaWatcher();
}

function setupPanelDrawer(){
  if (dom.panelDrawerToggle){
    dom.panelDrawerToggle.addEventListener('click', handlePanelDrawerToggle);
  }
  updatePanelCollapseUi();
}

function handlePanelDrawerToggle(){
  setPanelCollapsed(!state.panelCollapsed);
}

function setPanelCollapsed(collapsed){
  const normalized = !!collapsed;
  if (state.panelCollapsed === normalized){
    return;
  }
  state.panelCollapsed = normalized;
  updatePanelCollapseUi();
}

function updatePanelCollapseUi(){
  document.body.classList.toggle('panel-collapsed', state.panelCollapsed);
  if (dom.panelBody){
    dom.panelBody.setAttribute('aria-hidden', state.panelCollapsed ? 'true' : 'false');
  }
  if (dom.topPanel){
    dom.topPanel.hidden = state.panelCollapsed;
    dom.topPanel.setAttribute('aria-hidden', state.panelCollapsed ? 'true' : 'false');
  }
  if (dom.panelDrawerToggle){
    dom.panelDrawerToggle.setAttribute('aria-expanded', state.panelCollapsed ? 'false' : 'true');
    dom.panelDrawerToggle.textContent = state.panelCollapsed ? 'メニュー表示' : 'メニュー収納';
  }
}

function setupMobileActionProxies(){
  const proxyButtons = document.querySelectorAll('[data-proxy-target]');
  proxyButtons.forEach((node) => {
    const targetId = node.getAttribute('data-proxy-target');
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    node.addEventListener('click', (event) => {
      event.preventDefault();
      target.click();
    });
  });
  if (dom.mobileMenuButton){
    dom.mobileMenuButton.addEventListener('click', handleMobileMenuButton);
  }
}

function handleMobileMenuButton(){
  const wasCollapsed = state.panelCollapsed;
  setPanelCollapsed(false);
  if (wasCollapsed && dom.panelBody){
    dom.panelBody.scrollTop = 0;
  }
}

function setupPanelMediaWatcher(){
  if (typeof window.matchMedia !== 'function'){
    return;
  }
  panelCollapseMedia = window.matchMedia(PANEL_COLLAPSE_QUERY);
  const apply = () => {
    if (!panelCollapseMedia) return;
    if (panelCollapseMedia.matches){
      if (!state.panelCollapsed){
        setPanelCollapsed(true);
      }
    } else if (state.panelCollapsed){
      setPanelCollapsed(false);
    } else {
      updatePanelCollapseUi();
    }
  };
  if (typeof panelCollapseMedia.addEventListener === 'function'){
    panelCollapseMedia.addEventListener('change', apply);
  } else if (typeof panelCollapseMedia.addListener === 'function'){
    panelCollapseMedia.addListener(apply);
  }
  apply();
}

function bindPointerEvents(){
  const canvas = state.app.canvas ?? state.app.view;
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', resetPointer);
  canvas.addEventListener('pointerleave', handlePointerLeave);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  canvas.addEventListener('dblclick', handleDoubleClick);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}

function handlePointerDown(event){
  if (event.button !== undefined && event.button !== 0) return;
  const point = toRendererPoint(event);
  state.pointerActive = true;
  state.pointerMoved = false;
  state.lastPointer = point;
  startDrag(point.x, point.y);
  updatePointerContext(point);
}

function handlePointerMove(event){
  const point = toRendererPoint(event);
  if (state.pointerActive){
    const dx = point.x - state.lastPointer.x;
    const dy = point.y - state.lastPointer.y;
    if (!state.pointerMoved && dx * dx + dy * dy > 9){
      state.pointerMoved = true;
    }
    dragTo(point.x, point.y);
    state.lastPointer = point;
  }
  updatePointerContext(point);
}

function handlePointerUp(event){
  if (!state.pointerActive) return;
  const point = toRendererPoint(event);
  state.pointerActive = false;
  endDrag();
  updatePointerContext(point);

  if (!state.pointerMoved){
    handleTap(point);
  }
}

function handlePointerLeave(){
  resetPointer();
}

function handleBallisticToggle(){
  setBallisticExpanded(!state.ballisticExpanded);
}

function setBallisticExpanded(expanded){
  const normalized = !!expanded;
  state.ballisticExpanded = normalized;
  if (dom.ballisticSection){
    if (normalized){
      dom.ballisticSection.classList.remove('collapsed');
    } else {
      dom.ballisticSection.classList.add('collapsed');
    }
  }
  if (dom.ballisticToggle){
    dom.ballisticToggle.setAttribute('aria-expanded', normalized ? 'true' : 'false');
    dom.ballisticToggle.textContent = '▼';
    dom.ballisticToggle.setAttribute('aria-label', normalized ? '弾着計算を折りたたむ' : '弾着計算を展開する');
  }
}

function applyBallisticVisibility(){
  setBallisticExpanded(state.ballisticExpanded);
  setNestMode(state.nestMode);
  setRallyTime(state.rallyMinutes);
  setStrikeTarget(state.strikeTarget);
  refreshMarchTime();
  ensureImpactCountdownDefaults();
}

function setNestMode(mode){
  const normalized = mode === 'inside' ? 'inside' : 'outside';
  state.nestMode = normalized;
  if (dom.btnNestInside){
    const active = normalized === 'inside';
    dom.btnNestInside.classList.toggle('active', active);
    dom.btnNestInside.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  if (dom.btnNestOutside){
    const active = normalized === 'outside';
    dom.btnNestOutside.classList.toggle('active', active);
    dom.btnNestOutside.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  refreshMarchTime();
}

function setStrikeTarget(target){
  const allowed = ['planet', 'satellite', 'base', 'pvp'];
  const normalized = allowed.includes(target) ? target : 'planet';
  state.strikeTarget = normalized;

  const pairs = [
    { node: dom.btnTargetPlanet, type: 'planet' },
    { node: dom.btnTargetSatellite, type: 'satellite' },
    { node: dom.btnTargetBase, type: 'base' },
    { node: dom.btnTargetPvp, type: 'pvp' },
  ];

  for (const { node, type } of pairs){
    if (!node) continue;
    const active = type === normalized;
    node.classList.toggle('active', active);
    node.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  refreshMarchTime();
}

function maybeAutoSetStrikeTarget(resolved){
  if (!resolved || !resolved.objectType){
    return;
  }
  const type = resolved.objectType;
  if (type === 'planet'){
    setStrikeTarget('planet');
    return;
  }
  if (type === 'satellite' || type === 'tenebris'){
    setStrikeTarget('satellite');
  }
}

function updateMarchDistance(hexDistance){
  if (Number.isFinite(hexDistance) && hexDistance > 0){
    state.marchDistanceHex = hexDistance;
  } else {
    state.marchDistanceHex = null;
  }
  refreshMarchTime();
}

function refreshMarchTime(){
  if (!dom.marchTime){
    return;
  }
  const totalSeconds = calculateMarchSeconds(state.marchDistanceHex);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0){
    state.marchSeconds = null;
    state.marchTimeLabel = '00:00,00';
    dom.marchTime.textContent = '00:00,00';
    syncRallyCountdownAvailability();
    return;
  }
  state.marchSeconds = totalSeconds;
  state.marchTimeLabel = formatClockFromSeconds(totalSeconds);
  dom.marchTime.textContent = state.marchTimeLabel;
  syncRallyCountdownAvailability();
}

function formatClockFromSeconds(seconds){
  const numeric = Number.isFinite(seconds) ? seconds : 0;
  const totalCentiseconds = Math.max(0, Math.round(numeric * 100));
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const cents = totalCentiseconds % 100;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(cents).padStart(2, '0')}`;
}

function calculateMarchSeconds(hexDistance){
  if (!Number.isFinite(hexDistance) || hexDistance <= 0){
    return null;
  }
  const targetKey = typeof state.strikeTarget === 'string' ? state.strikeTarget : 'planet';
  const baseSecondsPerHex = STRIKE_SECONDS_PER_HEX[targetKey] ?? STRIKE_SECONDS_PER_HEX.planet;
  const modifier = state.nestMode === 'inside' ? 1 : 1.1;
  const rawSeconds = hexDistance * baseSecondsPerHex * modifier;
  const adjustment = Number.isFinite(MARCH_ADJUSTMENT_SECONDS) ? MARCH_ADJUSTMENT_SECONDS : 0;
  const total = rawSeconds + adjustment;
  return total > 0 ? total : 0;
}

function canUseRallyCountdown(){
  return Number.isFinite(state.marchSeconds) && state.marchSeconds > 0;
}

function syncRallyCountdownAvailability(){
  const enabled = canUseRallyCountdown();
  setRallyCountdownEnabled(enabled);
  if (!enabled){
    stopRallyCountdown({ silent: true });
  }
}

function setRallyCountdownEnabled(enabled){
  const button = dom.btnRallyCountdown;
  if (!button) return;
  const disabled = !enabled;
  button.disabled = disabled;
  button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
}

function setRallyTime(minutes){
  const allowed = [5, 10, 15, 30];
  const normalized = allowed.includes(minutes) ? minutes : 5;
  state.rallyMinutes = normalized;

  const buttonMap = [
    { node: dom.btnRally5, value: 5 },
    { node: dom.btnRally10, value: 10 },
    { node: dom.btnRally15, value: 15 },
    { node: dom.btnRally30, value: 30 },
  ];

  for (const { node, value } of buttonMap){
    if (!node) continue;
    const active = normalized === value;
    node.classList.toggle('active', active);
    node.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function ensureImpactCountdownDefaults(){
  if (state.impactInitialized){
    updateImpactTimeInput(state.impactSeconds, { force: true });
    return;
  }
  const fallback = clampImpactSeconds(
    Number.isFinite(state.impactSeconds) ? state.impactSeconds : IMPACT_DEFAULT_SECONDS,
  );
  state.impactInitialized = true;
  state.impactSeconds = fallback;
  stopImpactTimer({ silent: true });
  updateImpactTimeInput(fallback, { force: true });
}

function handleImpactAdjust(){
  if (!dom.impactTime) return;
  state.impactAdjusting = true;
  const raw = dom.impactTime.value.trim();
  const parsed = parseImpactInput(raw);
  const nextSeconds = Number.isFinite(parsed) ? parsed : IMPACT_DEFAULT_SECONDS;
  startImpactCountdown(nextSeconds);
  const formatted = formatImpactSeconds(nextSeconds);
  if (Number.isFinite(parsed)){
    setStatus(`弾着時間を ${formatted} に再設定しました。`);
  } else {
    setStatus('弾着時間は MM:SS 形式で入力してください。40:00 にリセットしました。');
  }
  dom.impactTime.blur();
  state.impactAdjusting = false;
  exitImpactEditMode({ forceRefresh: true });
}

function handleImpactInputKey(event){
  if (event.key === 'Enter'){
    event.preventDefault();
    handleImpactAdjust();
  }
}

function handleImpactBlur(){
  if (state.impactAdjusting) return;
  exitImpactEditMode({ forceRefresh: true });
}

function enterImpactEditMode(){
  state.impactEditing = true;
}

function startImpactCountdown(seconds){
  const normalized = clampImpactSeconds(seconds);
  stopImpactTimer({ silent: true });
  closeRallyPopup({ silent: true });
  state.impactSeconds = normalized;
  state.impactEndTimestamp = (typeof window !== 'undefined' && normalized > 0)
    ? Date.now() + normalized * 1000
    : null;
  updateImpactTimeInput(normalized, { force: true });
  if (typeof window === 'undefined') return;
  if (normalized <= 0) return;
  state.impactTimerId = window.setInterval(tickImpactCountdown, 200);
}

function tickImpactCountdown(){
  if (!Number.isFinite(state.impactSeconds)) return;
  if (!Number.isFinite(state.impactEndTimestamp)){
    stopImpactTimer({ silent: true });
    return;
  }
  const remainingMs = Math.max(0, state.impactEndTimestamp - Date.now());
  const remainingSeconds = Math.max(0, Math.round(remainingMs / 1000));
  if (remainingSeconds !== state.impactSeconds){
    state.impactSeconds = remainingSeconds;
    updateImpactTimeInput(state.impactSeconds, { force: !state.impactEditing });
  }
  if (remainingMs <= 0){
    stopImpactTimer({ silent: true });
    updateImpactTimeInput(0, { force: true });
    closeRallyPopup({ notifyComplete: true });
  }
}

function updateImpactTimeInput(seconds, options = {}){
  if (!dom.impactTime || typeof document === 'undefined') return;
  const { force = false } = options;
  if (!force && state.impactEditing){
    return;
  }
  dom.impactTime.value = formatImpactSeconds(seconds);
}

function exitImpactEditMode(options = {}){
  const { forceRefresh = false } = options;
  if (!state.impactEditing){
    if (forceRefresh){
      updateImpactTimeInput(state.impactSeconds, { force: true });
    }
    return;
  }
  state.impactEditing = false;
  if (forceRefresh){
    updateImpactTimeInput(state.impactSeconds, { force: true });
  }
}

function parseImpactInput(value){
  const normalized = normalizeImpactInput(value);
  if (!normalized) return null;

  let minutes = null;
  let seconds = null;

  if (/^\d{1,4}$/.test(normalized)){
    const digits = normalized.padStart(4, '0');
    minutes = Number(digits.slice(0, -2));
    seconds = Number(digits.slice(-2));
  } else {
    const match = /^(\d{1,3}):([0-5]\d)$/u.exec(normalized);
    if (!match) return null;
    minutes = Number(match[1]);
    seconds = Number(match[2]);
  }

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60){
    return null;
  }

  return clampImpactSeconds(minutes * 60 + seconds);
}

function normalizeImpactInput(value){
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/[０-９]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFF10 + 0x30))
    .replace(/：/gu, ':');
}

function clampImpactSeconds(value){
  if (!Number.isFinite(value)) return IMPACT_DEFAULT_SECONDS;
  if (value < 0) return 0;
  if (value > IMPACT_MAX_SECONDS) return IMPACT_MAX_SECONDS;
  return Math.floor(value);
}

function stopImpactTimer(options = {}){
  const { silent = false } = options;
  if (state.impactTimerId){
    clearInterval(state.impactTimerId);
    state.impactTimerId = null;
  }
  state.impactEndTimestamp = null;
  if (!silent){
    closeRallyPopup({ silent: true });
  }
}

function formatImpactSeconds(totalSeconds){
  const safe = clampImpactSeconds(totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

function resetPointer(){
  if (state.pointerActive){
    state.pointerActive = false;
    endDrag();
  }
  state.pointerMoved = false;
  setCrosshairPosition(null, null);
  dom.cursor.textContent = '';
  setStatus('準備完了。');
  requestSceneUpdate();
}

function handleWheel(event){
  event.preventDefault();
  const point = toRendererPoint(event);
  const delta = clampWheelDelta(event.deltaY);
  const zoom = zoomBy(delta, point);
  reportZoom(zoom);
  updatePointerContext(point);
}

function handleDoubleClick(event){
  event.preventDefault();
  const point = toRendererPoint(event);
  const world = screenToWorld(point.x, point.y);
  const hex = worldToHex(world.x, world.y);
  if (!isInsideWorld(hex.q, hex.r)) return;
  const q = Math.trunc(hex.q);
  const r = Math.trunc(hex.r);
  if (!isInsideWorld(q, r)) return;
  const key = `${q}:${r}`;
  toggleTargetAt(key);
}

function handleTap(point){
  const world = screenToWorld(point.x, point.y);
  const hex = worldToHex(world.x, world.y);
  if (!isInsideWorld(hex.q, hex.r)) return;

  const key = `${Math.trunc(hex.q)}:${Math.trunc(hex.r)}`;
  const objectHit = objectList.find((object) => object.key === key);
  if (objectHit){
    focusOnObject(objectHit);
    dom.kw.value = objectHit.name ?? key;
    return;
  }

  const targetHit = getTargetByKey(key);
  if (targetHit){
    focusOnTarget(targetHit);
    dom.kw.value = targetHit.name ?? targetHit.label ?? key;
    return;
  }

  setSelectedKey(null);
  setSelectedHex(key);
  redrawOverlay();
  setStatus(`座標 [${pad3(hex.q)}:${pad3(hex.r)}] を選択しました。`);
  requestSceneUpdate();
}
function handleFitClick(){
  if (!state.app) return;
  const { width, height } = state.app.renderer;
  const origin = { x: width / 2, y: height / 2 };
  const fitZoom = getFitZoom();
  const zoom = setZoom(fitZoom, origin);
  reportZoom(zoom);
  centerOnStandard();
}

function handleStdClick(){
  applyStandardView();
}

function handleSearch(){
  const query = dom.kw.value.trim();
  if (!query){
    setStatus('検索キーワードを入力してください。');
    return;
  }

  if (focusByKey(query)) return;
  if (focusByName(query)) return;

  setStatus(`該当が見つかりません: ${query}`);
}
function handleDistanceCalculation(){
  const fromRaw = dom.distanceFrom.value.trim();
  const toRaw = dom.distanceTo.value.trim();
  state.distanceContext = null;

  if (!fromRaw || !toRaw){
    setMeasurementData(null);
    updateDistanceResult('');
    updateMarchDistance(null);
    stopRallyCountdown({ resetLabel: true, notifyComplete: false, silent: true });
    closeRallyPopup({ silent: true });
    setStatus('発地点と着弾点の両方を入力してください。');
    requestSceneUpdate();
    return;
  }

  const from = resolveDistanceInput(fromRaw);
  if (!from){
    setMeasurementData(null);
    updateDistanceResult('');
    updateMarchDistance(null);
    stopRallyCountdown({ resetLabel: true, notifyComplete: false, silent: true });
    closeRallyPopup({ silent: true });
    setStatus(`発地点「${fromRaw}」を特定できませんでした。`);
    requestSceneUpdate();
    return;
  }

  const to = resolveDistanceInput(toRaw);
  if (!to){
    setMeasurementData(null);
    updateDistanceResult('');
    updateMarchDistance(null);
    stopRallyCountdown({ resetLabel: true, notifyComplete: false, silent: true });
    closeRallyPopup({ silent: true });
    setStatus(`着弾点「${toRaw}」を特定できませんでした。`);
    requestSceneUpdate();
    return;
  }

  if (from.key === to.key){
    setMeasurementData(null);
    updateDistanceResult(formatDistanceResult({ px: 0, hex: 0 }));
    updateMarchDistance(0);
    stopRallyCountdown({ resetLabel: true, notifyComplete: false, silent: true });
    closeRallyPopup({ silent: true });
    setStatus('発地点と着弾点が同一です。');
    requestSceneUpdate();
    return;
  }

  maybeAutoSetStrikeTarget(to);

  const metrics = computeDistanceMetrics(from.coords, to.coords);
  setMeasurementData({
    fromKey: from.key,
    toKey: to.key,
  });
  updateDistanceResult(formatDistanceResult(metrics));
  updateMarchDistance(metrics.hex);
  state.distanceContext = {
    from: {
      label: from.label,
      key: from.key,
      coords: from.coords,
    },
    to: {
      label: to.label,
      key: to.key,
      coords: to.coords,
    },
  };
  setStatus(`${from.label} と ${to.label} の直線距離を算出しました。`);
  requestSceneUpdate();
}
function handleRallyCountdownStart(){
  if (!canUseRallyCountdown()){
    setStatus('距離確認で行軍距離を算出してから集結カウントを開始してください。');
    return;
  }
  if (!isImpactCountdownActive()){
    setStatus('時間補正で弾着カウントダウンを開始してから集結カウントを実行してください。');
    return;
  }
  const marchSeconds = Number.isFinite(state.marchSeconds) ? state.marchSeconds : 0;
  if (marchSeconds <= 0){
    setStatus('行軍時間を算出できませんでした。発射地点と着弾点を再指定してください。');
    return;
  }
  const marchLabel = typeof state.marchTimeLabel === 'string' && state.marchTimeLabel
    ? state.marchTimeLabel
    : formatClockFromSeconds(marchSeconds);
  const distanceHex = Number.isFinite(state.marchDistanceHex) ? state.marchDistanceHex : null;
  const rallyMinutes = Number.isFinite(state.rallyMinutes) ? state.rallyMinutes : 0;
  const rallySeconds = clampRallySeconds(rallyMinutes * 60);
  const impactRemainingMs = getImpactRemainingMilliseconds();
  if (impactRemainingMs <= 0){
    setStatus('弾着カウントダウンが停止しています。時間補正で弾着時間を再設定してください。');
    return;
  }

  const totalPrepMs = Math.max(0, marchSeconds * 1000 + rallySeconds * 1000);
  let gatherDelayMs = impactRemainingMs - totalPrepMs;
  let insufficientLead = false;
  if (gatherDelayMs < 0){
    gatherDelayMs = 0;
    insufficientLead = true;
  }
  const gatherDelayCentis = Math.max(0, Math.round(gatherDelayMs / 10));
  const gatherDelaySeconds = Math.max(0, Math.ceil(gatherDelayMs / 1000));
  const targetLabel = getTargetDisplayLabel();
  const gatherLabel = `${String(rallyMinutes).padStart(2, '0')}分`;
  const context = {
    distanceHex,
    marchSeconds,
    marchLabel,
    rallyMinutes,
    rallySeconds,
    gatherDelaySeconds,
    gatherDelayCentis,
    impactRemainingMs,
    targetLabel,
    insufficientLead,
  };

  stopRallyCountdown({ resetLabel: false, notifyComplete: false, silent: true });
  closeRallyPopup({ silent: true });
  startRallyCountdown(gatherDelaySeconds, context, { mode: 'pre' });
  if (gatherDelayCentis > 0){
    openRallyPopup(gatherDelayCentis, context);
  } else if (!insufficientLead){
    openRallyPopup(0, context);
  }

  if (insufficientLead){
    setStatus(`弾着までの残り時間が不足しています。直ちに集結を開始してください（目標 ${targetLabel}）。`);
  } else {
    const delayDisplay = formatPopupCentiseconds(gatherDelaySeconds * 100);
    setStatus(`発射スケジュールを算出しました（目標 ${targetLabel} / 集結 ${gatherLabel} / 集結開始まで ${delayDisplay}）。ポップアップのカウントダウンを確認してください。`);
  }
}

function startRallyCountdown(seconds, context, options = {}){
  const { mode = 'pre' } = options;
  const normalized = clampRallySeconds(seconds);
  state.rallyCountdownMode = mode;
  state.rallyCountdownSeconds = normalized;
  state.rallyContext = context ?? null;
  updateRallyCountdownDisplay();

  if (typeof window === 'undefined'){
    return;
  }

  if (normalized <= 0){
    handleRallyCountdownPhaseCompletion({ immediate: true });
    return;
  }

  state.rallyTimerId = window.setInterval(tickRallyCountdown, 1000);
}

function stopRallyCountdown(options = {}){
  const {
    resetLabel = true,
    notifyComplete = false,
    retainContext = false,
    silent = false,
  } = options;

  if (state.rallyTimerId){
    window.clearInterval(state.rallyTimerId);
    state.rallyTimerId = null;
  }

  if (notifyComplete && !silent){
    const context = state.rallyContext;
    if (context && Number.isFinite(context.rallyMinutes)){
      const rallyLabel = String(context.rallyMinutes).padStart(2, '0');
      setStatus(`集結${rallyLabel}分のカウントが完了しました。`);
    } else {
      setStatus('集結カウントが完了しました。');
    }
  }

  state.rallyCountdownSeconds = null;
  state.rallyCountdownMode = 'idle';
  if (resetLabel){
    updateRallyCountdownDisplay();
  }
  if (!retainContext){
    state.rallyContext = null;
  }

  if (!silent){
    closeRallyPopup({ silent: true });
  }
}

function tickRallyCountdown(){
  if (!Number.isFinite(state.rallyCountdownSeconds)){
    stopRallyCountdown({ resetLabel: true, notifyComplete: false, silent: true });
    return;
  }
  if (state.rallyCountdownSeconds <= 0){
    if (state.rallyTimerId){
      window.clearInterval(state.rallyTimerId);
      state.rallyTimerId = null;
    }
    handleRallyCountdownPhaseCompletion();
    return;
  }
  state.rallyCountdownSeconds = Math.max(0, state.rallyCountdownSeconds - 1);
  updateRallyCountdownDisplay();
  if (state.rallyCountdownSeconds <= 0){
    if (state.rallyTimerId){
      window.clearInterval(state.rallyTimerId);
      state.rallyTimerId = null;
    }
    handleRallyCountdownPhaseCompletion();
  }
}

function handleRallyCountdownPhaseCompletion(options = {}){
  const { immediate = false } = options;
  const mode = state.rallyCountdownMode;
  if (mode === 'pre'){
    beginGatherPhase({ immediate });
    return;
  }
  if (mode === 'gather'){
    completeGatherPhase({ immediate });
    return;
  }
  stopRallyCountdown({ notifyComplete: true, silent: true });
}

function beginGatherPhase(options = {}){
  const context = state.rallyContext;
  closeRallyPopup({ silent: true });
  if (!context){
    stopRallyCountdown({ silent: true });
    return;
  }
  const rallySeconds = clampRallySeconds(context.rallySeconds);
  if (rallySeconds <= 0){
    completeGatherPhase({ immediate: true });
    return;
  }

  state.rallyCountdownMode = 'gather';
  state.rallyCountdownSeconds = rallySeconds;
  state.rallyContext = { ...context };
  updateRallyCountdownDisplay();

  if (typeof window !== 'undefined'){
    state.rallyTimerId = window.setInterval(tickRallyCountdown, 1000);
  }

  const rallyLabel = String(context.rallyMinutes ?? 0).padStart(2, '0');
  const message = context.insufficientLead
    ? `弾着までの余裕がないため集結を即時開始してください（目標 ${context.targetLabel} / 集結 ${rallyLabel}）。`
    : `集結を開始してください。${rallyLabel}後に発射すると弾着時間に同期します（目標 ${context.targetLabel}）。`;
  setStatus(message);
}

function completeGatherPhase(options = {}){
  const context = state.rallyContext;
  const targetLabel = context?.targetLabel ?? getTargetDisplayLabel();
  const marchLabel = context?.marchLabel ?? formatClockFromSeconds(state.marchSeconds ?? 0);
  stopRallyCountdown({ resetLabel: true, notifyComplete: false, retainContext: false, silent: true });
  setStatus(`発射タイミングに到達しました。目標 ${targetLabel} へは行軍 ${marchLabel} で弾着時間に到達します。`);
}

function updateRallyCountdownDisplay(){
  const button = dom.btnRallyCountdown;
  if (!button) return;
  const seconds = Number.isFinite(state.rallyCountdownSeconds) ? state.rallyCountdownSeconds : null;
  const mode = state.rallyCountdownMode;

  if (seconds === null){
    button.textContent = RALLY_BUTTON_LABEL;
  } else {
    const label = formatRallyCountdown(seconds);
    if (mode === 'pre'){
      button.textContent = `集結開始まで (${label})`;
    } else if (mode === 'gather'){
      button.textContent = `集結中 (${label})`;
    } else {
      button.textContent = `${RALLY_BUTTON_LABEL} (${label})`;
    }
  }

  if (state.rallyContext){
    const { distanceHex, marchLabel, rallyMinutes, targetLabel } = state.rallyContext;
    const parts = [];
    if (targetLabel){
      parts.push(`目標 ${targetLabel}`);
    }
    if (Number.isFinite(distanceHex)){
      parts.push(`距離 ${distanceHex} へクス`);
    }
    if (typeof marchLabel === 'string' && marchLabel){
      parts.push(`行軍 ${marchLabel}`);
    }
    if (Number.isFinite(rallyMinutes)){
      parts.push(`集結 ${String(rallyMinutes).padStart(2, '0')}分`);
    }
    if (parts.length > 0){
      button.title = parts.join(' / ');
    } else {
      button.removeAttribute('title');
    }
  } else {
    button.removeAttribute('title');
  }
}

function formatRallyCountdown(value){
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function clampRallySeconds(value){
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function isImpactCountdownActive(){
  if (!Number.isFinite(state.impactSeconds) || state.impactSeconds <= 0){
    return false;
  }
  if (Number.isFinite(state.impactEndTimestamp)){
    return state.impactEndTimestamp > Date.now();
  }
  return Boolean(state.impactTimerId);
}

function getImpactRemainingMilliseconds(){
  if (Number.isFinite(state.impactEndTimestamp)){
    return Math.max(0, state.impactEndTimestamp - Date.now());
  }
  if (Number.isFinite(state.impactSeconds)){
    return Math.max(0, state.impactSeconds * 1000);
  }
  return 0;
}

function openRallyPopup(totalCentiseconds, context){
  if (!dom.rallyPopup || !dom.rallyPopupTimer) return;
  const centis = Number.isFinite(totalCentiseconds) ? Math.max(0, Math.floor(totalCentiseconds)) : 0;
  closeRallyPopup({ silent: true });
  state.rallyPopupVisible = true;
  state.rallyPopupRemainingCentis = centis;
  const targetLabel = context?.targetLabel ?? getTargetDisplayLabel();
  const rallyMinutesLabel = String(context?.rallyMinutes ?? state.rallyMinutes ?? 0).padStart(2, '0');
  dom.rallyPopup.classList.add('is-visible');
  dom.rallyPopup.setAttribute('aria-hidden', 'false');
  if (dom.rallyPopupTarget){
    dom.rallyPopupTarget.textContent = targetLabel;
  }
  if (dom.rallyPopupCountdownLabel){
    dom.rallyPopupCountdownLabel.textContent = `${rallyMinutesLabel}分集結までのカウントダウン：`;
  }
  dom.rallyPopupTimer.textContent = formatPopupCentiseconds(centis);
  updateRallyPopupTimer();
  if (typeof window !== 'undefined' && centis > 0){
    state.rallyPopupTimerId = window.setInterval(tickRallyPopupCountdown, 10);
  }
  if (typeof window !== 'undefined' && dom.btnRallyPopupClose){
    window.setTimeout(() => {
      try {
        dom.btnRallyPopupClose.focus();
      } catch {
        // focus failure can be ignored
      }
    }, 0);
  }
}

function closeRallyPopup(options = {}){
  const {
    manual = false,
    notifyComplete = false,
    silent = false,
  } = options;

  if (state.rallyPopupTimerId){
    clearInterval(state.rallyPopupTimerId);
    state.rallyPopupTimerId = null;
  }

  state.rallyPopupVisible = false;
  state.rallyPopupRemainingCentis = null;

  if (dom.rallyPopup){
    dom.rallyPopup.classList.remove('is-visible');
    dom.rallyPopup.setAttribute('aria-hidden', 'true');
  }
  if (dom.rallyPopupTimer){
    dom.rallyPopupTimer.textContent = '00:00.00';
  }
  if (dom.rallyPopupTarget){
    dom.rallyPopupTarget.textContent = '---';
  }
  if (dom.rallyPopupCountdownLabel){
    dom.rallyPopupCountdownLabel.textContent = '--分集結までのカウントダウン：';
  }

  if (silent) return;
  if (manual){
    setStatus('集結残り時間の表示を閉じました。');
  } else if (notifyComplete){
    setStatus('弾着までの集結残り時間がゼロになりました。');
  }
}

function tickRallyPopupCountdown(){
  if (!Number.isFinite(state.rallyPopupRemainingCentis)){
    closeRallyPopup({ silent: true });
    return;
  }
  const next = Math.max(0, state.rallyPopupRemainingCentis - 1);
  state.rallyPopupRemainingCentis = next;
  updateRallyPopupTimer();
  if (next <= 0){
    closeRallyPopup({ notifyComplete: true, silent: true });
  }
}

function updateRallyPopupTimer(){
  if (!dom.rallyPopupTimer) return;
  const centis = Number.isFinite(state.rallyPopupRemainingCentis)
    ? state.rallyPopupRemainingCentis
    : 0;
  dom.rallyPopupTimer.textContent = formatPopupCentiseconds(centis);
}

function formatPopupCentiseconds(value){
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(total / 6000);
  const seconds = Math.floor((total % 6000) / 100);
  const centis = total % 100;
  return `${pad2(minutes)}:${pad2(seconds)}.${pad2(centis)}`;
}

function getTargetDisplayLabel(){
  const context = state.distanceContext;
  if (context?.to?.label){
    return context.to.label;
  }
  if (dom.distanceTo){
    const raw = dom.distanceTo.value.trim();
    if (raw){
      return raw;
    }
  }
  return '---';
}

function resolveDistanceInput(raw){
  const value = raw.trim();
  if (!value) return null;

  const keyMatch = /^(\d{1,3}):(\d{1,3})$/.exec(value);
  if (keyMatch){
    const q = Number(keyMatch[1]);
    const r = Number(keyMatch[2]);
    if (!isInsideWorld(q, r)) return null;
    const key = `${q}:${r}`;

    const objectHit = objectList.find((object) => object.key === key);
    if (objectHit){
      return {
        key,
        coords: { q, r },
        label: objectHit.name ?? objectHit.key,
        objectType: objectHit.type ?? null,
      };
    }

    const targetHit = getTargetByKey(key);
    if (targetHit){
      return {
        key: targetHit.key,
        coords: { q, r },
        label: targetHit.name ?? targetHit.label ?? targetHit.key,
        objectType: null,
      };
    }

    return {
      key,
      coords: { q, r },
      label: `[${pad3(q)}:${pad3(r)}]`,
      objectType: null,
    };
  }

  const targetExact = getTargetByExactNameOrLabel(value);
  if (targetExact){
    const coords = parseKey(targetExact.key);
    if (!coords) return null;
    return {
      key: targetExact.key,
      coords,
      label: targetExact.name ?? targetExact.label ?? targetExact.key,
      objectType: null,
    };
  }

  const normalized = value.toLowerCase();
  const exactObject = objectList.find((object) => object.name?.toLowerCase() === normalized);
  if (exactObject){
    const coords = parseKey(exactObject.key);
    if (!coords) return null;
    return {
      key: exactObject.key,
      coords,
      label: exactObject.name ?? exactObject.key,
      objectType: exactObject.type ?? null,
    };
  }

  const targetHit = getTargetByNameOrLabel(value);
  if (targetHit){
    const coords = parseKey(targetHit.key);
    if (!coords) return null;
    return {
      key: targetHit.key,
      coords,
      label: targetHit.name ?? targetHit.label ?? targetHit.key,
      objectType: null,
    };
  }

  const partialObject = objectList.find((object) => object.name?.toLowerCase().includes(normalized));
  if (partialObject){
    const coords = parseKey(partialObject.key);
    if (!coords) return null;
    return {
      key: partialObject.key,
      coords,
      label: partialObject.name ?? partialObject.key,
      objectType: partialObject.type ?? null,
    };
  }

  return null;
}

function updateDistanceResult(text){
  const fallbackHex = '000 へクス';
  const raw = typeof text === 'string' ? text.trim() : '';
  const hexText = raw ? raw.replace(/\s*\([^)]*\)\s*$/u, '').trim() : fallbackHex;

  const target = dom.distanceResult;
  if (!target){
    return;
  }

  const hexSpan = target.querySelector('[data-role="distance-hex"]');
  if (hexSpan){
    hexSpan.textContent = hexText;
  } else {
    target.textContent = hexText;
  }
}
function computeDistanceMetrics(fromCoords, toCoords){
  const fromWorld = hexToWorld(fromCoords.q, fromCoords.r);
  const toWorld = hexToWorld(toCoords.q, toCoords.r);
  const distancePx = Math.hypot(toWorld.x - fromWorld.x, toWorld.y - fromWorld.y);

  const fromCube = offsetToCube(fromCoords.q, fromCoords.r);
  const toCube = offsetToCube(toCoords.q, toCoords.r);
  const hexDistance = cubeDistance(fromCube, toCube);

  return {
    px: distancePx,
    hex: Number.isFinite(hexDistance) ? hexDistance : null,
  };
}

function formatDistanceResult({ px, hex }){
  if (Number.isFinite(hex)){
    return `${hex} へクス`;
  }
  return '000 へクス';
}

function focusByKey(raw){
  const match = /^(\d{1,3}):(\d{1,3})$/.exec(raw);
  if (!match) return false;
  const q = Number(match[1]);
  const r = Number(match[2]);
  if (!isInsideWorld(q, r)){
    const label = `[${pad3(q)}:${pad3(r)}]`;
    setStatus(`${label} はワールド外です。`);
    return true;
  }
  const key = `${q}:${r}`;
  const objectHit = objectList.find((object) => object.key === key);
  if (objectHit){
    focusOnObject(objectHit, { select: false });
    dom.kw.value = objectHit.name ?? objectHit.key;
    return true;
  }

  const targetHit = getTargetByKey(key);
  if (targetHit){
    focusOnTarget(targetHit, { select: false });
    dom.kw.value = targetHit.name ?? targetHit.label ?? targetHit.key;
    return true;
  }

  focusOnHex(q, r);
  const worldPos = hexToWorld(q, r);
  const screenPos = worldToScreen(worldPos.x, worldPos.y);
  if (screenPos){
    setCrosshairPosition(screenPos.x, screenPos.y);
    updateCursorLabel(screenPos.x, screenPos.y);
  }
  const label = `[${pad3(q)}:${pad3(r)}]`;
  setStatus(`${label} を表示しました。`);
  requestSceneUpdate();
  return true;
}

function focusByName(raw){
  const normalizedInput = raw.trim().toLowerCase();
  if (!normalizedInput) return false;

  const targetExact = getTargetByExactNameOrLabel(raw);
  if (targetExact){
    focusOnTarget(targetExact, { select: false });
    dom.kw.value = targetExact.name ?? targetExact.label ?? targetExact.key;
    return true;
  }

  const exactObject = objectList.find((object) => object.name?.toLowerCase() === normalizedInput);
  if (exactObject){
    focusOnObject(exactObject, { select: false });
    dom.kw.value = exactObject.name ?? exactObject.key;
    return true;
  }

  const targetHit = getTargetByNameOrLabel(raw);
  if (targetHit){
    focusOnTarget(targetHit, { select: false });
    dom.kw.value = targetHit.name ?? targetHit.label ?? targetHit.key;
    return true;
  }

  const partialObject = objectList.find((object) => object.name?.toLowerCase().includes(normalizedInput));
  if (partialObject){
    focusOnObject(partialObject, { select: false });
    dom.kw.value = partialObject.name ?? partialObject.key;
    return true;
  }

  return false;
}

function focusOnObject(object, { select = true } = {}){
  const coords = parseKey(object.key);
  if (!coords) return;
  focusOnHex(coords.q, coords.r);
  if (select){
    setSelectedKey(object.key);
    setSelectedHex(object.key);
  }
  redrawOverlay();
  const worldPos = hexToWorld(coords.q, coords.r);
  const screenPos = worldToScreen(worldPos.x, worldPos.y);
  if (screenPos){
    setCrosshairPosition(screenPos.x, screenPos.y);
    updateCursorLabel(screenPos.x, screenPos.y);
  }
  const label = object.name ?? object.key;
  const message = select ? `${label} を選択しました。` : `${label} を表示しました。`;
  setStatus(message);
  requestSceneUpdate();
}

function focusOnTarget(target, { select = true } = {}){
  if (!target?.key) return;
  const coords = parseKey(target.key);
  if (!coords) return;
  if (!isInsideWorld(coords.q, coords.r)){
    const name = target.name ?? target.label ?? target.key;
    setStatus(`${name} の座標はワールド外です。`);
    return;
  }
  focusOnHex(coords.q, coords.r);
  if (select){
    setSelectedKey(null);
    setSelectedHex(target.key);
  }
  redrawOverlay();
  const worldPos = hexToWorld(coords.q, coords.r);
  const screenPos = worldToScreen(worldPos.x, worldPos.y);
  if (screenPos){
    setCrosshairPosition(screenPos.x, screenPos.y);
    updateCursorLabel(screenPos.x, screenPos.y);
  }
  const displayName = target.name ?? target.label ?? target.key;
  const message = select ? `${displayName} をフォーカスしました。` : `${displayName} を表示しました。`;
  setStatus(message);
  requestSceneUpdate();
}

function applyStandardView(){
  if (!state.app) return;
  const { width, height } = state.app.renderer;
  const origin = { x: width / 2, y: height / 2 };
  const zoom = setZoom(1, origin);
  reportZoom(zoom);

  const selectedHexKey = typeof getSelectedHex === 'function' ? getSelectedHex() : null;
  if (selectedHexKey){
    const coords = parseKey(selectedHexKey);
    if (coords && isInsideWorld(coords.q, coords.r)){
      focusOnHex(coords.q, coords.r);
      const worldPos = hexToWorld(coords.q, coords.r);
      const screenPos = worldToScreen(worldPos.x, worldPos.y);
      if (screenPos){
        setCrosshairPosition(screenPos.x, screenPos.y);
        updateCursorLabel(screenPos.x, screenPos.y);
      }
      requestSceneUpdate();
      return;
    }
  }

  centerOnStandard();
}

function clearSelection(){
  setSelectedKey(null);
  setSelectedHex(null);
  clearTargets(true);
  setMeasurementData(null);
  updateDistanceResult('');
  updateMarchDistance(null);
  closeRallyPopup({ silent: true });
  stopRallyCountdown({ silent: true, resetLabel: true, notifyComplete: false });
  state.distanceContext = null;
  redrawOverlay();
  setStatus('選択を解除しました。');
  requestSceneUpdate();
}

function updatePointerContext(point){
  setCrosshairPosition(point.x, point.y);
  updateCursorLabel(point.x, point.y);
  requestSceneUpdate();
}

function updateCursorLabel(screenX, screenY){
  const world = screenToWorld(screenX, screenY);
  const hex = worldToHex(world.x, world.y);
  if (!Number.isFinite(hex.q) || !Number.isFinite(hex.r) || !isInsideWorld(hex.q, hex.r)){
    dom.cursor.textContent = '';
    return;
  }
  const label = `[${pad3(hex.q)}:${pad3(hex.r)}]`;
  dom.cursor.textContent = label;
}

function centerOnStandard(){
  if (!state.app) return;
  focusOnStandardCenter();
  const center = getStandardCenter();
  const centerWorld = hexToWorld(center.q, center.r);
  const centerScreen = worldToScreen(centerWorld.x, centerWorld.y);
  if (centerScreen){
    setCrosshairPosition(centerScreen.x, centerScreen.y);
    updateCursorLabel(centerScreen.x, centerScreen.y);
  }
  requestSceneUpdate();
}

function requestSceneUpdate(){
  if (!state.app || state.updateScheduled) return;
  state.updateScheduled = true;
  requestAnimationFrame(() => {
    state.updateScheduled = false;
    updateGrid(getState().zoom);
    updateHUD(state.app);
  });
}

function toggleTargetAt(key){
  const index = findTargetIndex(key);
  if (index >= 0){
    const removed = targets.splice(index, 1)[0];
    recycleTargetLabel(removed?.label);
    syncTargets();
    const removedName = removed?.name ?? removed?.label ?? removed?.key ?? key;
    setStatus(`${removedName} を解除しました。`);
    requestSceneUpdate();
    return;
  }

  const label = generateTargetLabel();
  let customName = '';
  const promptLabel = `${label} の名前を入力できます（省略可）`;
  if (typeof window !== 'undefined' && typeof window.prompt === 'function'){
    const result = window.prompt(promptLabel, '');
    if (result !== null){
      customName = result.trim();
    }
  }

  const entry = {
    key,
    label,
    name: customName ? customName : null,
  };
  targets.push(entry);
  syncTargets();
  const displayName = entry.name ?? entry.label;
  setStatus(`${displayName} を登録しました。`);
  requestSceneUpdate();
}

function findTargetIndex(key){
  return targets.findIndex((target) => target.key === key);
}
function getTargetByKey(key){
  const index = findTargetIndex(key);
  return index >= 0 ? targets[index] : null;
}

function getTargetByExactNameOrLabel(raw){
  const normalized = normalizeTargetValue(raw);
  if (!normalized) return null;
  const byName = targets.find((target) => normalizeTargetValue(target.name) === normalized);
  if (byName) return byName;
  const byLabel = targets.find((target) => normalizeTargetValue(target.label) === normalized);
  if (byLabel) return byLabel;
  return null;
}

function normalizeTargetValue(value){
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function getTargetByNameOrLabel(raw){
  const normalized = normalizeTargetValue(raw);
  if (!normalized) return null;
  let hit = targets.find((target) => normalizeTargetValue(target.name) === normalized);
  if (hit) return hit;
  hit = targets.find((target) => normalizeTargetValue(target.label) === normalized);
  if (hit) return hit;
  return (
    targets.find((target) => {
      const nameValue = normalizeTargetValue(target.name);
      const labelValue = normalizeTargetValue(target.label);
      return (nameValue && nameValue.includes(normalized)) || (labelValue && labelValue.includes(normalized));
    }) ?? null
  );
}

function generateTargetLabel(){
  const id = getNextTargetId();
  return formatTargetId(id);
}

function getNextTargetId(){
  if (recycledTargetIds.length){
    recycledTargetIds.sort((a, b) => a - b);
    return recycledTargetIds.shift();
  }
  const id = nextTargetId;
  nextTargetId += 1;
  return id;
}

function recycleTargetLabel(label){
  const match = /^TGT-(\d{3})$/.exec(String(label ?? ''));
  if (!match) return;
  const id = Number.parseInt(match[1], 10);
  if (!Number.isFinite(id)) return;
  if (!recycledTargetIds.includes(id)){
    recycledTargetIds.push(id);
  }
}

function formatTargetId(id){
  return `TGT-${String(id).padStart(3, '0')}`;
}

function syncTargets(){
  setTargetMarkers(
    targets.map((target) => ({
      key: target.key,
      label: target.label,
      name: target.name ?? null,
    }))
  );
}

function clearTargets(resetSequence = false){
  if (targets.length){
    targets.length = 0;
    syncTargets();
  } else {
    setTargetMarkers([]);
  }
  if (resetSequence){
    recycledTargetIds = [];
    nextTargetId = 1;
  }
}
function toRendererPoint(event){
  const canvas = state.app.canvas ?? state.app.view;
  const rect = canvas.getBoundingClientRect();
  const resolution = state.app.renderer.resolution ?? 1;
  return {
    x: (event.clientX - rect.left) * resolution,
    y: (event.clientY - rect.top) * resolution,
  };
}

function clampWheelDelta(deltaY){
  const normalized = Math.max(-1, Math.min(1, deltaY / 100));
  return -normalized;
}

function pad2(value){
  return String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(2, '0');
}

function isInsideWorld(q, r){
  if (!Number.isFinite(q) || !Number.isFinite(r)) return false;
  return (
    q >= WORLD_BOUNDS.minQ &&
    q <= WORLD_BOUNDS.maxQ &&
    r >= WORLD_BOUNDS.minR &&
    r <= WORLD_BOUNDS.maxR
  );
}

function parseKey(key){
  const match = /^(\d+):(\d+)$/.exec(String(key));
  if (!match) return null;
  return { q: Number(match[1]), r: Number(match[2]) };
}

function offsetToCube(q, r){
  const col = Number(q);
  const row = Number(r);
  const x = col - (row - (row & 1)) / 2;
  const z = row;
  const y = -x - z;
  return { x, y, z };
}

function cubeDistance(a, b){
  if (!a || !b) return NaN;
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.z - b.z)
  );
}

function pad3(value){
  return String(Math.trunc(Number(value) || 0)).padStart(3, '0');
}

function setStatus(message){
  dom.status.textContent = message ?? '';
}

function reportZoom(zoomValue){
  if (!Number.isFinite(zoomValue)) return;
  const percentage = Math.round(zoomValue * 100);
  setStatus(`ズーム: ${percentage}%`);
}

function resolveDomRefs(idMap){
  const refs = {};
  for (const [key, id] of Object.entries(idMap)){
    const node = document.getElementById(id);
    if (!node){
      throw new Error(`DOM 要素 #${id} が見つかりません。`);
    }
    refs[key] = node;
  }
  return refs;
}
function createDebugPanel(){
  if (debugPanel) return debugPanel;
  const shell = document.getElementById('app-shell');
  if (!shell) return null;

  const panel = document.createElement('aside');
  panel.id = 'debug-panel';

  const title = document.createElement('h2');
  title.textContent = 'DEBUG';
  panel.appendChild(title);

  const content = document.createElement('div');
  content.className = 'debug-content';
  panel.appendChild(content);

  const decimate = getDecimateConfig();
  const nest = getNestOuterStyle();

  content.appendChild(createNumberControl({
    label: '間引き開始 Z',
    value: decimate.start,
    min: 0.05,
    max: 5,
    step: 0.05,
    precision: 2,
    onApply: (val) => {
      const applied = setDecimateStartZ(val);
      updateGrid(getState().zoom);
      requestSceneUpdate();
      return applied;
    },
  }));

  content.appendChild(createNumberControl({
    label: '間引きガンマ',
    value: decimate.gamma,
    min: 0.2,
    max: 5,
    step: 0.05,
    precision: 2,
    onApply: (val) => {
      const applied = setDecimateGamma(val);
      updateGrid(getState().zoom);
      requestSceneUpdate();
      return applied;
    },
  }));

  content.appendChild(createNumberControl({
    label: 'ネスト外周濃度',
    value: nest.intensity,
    min: 0,
    max: 2,
    step: 0.05,
    precision: 2,
    onApply: (val) => {
      const result = setNestOuterStyle({ intensity: val });
      redrawOverlay();
      requestSceneUpdate();
      return result.intensity;
    },
  }));

  content.appendChild(createNumberControl({
    label: 'ネスト外周透過',
    value: nest.alpha,
    min: 0,
    max: 1,
    step: 0.05,
    precision: 2,
    onApply: (val) => {
      const result = setNestOuterStyle({ alpha: val });
      redrawOverlay();
      requestSceneUpdate();
      return result.alpha;
    },
  }));

  shell.appendChild(panel);
  debugPanel = panel;
  return panel;
}

function createNumberControl({ label, value, min, max, step, precision = 2, onApply }){
  const wrapper = document.createElement('label');
  wrapper.className = 'debug-field';

  const title = document.createElement('span');
  title.className = 'debug-label';
  title.textContent = label;
  wrapper.appendChild(title);

  const input = document.createElement('input');
  input.type = 'number';
  if (Number.isFinite(min)) input.min = String(min);
  if (Number.isFinite(max)) input.max = String(max);
  if (Number.isFinite(step)) input.step = String(step);
  input.value = formatNumber(value, precision);
  wrapper.appendChild(input);

  const valueBadge = document.createElement('span');
  valueBadge.className = 'debug-value';
  valueBadge.textContent = formatNumber(value, precision);
  wrapper.appendChild(valueBadge);

  const commit = (raw) => {
    const numeric = Number.parseFloat(raw);
    const applied = onApply(Number.isFinite(numeric) ? numeric : value);
    const formatted = formatNumber(applied, precision);
    input.value = formatted;
    valueBadge.textContent = formatted;
  };

  input.addEventListener('change', () => commit(input.value));
  input.addEventListener('blur', () => commit(input.value));

  return wrapper;
}

function formatNumber(value, digits = 2){
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '0.00';
}


























































