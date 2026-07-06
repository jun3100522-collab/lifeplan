/* ============================================
   app.js — 全体の制御
   ・タブ切り替え
   ・プラン選択
   ・ダッシュボードのサマリーカード表示
   ============================================ */
'use strict';

/* アプリ全体の状態 */
const APP = {
  plans: [],
  currentPlanId: null,
};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initHeaderButtons();
  /* 前回の保存データがあれば復元、なければExcel移植の初期データ */
  const saved = loadFromLocal();
  if (saved) {
    APP.plans = saved.plans;
    APP.currentPlanId = saved.plans.some((p) => p.id === saved.currentPlanId)
      ? saved.currentPlanId
      : saved.plans[0].id;
  } else {
    APP.plans = buildDefaultPlans();
    APP.currentPlanId = APP.plans[0].id;
  }
  initPlanSelect();
  render();

  /* PWA: Webサーバー上（https）で公開されたときだけ有効になる */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch((e) => {
      console.warn('Service Workerの登録に失敗:', e);
    });
  }
});

/* ---------- ヘッダーのボタン ---------- */
function initHeaderButtons() {
  document.getElementById('btn-export-json').addEventListener('click', exportJson);

  document.getElementById('btn-import-json').addEventListener('click', () => {
    document.getElementById('file-input-json').click();
  });
  document.getElementById('file-input-json').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) importJsonFile(e.target.files[0]);
    e.target.value = '';   // 同じファイルをもう一度選べるように
  });

  document.getElementById('btn-export-excel').addEventListener('click', exportExcel);

  document.getElementById('btn-import-excel').addEventListener('click', () => {
    document.getElementById('file-input-excel').click();
  });
  document.getElementById('file-input-excel').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      if (typeof XLSX === 'undefined') {
        alert('Excel機能の利用にはインターネット接続が必要です。接続してから再読み込み（Ctrl+F5）してください。');
      } else {
        importExcelFile(e.target.files[0]);
      }
    }
    e.target.value = '';
  });

  document.getElementById('btn-print').addEventListener('click', () => window.print());

  document.getElementById('btn-new-plan').addEventListener('click', newPlanAction);
  document.getElementById('btn-copy-plan').addEventListener('click', copyPlanAction);
  document.getElementById('btn-rename-plan').addEventListener('click', renamePlanAction);
  document.getElementById('btn-delete-plan').addEventListener('click', deletePlanAction);

  document.getElementById('btn-reset-defaults').addEventListener('click', () => {
    if (!confirm('保存されているデータをすべて消して、最初の状態（Excelから移植した2プラン）に戻します。\nよろしいですか？\n※必要なら先に「💾 ファイルに保存」でバックアップしてください。')) return;
    APP.plans = buildDefaultPlans();
    APP.currentPlanId = APP.plans[0].id;
    refreshPlanSelect();
    render();
  });
}

/* ---------- プラン管理 ---------- */
function newPlanAction() {
  const name = prompt('新しいプランの名前を入力してください', '新しいプラン');
  if (!name || !name.trim()) return;
  const thisYear = new Date().getFullYear();
  const p = makeBlankPlan(name.trim(), thisYear, thisYear + 40);
  APP.plans.push(p);
  APP.currentPlanId = p.id;
  refreshPlanSelect();
  render();
}

function copyPlanAction() {
  const src = currentPlan();
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = newId('plan');
  copy.name = src.name + '（コピー）';
  APP.plans.push(copy);
  APP.currentPlanId = copy.id;
  refreshPlanSelect();
  render();
}

function renamePlanAction() {
  const p = currentPlan();
  if (!p) return;
  const n = prompt('プランの新しい名前を入力してください', p.name);
  if (n && n.trim()) {
    p.name = n.trim();
    refreshPlanSelect();
    render();
  }
}

function deletePlanAction() {
  const p = currentPlan();
  if (!p) return;
  if (APP.plans.length <= 1) {
    alert('最後の1件は削除できません。\n（最初からやり直したい場合は、画面下の「初期データに戻す」を使ってください）');
    return;
  }
  if (!confirm(`プラン「${p.name}」を削除します。よろしいですか？`)) return;
  APP.plans = APP.plans.filter((x) => x.id !== p.id);
  APP.currentPlanId = APP.plans[0].id;
  refreshPlanSelect();
  render();
}

function currentPlan() {
  return APP.plans.find((p) => p.id === APP.currentPlanId);
}

