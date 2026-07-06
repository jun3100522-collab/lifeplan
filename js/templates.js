/* ============================================
   templates.js — 初期データ（テンプレート）
   ・架空のサンプル世帯（夫60・妻58・子2人）の2プラン
     （サンプル：NISAあり / サンプル：NISAなし）
   ・新規プラン用の標準項目一覧
     （ペット費・お墓の管理費・相続・贈与 入り）
   ・金額の単位はすべて「万円」
   ※個人の実データはアプリに組み込まず、
     JSONファイルの読み込みで利用する方針
   ============================================ */
'use strict';

/* ---------- 汎用ヘルパー ---------- */

let __idSeq = 0;
function newId(prefix) {
  __idSeq += 1;
  return prefix + '_' + __idSeq + '_' + Math.random().toString(36).slice(2, 8);
}

/* from年〜to年 に同じ値を入れる（into に追記して返す） */
function fillYears(into, from, to, value) {
  for (let y = from; y <= to; y++) { into[y] = value; }
  return into;
}

function makeItem(name, values) {
  return { id: newId('item'), name: name, values: values || {} };
}

function makeMember(name, ageAtStart, events) {
  return { id: newId('mem'), name: name, ageAtStart: ageAtStart, events: events || {} };
}

/* ---------- 新規プラン用の標準項目 ---------- */

function defaultIncomeItems() {
  return [
    '本人の収入', '配偶者の収入', '年金（本人）', '年金（配偶者）',
    '相続・贈与', 'その他収入',
  ].map((n) => makeItem(n));
}

function defaultExpenseItems() {
  return [
    '基本生活費', '住宅関連費', '車両費', '保険', '教育費',
    '趣味・旅行費', 'ペット費', 'お墓の管理費', '特別な支出',
  ].map((n) => makeItem(n));
}

/* まっさらな新規プラン */
function makeBlankPlan(name, startYear, endYear) {
  return {
    id: newId('plan'),
    name: name,
    startYear: startYear,
    endYear: endYear,
    initialSavings: 0,          // 計画開始時点の貯蓄残高（万円）
    members: [makeMember('本人', 40)],
    incomeItems: defaultIncomeItems(),
    expenseItems: defaultExpenseItems(),
    investment: { enabled: false, initial: 0, rate: 3, contributions: {} },
  };
}

/* ---------- 初期プラン（架空のサンプル世帯） ---------- */

function buildDefaultPlans() {
  return [buildSamplePlanNisa(), buildSamplePlanNoNisa()];
}

/* サンプル共通: 家族構成（架空） */
function sampleMembers() {
  return [
    makeMember('夫', 60, { 2030: '退職' }),
    makeMember('妻', 58, { 2032: '退職' }),
    makeMember('長男', 28, { 2027: '結婚' }),
    makeMember('長女', 25, {}),
  ];
}

/* サンプル共通: 収入項目 */
function sampleIncomeItems() {
  return [
    makeItem('夫の収入', fillYears({ 2030: 200 }, 2025, 2029, 400)),
    makeItem('妻の収入', fillYears({}, 2025, 2032, 100)),
    makeItem('夫の年金', fillYears({ 2030: 90 }, 2031, 2058, 180)),
    makeItem('妻の年金', fillYears({}, 2032, 2058, 80)),
    makeItem('相続・贈与', {}),      // 必要になったら金額を入力
    makeItem('その他収入', fillYears({}, 2025, 2058, 12)),
  ];
}

/* サンプル共通: 支出項目 */
function sampleExpenseItems() {
  return [
    makeItem('基本生活費', fillYears({}, 2025, 2058, 300)),
    makeItem('住宅関連費', fillYears({}, 2025, 2058, 50)),
    makeItem('住宅ローン', fillYears({}, 2025, 2040, 60)),
    makeItem('固定資産税', fillYears({}, 2025, 2058, 10)),
    makeItem('趣味・旅行費', fillYears({}, 2025, 2058, 30)),
    makeItem('ペット費', {}),
    makeItem('お墓の管理費', {}),
    makeItem('特別な支出', { 2026: 150 }),   // 例: リフォーム
  ];
}

/* プラン1: サンプル：NISAあり */
function buildSamplePlanNisa() {
  return {
    id: newId('plan'),
    name: 'サンプル：NISAあり',
    startYear: 2025,
    endYear: 2058,
    initialSavings: 800,
    members: sampleMembers(),
    incomeItems: sampleIncomeItems(),
    expenseItems: sampleExpenseItems(),
    investment: {
      enabled: true,
      initial: 300,   // 計画開始時点のNISA残高（万円）
      rate: 5,        // 想定年利（%）
      // 追加投資（プラス）と取り崩し（マイナス）
      contributions: fillYears(fillYears({}, 2025, 2029, 24), 2035, 2050, -60),
    },
  };
}

/* プラン2: サンプル：NISAなし */
function buildSamplePlanNoNisa() {
  return {
    id: newId('plan'),
    name: 'サンプル：NISAなし',
    startYear: 2025,
    endYear: 2058,
    initialSavings: 800,
    members: sampleMembers(),
    incomeItems: sampleIncomeItems(),
    expenseItems: sampleExpenseItems(),
    investment: { enabled: false, initial: 0, rate: 3, contributions: {} },
  };
}
