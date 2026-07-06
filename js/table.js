/* ============================================
   table.js — 収支表（年次キャッシュフロー表）
   ・縦=項目、横=年 の編集可能な表
   ・項目の追加/削除/名前変更/並べ替え
   ・「→」ボタンで選択セルの値を右の年へ一括コピー
   ・合計・残高は入力のたびに自動再計算
   ============================================ */
'use strict';

let CF_WIRED = false;      // イベント登録が済んだか
let CF_FOCUSED = null;     // 最後にクリックしたセル { type, id, year }

/* ---------- 表の描画 ---------- */
function renderCashflowTable(plan) {
  const area = document.getElementById('cashflow-table-area');
  if (!area) return;
  area.classList.remove('placeholder-note');

  const result = computePlan(plan);
  const years = result.years;
  const colspan = years.length + 2;
  const invOn = plan.investment && plan.investment.enabled;

  let html = '<div class="table-scroll"><table class="cf-table"><thead>';

  /* 年ヘッダー */
  html += '<tr><th class="col-ops">操作</th><th class="col-name">項目</th>';
  years.forEach((y) => { html += `<th>${y}</th>`; });
  html += '</tr></thead><tbody>';

  /* 年齢・ライフイベント行 */
  plan.members.forEach((mem) => {
    html += `<tr class="age-row"><td class="col-ops"></td><td class="col-name">${esc(mem.name)}の年齢</td>`;
    years.forEach((y) => {
      const ev = mem.events ? mem.events[y] : null;
      html += `<td class="num">${memberAge(plan, mem, y)}${ev ? `<div class="evt">${esc(ev)}</div>` : ''}</td>`;
    });
    html += '</tr>';
  });

  /* 収入 */
  html += sectionRow('💰 収入（万円）', 'income', colspan);
  plan.incomeItems.forEach((it) => { html += itemRow('income', it, years); });
  html += calcRow('収入合計 (A)', 'incomeTotal', result.incomeTotals, 'calc-total');

  /* 支出 */
  html += sectionRow('💸 支出（万円）', 'expense', colspan);
  plan.expenseItems.forEach((it) => { html += itemRow('expense', it, years); });
  html += calcRow('支出合計 (B)', 'expenseTotal', result.expenseTotals, 'calc-total');

  /* 収支・資産 */
  html += sectionRow('🏦 収支・資産（万円）', null, colspan);
  html += calcRow('年間収支 (A−B)', 'net', result.net, '');
  if (invOn) { html += contribRow(plan, years); }
  html += calcRow('年末貯蓄残高', 'savings', result.savings, 'calc-balance');
  if (invOn) {
    html += calcRow(`運用資産残高（年利${plan.investment.rate}%）`, 'invest', result.invest, '');
    html += calcRow('総資産（貯蓄＋運用）', 'total', result.total, 'calc-balance');
  }

  html += '</tbody></table></div>';
  area.innerHTML = html;

  if (!CF_WIRED) { wireCashflowTable(area); CF_WIRED = true; }
}

/* ---------- 行の部品 ---------- */

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sectionRow(title, addType, colspan) {
  const btn = addType
    ? ` <button class="mini" data-action="add" data-type="${addType}">＋ 項目を追加</button>`
    : '';
  return `<tr class="section-row"><td colspan="${colspan}"><span class="section-inner">${title}${btn}</span></td></tr>`;
}

function itemRow(type, it, years) {
  let html = `<tr>
    <td class="col-ops">
      <button class="mini" data-action="up" data-type="${type}" data-id="${it.id}" title="上へ移動">↑</button><button class="mini" data-action="down" data-type="${type}" data-id="${it.id}" title="下へ移動">↓</button><button class="mini" data-action="rename" data-type="${type}" data-id="${it.id}" title="名前を変更">✎</button><button class="mini" data-action="copyright" data-type="${type}" data-id="${it.id}" title="クリックしたセルの値を右の年すべてにコピー">→</button><button class="mini danger" data-action="del" data-type="${type}" data-id="${it.id}" title="この項目を削除">🗑</button>
    </td>
    <td class="col-name">${esc(it.name)}</td>`;
  years.forEach((y) => {
    const v = (it.values && it.values[y] !== undefined) ? it.values[y] : '';
    html += `<td class="num"><input type="number" step="0.1" data-kind="cell" data-type="${type}" data-id="${it.id}" data-year="${y}" value="${v}"></td>`;
  });
  return html + '</tr>';
}

/* 追加投資（運用資金の出し入れ）行 */
function contribRow(plan, years) {
  let html = `<tr>
    <td class="col-ops">
      <button class="mini" data-action="copyright" data-type="contrib" data-id="contrib" title="クリックしたセルの値を右の年すべてにコピー">→</button>
    </td>
    <td class="col-name">追加投資（＋）／取り崩し（−）</td>`;
  years.forEach((y) => {
    const c = plan.investment.contributions || {};
    const v = (c[y] !== undefined) ? c[y] : '';
    html += `<td class="num"><input type="number" step="1" data-kind="cell" data-type="contrib" data-id="contrib" data-year="${y}" value="${v}"></td>`;
  });
  return html + '</tr>';
}