/* ---------- タブ切り替え ---------- */
function initTabs() {
  document.querySelectorAll('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
}

function showView(viewId) {
  document.querySelectorAll('main .view').forEach((sec) => {
    sec.hidden = (sec.id !== viewId);
  });
  document.querySelectorAll('.tabs button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });
}

/* ---------- プラン選択 ---------- */
function initPlanSelect() {
  const sel = document.getElementById('plan-select');
  sel.addEventListener('change', () => {
    APP.currentPlanId = sel.value;
    render();
  });
  refreshPlanSelect();
}

function refreshPlanSelect() {
  const sel = document.getElementById('plan-select');
  sel.innerHTML = '';
  APP.plans.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
  sel.value = APP.currentPlanId;
}

/* ---------- 画面の再描画 ---------- */
function render() {
  const plan = currentPlan();
  if (!plan) return;
  const result = computePlan(plan);

  /* 印刷時のタイトル（プラン名と印刷日） */
  const ph = document.getElementById('print-header');
  if (ph) {
    ph.textContent = `ライフプランシート ─ プラン「${plan.name}」（${new Date().toLocaleDateString('ja-JP')} 時点）`;
  }

  renderSummaryCards(plan, result);
  renderSettings(plan);
  renderCashflowTable(plan);
  renderCharts(plan, result);
  renderCompare();
  saveToLocal();   // 描画のたびに自動保存
}

/* ---------- 家族・設定タブ ---------- */
let SETTINGS_WIRED = false;

function renderSettings(plan) {
  const area = document.getElementById('settings-area');
  if (!area) return;
  area.classList.remove('placeholder-note');

  const inv = plan.investment || { enabled: false, initial: 0, rate: 3, contributions: {} };
  if (!plan.investment) plan.investment = inv;

  /* 家族メンバーの一覧 */
  let memberRows = '';
  plan.members.forEach((mem) => {
    let evtChips = '';
    const eventYears = Object.keys(mem.events || {}).sort();
    eventYears.forEach((y) => {
      evtChips += `<span class="evt-chip">${y}年 ${esc(mem.events[y])}
        <button class="chip-del" data-action="evt-del" data-mid="${mem.id}" data-year="${y}" title="このイベントを削除">×</button></span>`;
    });
    memberRows += `<tr>
      <td><input type="text" data-mem-field="name" data-mid="${mem.id}" value="${esc(mem.name)}"></td>
      <td class="num"><input type="number" data-mem-field="age" data-mid="${mem.id}" value="${mem.ageAtStart}" style="width:5em"> 歳</td>
      <td>${evtChips}<button class="mini" data-action="evt-add" data-mid="${mem.id}">＋ イベント追加</button></td>
      <td><button class="mini danger" data-action="mem-del" data-mid="${mem.id}" title="この家族を削除">🗑</button></td>
    </tr>`;
  });

  area.innerHTML = `
  <div class="settings-grid">
    <fieldset class="set-block">
      <legend>📅 計画期間</legend>
      <div class="set-row"><label>開始年</label><input type="number" data-set="startYear" value="${plan.startYear}"> 年</div>
      <div class="set-row"><label>終了年</label><input type="number" data-set="endYear" value="${plan.endYear}"> 年</div>
      <div class="set-row"><label>開始時の貯蓄残高</label><input type="number" step="0.1" data-set="initialSavings" value="${plan.initialSavings}"> 万円</div>
      <p class="hint">※ 年齢は「開始年の1月時点」の年齢を入力してください。</p>
    </fieldset>

    <fieldset class="set-block">
      <legend>📈 資産運用（NISA等）</legend>
      <div class="set-row">
        <label class="check-label"><input type="checkbox" data-set="invEnabled" ${inv.enabled ? 'checked' : ''}> 運用シミュレーションを行う</label>
      </div>
      <div class="set-row"><label>開始時の運用残高</label><input type="number" step="0.1" data-set="invInitial" value="${inv.initial}" ${inv.enabled ? '' : 'disabled'}> 万円</div>
      <div class="set-row"><label>想定年利</label><input type="number" step="0.1" data-set="invRate" value="${inv.rate}" ${inv.enabled ? '' : 'disabled'}> %</div>
      <p class="hint">※ 毎年の「追加投資／取り崩し」の金額は、収支表タブの専用行で入力します。</p>
    </fieldset>

    <fieldset class="set-block set-wide">
      <legend>👨‍👩‍👧‍👦 家族とライフイベント</legend>
      <table class="mem-table">
        <thead><tr><th>続柄・名前</th><th>開始年の年齢</th><th>ライフイベント（収支表の年齢欄に表示されます）</th><th></th></tr></thead>
        <tbody>${memberRows}</tbody>
      </table>
      <button data-action="mem-add">＋ 家族を追加</button>
    </fieldset>
  </div>`;

  if (!SETTINGS_WIRED) { wireSettings(area); SETTINGS_WIRED = true; }
}

function wireSettings(area) {
  /* 入力値の変更 */
  area.addEventListener('change', (e) => {
    const t = e.target;
    const plan = currentPlan();
    if (!plan) return;
    if (t.dataset.set) {
      applySetting(plan, t.dataset.set, t);
      render();
      return;
    }
    if (t.dataset.memField) {
      const mem = plan.members.find((m) => m.id === t.dataset.mid);
      if (!mem) return;
      if (t.dataset.memField === 'name' && t.value.trim()) mem.name = t.value.trim();
      if (t.dataset.memField === 'age') {
        const a = Number(t.value);
        if (Number.isFinite(a) && a >= 0) mem.ageAtStart = Math.round(a);
      }
      render();
    }
  });

  /* ボタン操作 */
  area.addEventListener('click', (e) => {
    const btn = e.target.closest ? e.target.closest('button[data-action]') : null;
    if (!btn) return;
    const plan = currentPlan();
    const act = btn.dataset.action;
    const mem = plan.members.find((m) => m.id === btn.dataset.mid);

    if (act === 'mem-add') {
      const name = prompt('続柄や名前を入力してください（例: 夫、長女、母）');
      if (!name || !name.trim()) return;
      const age = Number(prompt(`${plan.startYear}年時点の年齢を入力してください`, '40'));
      plan.members.push(makeMember(name.trim(), Number.isFinite(age) ? Math.round(age) : 40));
      render();
    } else if (act === 'mem-del' && mem) {
      if (confirm(`「${mem.name}」を家族から削除します。よろしいですか？`)) {
        plan.members = plan.members.filter((m) => m.id !== mem.id);
        render();
      }
    } else if (act === 'evt-add' && mem) {
      const year = Number(prompt('イベントの年（西暦）を入力してください', String(plan.startYear)));
      if (!Number.isFinite(year) || year < plan.startYear || year > plan.endYear) {
        alert(`${plan.startYear}〜${plan.endYear} の範囲の年を入力してください。`);
        return;
      }
      const label = prompt('イベント名を入力してください（例: 退職、車の買い替え、結婚）');
      if (!label || !label.trim()) return;
      if (!mem.events) mem.events = {};
      mem.events[Math.round(year)] = label.trim();
      render();
    } else if (act === 'evt-del' && mem) {
      delete mem.events[btn.dataset.year];
      render();
    }
  });
}

function applySetting(plan, key, input) {
  const num = Number(input.value);
  switch (key) {
    case 'startYear':
      if (Number.isFinite(num) && num >= 1950 && num < plan.endYear) plan.startYear = Math.round(num);
      else alert('開始年は終了年より前の西暦で入力してください。');
      break;
    case 'endYear':
      if (Number.isFinite(num) && num > plan.startYear && num <= plan.startYear + 100) plan.endYear = Math.round(num);
      else alert('終了年は開始年より後の西暦で入力してください。');
      break;
    case 'initialSavings':
      plan.initialSavings = Number.isFinite(num) ? num : 0;
      break;
    case 'invEnabled':
      plan.investment.enabled = input.checked;
      break;
    case 'invInitial':
      plan.investment.initial = Number.isFinite(num) ? num : 0;
      break;
    case 'invRate':
      plan.investment.rate = Number.isFinite(num) ? num : 0;
      break;
  }
}

/* ---------- サマリーカード ---------- */
function renderSummaryCards(plan, result) {
  const box = document.getElementById('summary-cards');
  const m = result.metrics;
  const first = plan.members[0];

  const periodText = first
    ? `${plan.startYear}年〜${plan.endYear}年<br><span class="card-label">${first.name} ${first.ageAtStart}歳 → ${memberAge(plan, first, plan.endYear)}歳</span>`
    : `${plan.startYear}年〜${plan.endYear}年`;

  const depletionHtml = m.depletionYear
    ? `<div class="big-number text-danger">⚠️ ${m.depletionYear}年</div>
       <div class="card-label">${first ? `${first.name} ${m.depletionAge}歳のとき` : ''}に貯蓄がマイナスになります</div>`
    : `<div class="big-number text-ok">✅ 尽きません</div>
       <div class="card-label">計画期間内は貯蓄がプラスを維持</div>`;

  const investHtml = plan.investment && plan.investment.enabled
    ? `<div class="summary-card card">
         <h3>運用資産（期末）</h3>
         <div class="big-number">${fmtMan(m.endInvest)} <span class="unit">万円</span></div>
         <div class="card-label">想定年利 ${plan.investment.rate}%で運用した場合</div>
       </div>`
    : '';

  box.innerHTML = `
    <div class="summary-card card">
      <h3>計画期間</h3>
      <div class="big-number">${periodText}</div>
    </div>
    <div class="summary-card card">
      <h3>貯蓄の見通し</h3>
      ${depletionHtml}
    </div>
    <div class="summary-card card">
      <h3>年末貯蓄残高（期末）</h3>
      <div class="big-number ${m.endSavings < 0 ? 'text-danger' : ''}">${fmtMan(m.endSavings)} <span class="unit">万円</span></div>
      <div class="card-label">${plan.endYear}年末時点</div>
    </div>
    ${investHtml}
    <div class="summary-card card">
      <h3>生涯収支（合計）</h3>
      <div class="big-number ${m.lifetimeNet < 0 ? 'text-danger' : 'text-ok'}">${fmtMan(m.lifetimeNet)} <span class="unit">万円</span></div>
      <div class="card-label">期間中の（収入−支出）の合計</div>
    </div>`;
}
