/* ============================================
   excel.js — Excel 入出力（SheetJS 利用）
   ・書き出し: 全プランを1つの.xlsxに（1プラン=1シート）
     合計・残高セルにはExcelの数式も埋め込むので、
     Excel上で数字を変えても自動再計算される
   ・読み込み: このアプリが書き出した形式の
     .xlsx / .csv からプランを追加読み込み
   ============================================ */
'use strict';

/* ---------- 書き出し ---------- */

function exportExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel機能の利用にはインターネット接続が必要です。接続してから再読み込み（Ctrl+F5）してください。');
    return;
  }
  const wb = XLSX.utils.book_new();
  const used = new Set();
  APP.plans.forEach((plan) => {
    const ws = planToSheet(plan);
    /* シート名: 31文字以内・使用禁止文字を除去・重複回避 */
    let name = plan.name.replace(/[\[\]\*\?\/\\:]/g, '_').slice(0, 31) || 'プラン';
    const base = name;
    let i = 2;
    while (used.has(name)) { name = base.slice(0, 28) + '_' + i; i += 1; }
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  XLSX.writeFile(wb, `ライフプラン_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`);
}

function planToSheet(plan) {
  const years = planYears(plan);
  const result = computePlan(plan);
  const inv = (plan.investment && plan.investment.enabled) ? plan.investment : null;

  const itemCells = (it) =>
    years.map((y) => (it.values && it.values[y] !== undefined ? it.values[y] : null));

  const aoa = [];
  aoa.push([`ライフプランシート「${plan.name}」（単位: 万円）`]);
  aoa.push(['年', ...years]);

  plan.members.forEach((m) => {
    aoa.push([`${m.name}の年齢`, ...years.map((y) => memberAge(plan, m, y))]);
    if (m.events && Object.keys(m.events).length) {
      aoa.push([`${m.name}のライフイベント`, ...years.map((y) => m.events[y] || null)]);
    }
  });

  aoa.push([]);
  aoa.push(['■ 収入']);
  const incRows = [];
  plan.incomeItems.forEach((it) => { aoa.push([it.name, ...itemCells(it)]); incRows.push(aoa.length); });
  aoa.push(['収入合計(A)', ...result.incomeTotals]);
  const rowA = aoa.length;

  aoa.push(['■ 支出']);
  const expRows = [];
  plan.expenseItems.forEach((it) => { aoa.push([it.name, ...itemCells(it)]); expRows.push(aoa.length); });
  aoa.push(['支出合計(B)', ...result.expenseTotals]);
  const rowB = aoa.length;

  aoa.push(['年間収支(A-B)', ...result.net]);
  const rowNet = aoa.length;

  let rowC = null;
  if (inv) {
    /* 数式から参照されるため、空欄は0で埋める */
    aoa.push(['追加投資（＋）／取り崩し（−）',
      ...years.map((y) => Number((inv.contributions || {})[y] || 0))]);
    rowC = aoa.length;
  }

  aoa.push(['年末貯蓄残高', ...result.savings]);
  const rowS = aoa.length;

  let rowV = null;
  let rowT = null;
  if (inv) {
    aoa.push([`運用資産残高（年利${inv.rate}%）`, ...result.invest]);
    rowV = aoa.length;
    aoa.push(['総資産（貯蓄＋運用）', ...result.total]);
    rowT = aoa.length;
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  /* 合計・残高セルに数式を設定（値も入れてあるので開いた瞬間から表示される） */
  const colL = (i) => XLSX.utils.encode_col(i + 1);   // データはB列から
  years.forEach((y, i) => {
    const c = colL(i);
    const prev = i > 0 ? colL(i - 1) : null;
    const setF = (row, f) => {
      const addr = `${c}${row}`;
      if (ws[addr]) ws[addr].f = f;
      else ws[addr] = { t: 'n', v: 0, f: f };
    };
    if (incRows.length) setF(rowA, `SUM(${c}${incRows[0]}:${c}${incRows[incRows.length - 1]})`);
    if (expRows.length) setF(rowB, `SUM(${c}${expRows[0]}:${c}${expRows[expRows.length - 1]})`);
    setF(rowNet, `${c}${rowA}-${c}${rowB}`);
    const minusC = rowC ? `-${c}${rowC}` : '';
    if (i === 0) {
      setF(rowS, `${Number(plan.initialSavings) || 0}+${c}${rowNet}${minusC}`);
      if (inv) setF(rowV, `${Number(inv.initial) || 0}+${c}${rowC}`);
    } else {
      setF(rowS, `${prev}${rowS}+${c}${rowNet}${minusC}`);
      if (inv) setF(rowV, `${prev}${rowV}*${1 + (Number(inv.rate) || 0) / 100}+${c}${rowC}`);
    }
    if (inv) setF(rowT, `${c}${rowS}+${c}${rowV}`);
  });

  ws['!cols'] = [{ wch: 28 }, ...years.map(() => ({ wch: 9 }))];
  return ws;
}

/* ---------- 読み込み ---------- */

function importExcelFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const wb = XLSX.read(reader.result, { type: 'array' });
      const plans = [];
      wb.SheetNames.forEach((name) => {
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true });
        const p = parsePlanSheet(name, aoa);
        if (p) plans.push(p);
      });
      if (!plans.length) {
        alert('このファイルからプランを読み取れませんでした。\nこのアプリの「📊 Excel書き出し」で作ったファイルを選んでください。');
        return;
      }
      if (!confirm(`${plans.length} 件のプラン（${plans.map((p) => p.name).join('、')}）を読み込み、今のプラン一覧に追加します。よろしいですか？`)) {
        return;
      }
      plans.forEach((p) => APP.plans.push(p));
      APP.currentPlanId = plans[0].id;
      refreshPlanSelect();
      render();
      alert('読み込みが完了しました。');
    } catch (e) {
      alert('読み込みに失敗しました: ' + e.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

/* このアプリの書き出し形式のシート1枚をプランに変換（形式が違えば null） */
function parsePlanSheet(sheetName, aoa) {
  const yearRow = aoa.find((r) => r && String(r[0]).trim() === '年');
  if (!yearRow) return null;
  const years = [];
  for (let i = 1; i < yearRow.length; i++) {
    const v = Number(yearRow[i]);
    if (Number.isFinite(v) && v > 1900 && v < 2200) years.push(v);
  }
  if (!years.length) return null;

  const plan = makeBlankPlan(sheetName, years[0], years[years.length - 1]);
  plan.members = [];
  plan.incomeItems = [];
  plan.expenseItems = [];
  plan.investment = { enabled: false, initial: 0, rate: 3, contributions: {} };

  const cellNum = (r, i) => {
    const v = Number(r[i + 1]);
    return Number.isFinite(v) ? v : undefined;
  };
  const rowVals = (r) => {
    const o = {};
    years.forEach((y, i) => {
      const v = cellNum(r, i);
      if (v !== undefined) o[y] = v;
    });
    return o;
  };

  let mode = null;          // 'income' / 'expense'
  let savings0;             // 初年の年末貯蓄残高（期首の逆算用）
  let invest0;              // 初年の運用資産残高

  aoa.forEach((r) => {
    if (!r || r[0] === undefined || r[0] === null || String(r[0]).trim() === '') return;
    const label = String(r[0]).trim();
    let m;
    if (label === '年' || label.startsWith('ライフプランシート')) return;
    if ((m = label.match(/^(.+)の年齢$/))) {
      const age = Number(r[1]);
      plan.members.push(makeMember(m[1], Number.isFinite(age) ? age : 0));
      return;
    }
    if ((m = label.match(/^(.+)のライフイベント$/))) {
      const mem = plan.members.find((x) => x.name === m[1]);
      if (mem) {
        years.forEach((y, i) => {
          const ev = r[i + 1];
          if (ev !== undefined && ev !== null && String(ev).trim() !== '') mem.events[y] = String(ev).trim();
        });
      }
      return;
    }
    if (label.startsWith('■')) {
      mode = label.includes('収入') ? 'income' : (label.includes('支出') ? 'expense' : null);
      return;
    }
    if (label.startsWith('収入合計') || label.startsWith('支出合計')) { mode = null; return; }
    if (label.startsWith('年間収支') || label.startsWith('総資産')) return;
    if (label.startsWith('追加投資')) { plan.investment.contributions = rowVals(r); return; }
    if (label === '年末貯蓄残高') { savings0 = cellNum(r, 0); return; }
    if ((m = label.match(/^運用資産残高（年利([\d.]+)%）/))) {
      plan.investment.enabled = true;
      plan.investment.rate = Number(m[1]);
      invest0 = cellNum(r, 0);
      return;
    }
    if (mode === 'income') { plan.incomeItems.push(makeItem(label, rowVals(r))); return; }
    if (mode === 'expense') { plan.expenseItems.push(makeItem(label, rowVals(r))); return; }
  });

  if (!plan.incomeItems.length && !plan.expenseItems.length) return null;
  if (!plan.members.length) plan.members = [makeMember('本人', 40)];

  /* 期首貯蓄・運用開始残高を初年の値から逆算 */
  const round1 = (n) => Math.round(n * 10) / 10;
  const c0 = Number(plan.investment.contributions[years[0]] || 0);
  if (savings0 !== undefined) {
    const r0 = computePlan(plan);   // initialSavings=0 の状態で初年の収支を得る
    plan.initialSavings = round1(savings0 - r0.net[0] + c0);
  }
  if (plan.investment.enabled && invest0 !== undefined) {
    plan.investment.initial = round1(invest0 - c0);
  }
  return plan;
}