function calcRow(label, key, arr, cls) {
  let html = `<tr class="calc-row ${cls}"><td class="col-ops"></td><td class="col-name">${label}</td>`;
  arr.forEach((v, i) => {
    html += `<td class="num"><span data-calc="${key}" data-idx="${i}" class="${v < 0 ? 'text-danger' : ''}">${fmtMan(v)}</span></td>`;
  });
  return html + '</tr>';
}

/* ---------- データの読み書き ---------- */

function findItems(plan, type) {
  return type === 'income' ? plan.incomeItems : plan.expenseItems;
}

function getCellValue(plan, type, id, year) {
  if (type === 'contrib') {
    return plan.investment.contributions ? plan.investment.contributions[year] : undefined;
  }
  const it = findItems(plan, type).find((x) => x.id === id);
  return it && it.values ? it.values[year] : undefined;
}

function setCellValue(plan, type, id, year, rawValue) {
  const num = rawValue === '' || rawValue === undefined ? undefined : Number(rawValue);
  if (type === 'contrib') {
    if (!plan.investment.contributions) plan.investment.contributions = {};
    if (num === undefined || !Number.isFinite(num)) delete plan.investment.contributions[year];
    else plan.investment.contributions[year] = num;
    return;
  }
  const it = findItems(plan, type).find((x) => x.id === id);
  if (!it) return;
  if (!it.values) it.values = {};
  if (num === undefined || !Number.isFinite(num)) delete it.values[year];
  else it.values[year] = num;
}

/* ---------- イベント処理（初回のみ登録） ---------- */

function wireCashflowTable(area) {
  /* セルをクリック/フォーカスしたら位置を覚える（→ボタン用） */
  area.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t.matches && t.matches('input[data-kind="cell"]')) {
      CF_FOCUSED = { type: t.dataset.type, id: t.dataset.id, year: Number(t.dataset.year) };
    }
  });

  /* 値の変更 → 再計算 */
  area.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.matches || !t.matches('input[data-kind="cell"]')) return;
    setCellValue(currentPlan(), t.dataset.type, t.dataset.id, Number(t.dataset.year), t.value);
    afterDataChange(false);
  });

  /* 操作ボタン */
  area.addEventListener('click', (e) => {
    const btn = e.target.closest ? e.target.closest('button[data-action]') : null;
    if (!btn) return;
    handleTableAction(currentPlan(), btn.dataset.action, btn.dataset.type, btn.dataset.id);
  });
}

function handleTableAction(plan, action, type, id) {
  if (action === 'add') {
    const name = prompt('追加する項目の名前を入力してください（例: ペット費、相続）');
    if (!name || !name.trim()) return;
    findItems(plan, type).push(makeItem(name.trim()));
    afterDataChange(true);
    return;
  }

  if (action === 'copyright') {
    if (!CF_FOCUSED || CF_FOCUSED.id !== id) {
      alert('コピー元にしたいセルを一度クリックしてから「→」ボタンを押してください。');
      return;
    }
    const from = CF_FOCUSED.year;
    const src = getCellValue(plan, type, id, from);
    for (let y = from + 1; y <= plan.endYear; y++) {
      setCellValue(plan, type, id, y, src === undefined ? '' : src);
    }
    afterDataChange(true);
    return;
  }

  const items = findItems(plan, type);
  const idx = items.findIndex((x) => x.id === id);
  if (idx < 0) return;

  if (action === 'up' && idx > 0) {
    [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
    afterDataChange(true);
  } else if (action === 'down' && idx < items.length - 1) {
    [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
    afterDataChange(true);
  } else if (action === 'rename') {
    const n = prompt('新しい項目名を入力してください', items[idx].name);
    if (n && n.trim()) { items[idx].name = n.trim(); afterDataChange(true); }
  } else if (action === 'del') {
    if (confirm(`「${items[idx].name}」の行を削除します。よろしいですか？`)) {
      items.splice(idx, 1);
      afterDataChange(true);
    }
  }
}

/* ---------- 再計算・再描画 ---------- */

/* structural=true: 行の増減など → 表ごと作り直し
   structural=false: 値の変更のみ → 計算セルだけ更新（入力位置を保つ） */
function afterDataChange(structural) {
  if (structural) {
    render();
    return;
  }
  const plan = currentPlan();
  const result = computePlan(plan);
  updateCalcCells(result);
  renderSummaryCards(plan, result);
  renderCharts(plan, result);
  renderCompare();
  saveToLocal();
}

function updateCalcCells(result) {
  const map = {
    incomeTotal: result.incomeTotals,
    expenseTotal: result.expenseTotals,
    net: result.net,
    savings: result.savings,
    invest: result.invest,
    total: result.total,
  };
  document.querySelectorAll('#cashflow-table-area [data-calc]').forEach((el) => {
    const arr = map[el.dataset.calc];
    if (!arr) return;
    const v = arr[Number(el.dataset.idx)];
    el.textContent = fmtMan(v);
    el.classList.toggle('text-danger', v < 0);
  });
}
