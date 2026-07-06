/* ============================================
   model.js — 計算エンジン
   ・収入合計 / 支出合計 / 年間収支 / 年末貯蓄残高
   ・複利運用シミュレーション（NISA等）
   計算の仕組み（元Excelと同じ）:
     年末貯蓄残高 = 前年残高 + 年間収支 − 追加投資
     運用資産残高 = 前年残高 ×(1+年利) + 追加投資
     （取り崩しは追加投資をマイナスにする → 貯蓄に戻る）
   ============================================ */
'use strict';

/* プランの対象年を配列で返す（例: [2025, 2026, ..., 2058]） */
function planYears(plan) {
  const years = [];
  for (let y = plan.startYear; y <= plan.endYear; y++) { years.push(y); }
  return years;
}

/* 項目のある年の値を数値で返す（未入力は0） */
function itemValue(item, year) {
  const v = Number(item.values ? item.values[year] : 0);
  return Number.isFinite(v) ? v : 0;
}

/* メンバーのその年の年齢 */
function memberAge(plan, member, year) {
  return member.ageAtStart + (year - plan.startYear);
}

/* ---------- メイン計算 ---------- */
function computePlan(plan) {
  const years = planYears(plan);

  const sumOf = (items) =>
    years.map((y) => items.reduce((total, it) => total + itemValue(it, y), 0));

  const incomeTotals = sumOf(plan.incomeItems);
  const expenseTotals = sumOf(plan.expenseItems);
  const net = years.map((_, i) => incomeTotals[i] - expenseTotals[i]);

  const inv = plan.investment || {};
  const invEnabled = !!inv.enabled;
  const rate = invEnabled ? (Number(inv.rate) || 0) / 100 : 0;

  const savings = [];   // 年末貯蓄残高
  const invest = [];    // 運用資産残高
  const total = [];     // 総資産（貯蓄+運用）

  let s = Number(plan.initialSavings) || 0;
  let v = invEnabled ? (Number(inv.initial) || 0) : 0;

  years.forEach((y, i) => {
    const c = invEnabled ? (Number(inv.contributions ? inv.contributions[y] : 0) || 0) : 0;
    if (i === 0) {
      v = v + c;                 // 初年は利息なし（期首残高+追加投資）
    } else {
      v = v * (1 + rate) + c;    // 前年残高に利息、その後に追加投資/取り崩し
    }
    s = s + net[i] - c;          // 追加投資分は貯蓄から出る（取り崩しは戻る）
    savings.push(s);
    invest.push(v);
    total.push(s + v);
  });

  /* ---------- 指標 ---------- */
  const first = plan.members && plan.members[0];
  const depIdx = savings.findIndex((x) => x < 0);
  const metrics = {
    endSavings: savings[savings.length - 1],
    endInvest: invest[invest.length - 1],
    endTotal: total[total.length - 1],
    lifetimeNet: net.reduce((a, b) => a + b, 0),
    depletionYear: depIdx >= 0 ? years[depIdx] : null,
    depletionAge: (depIdx >= 0 && first) ? memberAge(plan, first, years[depIdx]) : null,
  };

  return { years, incomeTotals, expenseTotals, net, savings, invest, total, metrics };
}

/* ---------- 表示用: 万円の数値を「1,234.5」形式に ---------- */
function fmtMan(n) {
  const r = Math.round((Number(n) || 0) * 10) / 10;
  return r.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
}
