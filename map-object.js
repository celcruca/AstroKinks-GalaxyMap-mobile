/* =============================================================================
 * Project : アストロキングス - 蠱毒な銀河へようこそ！
 * File    : map-object.js
 * Version : Ver. 0.02 / Rev. 014
 * Date    : 2025-10-07 (火)
 * Library : -
 * Function: 正典マップオブジェクト定義（固定体・ネスト・進入禁止領域）
 * Notes   : radiusHex はヘクス半径係数。描画側で HEX_METRICS.radius と掛け合わせて px に換算する。
 * =============================================================================
 */

export const CATEGORY = Object.freeze({
  FIXED: 'FIXED',
  NEST: 'NEST',
  NO_ENTRY: 'NOENT',
});

export const FIXED_OBJECTS = Object.freeze([
  // --- Tenebris / テネブリース（中核天体）
  { key: '500:478', name: 'テネブリース', category: CATEGORY.FIXED, type: 'tenebris', radiusHex: 1 },

  // --- Tenebris Satellites / テネブリース衛星群
  { key: '500:470', name: 'ホルンダル', category: CATEGORY.FIXED, type: 'satellite', radiusHex: 0 },
  { key: '500:486', name: 'ノナ',       category: CATEGORY.FIXED, type: 'satellite', radiusHex: 0 },
  { key: '506:474', name: 'ベローナ',   category: CATEGORY.FIXED, type: 'satellite', radiusHex: 0 },
  { key: '506:482', name: 'モルタ',     category: CATEGORY.FIXED, type: 'satellite', radiusHex: 0 },
  { key: '494:482', name: 'デシマ',     category: CATEGORY.FIXED, type: 'satellite', radiusHex: 0 },
  { key: '494:474', name: 'クイリヌス', category: CATEGORY.FIXED, type: 'satellite', radiusHex: 0 },

  // --- Trade Planets / 貿易惑星
  { key: '300:200', name: 'アルファ', category: CATEGORY.FIXED, type: 'planet', radiusHex: 5 },
  { key: '150:500', name: 'ベータ',   category: CATEGORY.FIXED, type: 'planet', radiusHex: 5 },
  { key: '300:800', name: 'シグマ',   category: CATEGORY.FIXED, type: 'planet', radiusHex: 5 },
  { key: '700:200', name: 'ラムダ',   category: CATEGORY.FIXED, type: 'planet', radiusHex: 5 },
  { key: '850:500', name: 'デルタ',   category: CATEGORY.FIXED, type: 'planet', radiusHex: 5 },
  { key: '700:800', name: 'タウ',     category: CATEGORY.FIXED, type: 'planet', radiusHex: 5 },
]);

