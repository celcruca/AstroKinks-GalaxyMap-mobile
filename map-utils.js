/* =============================================================================
 * Project : アストロキングス - 蠱毒な銀河へようこそ！
 * File    : map-utils.js
 * Version : Ver. 0.02 / Rev. 014
 * Date    : 2025-10-07 (火)
 * Library : -
 * Function: 正典補助関数群（算術・補間・量子化）
 * Notes   : -
 * =============================================================================
 */

export const SQRT3 = Math.sqrt(3);

export function clamp(value, min, max){
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function quantizeUp(value, step = 1){
  const s = step > 0 ? step : 1;
  return Math.ceil(value / s) * s;
}

export function snap05(value){
  return Math.floor(value) + 0.5;
}

export function lerp(a, b, t){
  return a + (b - a) * t;
}

export function approxEqual(a, b, epsilon = 1e-6){
  return Math.abs(a - b) <= epsilon;
}