export const ASTRO_NESTS = Object.freeze([
  { key: '425:485', name: 'RSF',  iff: 'SELF', radiusHex: 13 },
  { key: '395:461', name: 'AaA',  iff: 'SUBF', radiusHex: 10 },
  { key: '571:374', name: 'Nga',  iff: 'SUBF', radiusHex: 13 },
  { key: '400:430', name: 'PGC',  iff: 'SUBF', radiusHex: 13 },
  { key: '421:410', name: 'DWR',  iff: 'SUBF', radiusHex: 11 },
  { key: '375:400', name: 'flp',  iff: 'NEUT', radiusHex: 10 },
  { key: '541:422', name: 'swf',  iff: 'FRND', radiusHex: 13 },
  { key: '485:425', name: 'RED',  iff: 'ENMY', radiusHex: 13 },
  { key: '500:528', name: 'Red',  iff: 'ENMY', radiusHex: 13 },
  { key: '513:433', name: 'NGE',  iff: 'ENMY', radiusHex: 11 },
  { key: '483:394', name: 'SoR',  iff: 'ENMY', radiusHex: 12 },
  { key: '610:485', name: 'VTF',  iff: 'ENMY', radiusHex: 13 },
  { key: '399:530', name: 'vtf',  iff: 'NEUT', radiusHex: 10 },
  { key: '517:367', name: 'VtF',  iff: 'NEUT', radiusHex: 10 },
  { key: '585:433', name: 'ShC',  iff: 'ENMY', radiusHex: 13 },
  { key: '574:246', name: 'Shc',  iff: 'NEUT', radiusHex: 12 },
  { key: '588:283', name: 'FPA',  iff: 'NEUT', radiusHex: 11 },
  { key: '422:452', name: 'VOK',  iff: 'CHEK', radiusHex: 10 },
  { key: '452:334', name: 'OJY',  iff: 'NEUT', radiusHex: 13 },
  { key: '610:454', name: 'SwF',  iff: 'NEUT', radiusHex: 10 },
  { key: '455:446', name: 'GND',  iff: 'NEUT', radiusHex: 11 },
  { key: '459:510', name: 'GOP',  iff: 'NEUT', radiusHex: 11 },
  { key: '434:606', name: 'gop',  iff: 'NEUT', radiusHex: 10 },
  { key: '551:552', name: 'SKY',  iff: 'NEUT', radiusHex: 13 },
  { key: '559:516', name: 'MMM',  iff: 'ENMY', radiusHex: 13 },
  { key: '473:572', name: 'MMm',  iff: 'NEUT', radiusHex: 13 },
  { key: '591:509', name: 'mmM',  iff: 'NEUT', radiusHex: 13 },
  { key: '663:759', name: 'mmm',  iff: 'NEUT', radiusHex: 11 },
  { key: '634:552', name: 'FJT',  iff: 'NEUT', radiusHex: 12 },
  { key: '458:619', name: 'AKD',  iff: 'NEUT', radiusHex: 13 },
  { key: '530:530', name: 'Dog',  iff: 'NEUT', radiusHex: 10 },
  { key: '426:543', name: 'SSX',  iff: 'NEUT', radiusHex: 11 },
  { key: '428:574', name: 'RBT',  iff: 'NEUT', radiusHex: 13 },
  { key: '457:542', name: 'LMV',  iff: 'NEUT', radiusHex: 11 },
  { key: '374:585', name: 'MHR',  iff: 'NEUT', radiusHex: 13 },
  { key: '504:228', name: 'mhr',  iff: 'NEUT', radiusHex: 12 },
  { key: '308:698', name: 'Mh0',  iff: 'NEUT', radiusHex: 10 },
  { key: '397:499', name: 'GJR',  iff: 'NEUT', radiusHex: 10 },
  { key: '614:525', name: 'HYT',  iff: 'NEUT', radiusHex: 11 },
  { key: '636:472', name: 'Azu',  iff: 'NEUT', radiusHex: 11 },
  { key: '574:480', name: 'IFG',  iff: 'NEUT', radiusHex: 11 },
  { key: '515:402', name: 'ZD6',  iff: 'NEUT', radiusHex: 10 },
  { key: '523:570', name: 'RSC',  iff: 'NEUT', radiusHex: 10 },
  { key: '591:541', name: 'RTC',  iff: 'NEUT', radiusHex: 11 },
  { key: '657:489', name: 'BTC',  iff: 'NEUT', radiusHex: 11 },
  { key: '572:581', name: 'OWL',  iff: 'NEUT', radiusHex: 13 },
  { key: '545:601', name: 'Kum',  iff: 'NEUT', radiusHex: 12 },
  { key: '557:632', name: 'SbU',  iff: 'NEUT', radiusHex: 10 },
  { key: '503:608', name: 'GEU',  iff: 'NEUT', radiusHex: 11 },
  { key: '484:634', name: 'SSS',  iff: 'NEUT', radiusHex: 10 },
  { key: '425:650', name: 'TOP',  iff: 'NEUT', radiusHex: 11 },
  { key: '361:501', name: 'mon',  iff: 'NEUT', radiusHex: 11 },
  { key: '364:436', name: 'nWo',  iff: 'NEUT', radiusHex: 11 },
  { key: '604:399', name: 'GFN',  iff: 'NEUT', radiusHex: 10 },
  { key: '626:416', name: 'C24',  iff: 'NEUT', radiusHex: 13 },
  { key: '174:552', name: 'DLT',  iff: 'NEUT', radiusHex: 10 },
  { key: '370:554', name: 'KST',  iff: 'NEUT', radiusHex: 10 },
  { key: '379:202', name: 'cat',  iff: 'NEUT', radiusHex: 10 },
  { key: '358:148', name: 'ISC',  iff: 'NEUT', radiusHex: 10 },
  { key: '321:183', name: 'JJJ',  iff: 'NEUT', radiusHex: 10 },
  { key: '306:209', name: 'apo',  iff: 'NEUT', radiusHex: 10 },
  { key: '307:307', name: 'SIR',  iff: 'NEUT', radiusHex: 10 },
  { key: '302:555', name: 'CAT',  iff: 'NEUT', radiusHex: 10 },
  { key: '305:592', name: 'CoP',  iff: 'NEUT', radiusHex: 10 },
  { key: '422:247', name: 'MML',  iff: 'NEUT', radiusHex: 11 },
  { key: '362:693', name: 'PME',  iff: 'NEUT', radiusHex: 10 },
  { key: '415:360', name: 'YKM',  iff: 'NEUT', radiusHex: 10 },
  { key: '421:289', name: 'FFZ',  iff: 'NEUT', radiusHex: 11 },
  { key: '393:296', name: 'TMT',  iff: 'NEUT', radiusHex: 12 },
  { key: '440:210', name: 'UFF',  iff: 'NEUT', radiusHex: 10 },
  { key: '495:308', name: 'Zei',  iff: 'NEUT', radiusHex: 11 },
  { key: '601:314', name: 'UJT',  iff: 'NEUT', radiusHex: 11 },
  { key: '601:356', name: '15P',  iff: 'NEUT', radiusHex: 10 },
  { key: '663:369', name: 'WTF',  iff: 'NEUT', radiusHex: 11 },
  { key: '677:407', name: 'GIS',  iff: 'NEUT', radiusHex: 10 },
  { key: '674:459', name: 'Rav',  iff: 'NEUT', radiusHex: 10 },
  { key: '698:427', name: 'sen',  iff: 'NEUT', radiusHex: 10 },
  { key: '656:578', name: 'MGT',  iff: 'NEUT', radiusHex: 11 },
  { key: '643:520', name: 'MFF',  iff: 'NEUT', radiusHex: 13 },
  { key: '601:601', name: '601',  iff: 'NEUT', radiusHex: 10 },
  { key: '585:640', name: 'POM',  iff: 'NEUT', radiusHex: 10 },
  { key: '712:572', name: 'JGL',  iff: 'NEUT', radiusHex: 10 },
  { key: '731:829', name: 'SKM',  iff: 'NEUT', radiusHex: 10 },
  { key: '626:338', name: 'amt',  iff: 'NEUT', radiusHex: 11 },
  { key: '336:262', name: 'pm6',  iff: 'NEUT', radiusHex: 10 },
  { key: '366:658', name: 'KSN',  iff: 'NEUT', radiusHex: 12 },
  { key: '526:656', name: 'BKH',  iff: 'NEUT', radiusHex: 13 },
  { key: '482:672', name: 'GNG',  iff: 'NEUT', radiusHex: 11 },


]);

const NEST_OBJECTS = Object.freeze(
  ASTRO_NESTS.map((nest) => Object.freeze({ ...nest, category: CATEGORY.NEST }))
);

export const NO_ENTRY_ZONES = Object.freeze([
  {
    key: 'NOENT:CENTER',
    name: '侵入禁止エリア(銀河中心領域)',
    category: CATEGORY.NO_ENTRY,
    attrs: { outer: ['450:450', '549:450', '549:499', '450:499'] },
  },
  {
    key: 'NOENT:CORE',
    name: '統合管理領域',
    category: CATEGORY.NO_ENTRY,
    attrs: { rect: { q0: 10, r0: 10, q1: 14, r1: 15 } },
  },
]);

export const OBJECT_LIST = Object.freeze([
  ...FIXED_OBJECTS,
  ...NEST_OBJECTS,
  ...NO_ENTRY_ZONES,
]);

export default OBJECT_LIST;
