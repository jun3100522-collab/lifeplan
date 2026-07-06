/* ============================================
   charts.js — グラフ描画（Chart.js 利用）
   ・貯蓄残高推移の折れ線グラフ
     （マイナスの年は点が赤くなる）
   ・年間収支の棒グラフ（黒字=青 / 赤字=赤）
   ============================================ */
'use strict';

const CHARTS = { balance: null, cashflow: null, compare: null };

const COLOR_BLUE = '#0b5cab';
const COLOR_GREEN = '#1e7e34';
const COLOR_PURPLE = '#6a1b9a';
const COLOR_RED = '#c0392b';

function destroyChart(key) {
  if (CHARTS[key]) { CHARTS[key].destroy(); CHARTS[key] = null; }
}

function renderCharts(plan, result) {
  const balCanvas = document.getElementById('chart-balance');
  const cfCanvas = document.getElementById('chart-cashflow');
  if (!balCanvas || !cfCanvas) return;

  /* オフライン等で Chart.js が読み込めなかった場合 */
  if (typeof Chart === 'undefined') {
    document.querySelectorAll('.chart-wrap').forEach((w) => {
      w.innerHTML = '<div class="placeholder-note">グラフの表示にはインターネット接続が必要です。<br>接続してから再読み込み（Ctrl+F5）してください。</div>';
    });
    return;
  }

  Chart.defaults.font.size = 14;
  Chart.defaults.font.family = '"Meiryo", "Hiragino Kaku Gothic ProN", sans-serif';

  const labels = result.years;
  const invOn = plan.investment && plan.investment.enabled;

  /* ---------- 貯蓄残高の推移（折れ線） ---------- */
  const datasets = [{
    label: '年末貯蓄残高',
    data: result.savings,
    borderColor: COLOR_BLUE,
    backgroundColor: 'rgba(11, 92, 171, 0.10)',
    fill: true,
    tension: 0.15,
    pointRadius: 3,
    pointBackgroundColor: result.savings.map((v) => (v < 0 ? COLOR_RED : COLOR_BLUE)),
    borderWidth: 2.5,
  }];
  if (invOn) {
    datasets.push({
      label: `運用資産残高（年利${plan.investment.rate}%）`,
      data: result.invest,
      borderColor: COLOR_GREEN,
      fill: false,
      tension: 0.15,
      pointRadius: 2,
      borderWidth: 2,
    });
    datasets.push({
      label: '総資産（貯蓄＋運用）',
      data: result.total,
      borderColor: COLOR_PURPLE,
      borderDash: [7, 4],
      fill: false,
      tension: 0.15,
      pointRadius: 2,
      borderWidth: 2,
    });
  }

  destroyChart('balance');
  CHARTS.balance = new Chart(balCanvas, {
    type: 'line',
    data: { labels, datasets },
    options: chartOptions(),
  });

  /* ---------- 年間収支（棒） ---------- */
  destroyChart('cashflow');
  CHARTS.cashflow = new Chart(cfCanvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '年間収支（黒字=青 / 赤字=赤）',
        data: result.net,
        backgroundColor: result.net.map((v) => (v < 0 ? COLOR_RED : COLOR_BLUE)),
      }],
    },
    options: chartOptions(),
  });
}

/* ============================================
   プラン比較タブ
   ============================================ */

let CMP_WIRED = false;
const COMPARE = {
  selected: null,      // 比較対象プランのidの集合（null=全プラン）
  metric: 'savings',   // 'savings'=年末貯蓄残高 / 'total'=総資産
};

const CMP_PALETTE = ['#0b5cab', '#c0392b', '#1e7e34', '#6a1b9a', '#e67e22', '#00838f'];

function renderCompare() {
  const area = document.getElementById('compare-area');
  if (!area) return;
  area.classList.remove('placeholder-note');

  /* 選択状態の整備（プランの追加/削除に追従） */
  const ids = APP.plans.map((p) => p.id);
  if (!COMPARE.selected) {
    COMPARE.selected = new Set(ids);
  } else {
    COMPARE.selected = new Set([...COMPARE.selected].filter((id) => ids.includes(id)));
    if (COMPARE.selected.size === 0) COMPARE.selected = new Set(ids);
  }

  const results = APP.plans
    .filter((p) => COMPARE.selected.has(p.id))
    .map((p) => ({ plan: p, result: computePlan(p) }));

  const metricLabel = COMPARE.metric === 'savings' ? '年末貯蓄残高' : '総資産（貯蓄＋運用）';

  /* --- 操作部 --- */
  let html = '<div class="compare-controls"><div><strong>比較するプラン:</strong> ';
  APP.plans.forEach((p) => {
    html += `<label class="check-label"><input type="checkbox" data-cmp-plan="${p.id}" ${COMPARE.selected.has(p.id) ? 'checked' : ''}> ${esc(p.name)}</label> `;
  });
  html += '</div><div><strong>表示する数値:</strong> ';
  html += `<label class="check-label"><input type="radio" name="cmp-metric" value="savings" ${COMPARE.metric === 'savings' ? 'checked' : ''}> 年末貯蓄残高</label> `;
  html += `<label class="check-label"><input type="radio" name="cmp-metric" value="total" ${COMPARE.metric === 'total' ? 'checked' : ''}> 総資産（貯蓄＋運用）</label>`;
  html += '</div></div>';

  /* --- 比較グラフ --- */
  html += '<div class="chart-wrap"><canvas id="chart-compare"></canvas></div>';

  /* --- 主要指標の比較表 --- */
  html += '<h3 class="cmp-h">主要指標の比較</h3>';
  html += '<table class="mem-table"><thead><tr><th>プラン</th><th>貯蓄が尽きる年</th><th>期末貯蓄残高</th><th>期末総資産</th><th>生涯収支</th></tr></thead><tbody>';
  results.forEach(({ plan, result }) => {
    const m = result.metrics;
    html += `<tr><td><strong>${esc(plan.name)}</strong></td>
      <td>${m.depletionYear ? `<span class="text-danger">⚠️ ${m.depletionYear}年</span>` : '<span class="text-ok">✅ 尽きない</span>'}</td>
      <td class="num ${m.endSavings < 0 ? 'text-danger' : ''}">${fmtMan(m.endSavings)} 万円</td>
      <td class="num ${m.endTotal < 0 ? 'text-danger' : ''}">${fmtMan(m.endTotal)} 万円</td>
      <td class="num ${m.lifetimeNet < 0 ? 'text-danger' : ''}">${fmtMan(m.lifetimeNet)} 万円</td></tr>`;
  });
  html += '</tbody></table>';

  /* --- 年ごとの比較表 --- */
  if (results.length >= 1) {
    const minY = Math.min(...results.map((r) => r.plan.startYear));
    const maxY = Math.max(...results.map((r) => r.plan.endYear));
    html += `<h3 class="cmp-h">年ごとの${metricLabel}（万円）</h3>`;
    html += '<div class="table-scroll cmp-scroll"><table class="mem-table"><thead><tr><th>年</th>';
    results.forEach((r) => { html += `<th>${esc(r.plan.name)}</th>`; });
    if (results.length === 2) html += '<th>差額（1つ目 − 2つ目）</th>';
    html += '</tr></thead><tbody>';
    for (let y = minY; y <= maxY; y++) {
      html += `<tr><td>${y}</td>`;
      const vals = results.map((r) => {
        const idx = y - r.plan.startYear;
        if (idx < 0 || idx >= r.result.years.length) return null;
        return (COMPARE.metric === 'savings' ? r.result.savings : r.result.total)[idx];
      });
      vals.forEach((v) => {
        html += `<td class="num ${v !== null && v < 0 ? 'text-danger' : ''}">${v === null ? '—' : fmtMan(v)}</td>`;
      });
      if (results.length === 2) {
        const d = (vals[0] === null || vals[1] === null) ? null : vals[0] - vals[1];
        html += `<td class="num ${d !== null && d < 0 ? 'text-danger' : ''}">${d === null ? '—' : fmtMan(d)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
  }

  area.innerHTML = html;
  drawCompareChart(results);
  if (!CMP_WIRED) { wireCompare(area); CMP_WIRED = true; }
}

function drawCompareChart(results) {
  const canvas = document.getElementById('chart-compare');
  if (!canvas) return;
  if (typeof Chart === 'undefined') {
    canvas.parentElement.innerHTML = '<div class="placeholder-note">グラフの表示にはインターネット接続が必要です。</div>';
    return;
  }
  const minY = Math.min(...results.map((r) => r.plan.startYear));
  const maxY = Math.max(...results.map((r) => r.plan.endYear));
  const labels = [];
  for (let y = minY; y <= maxY; y++) labels.push(y);

  const datasets = results.map((r, i) => ({
    label: r.plan.name,
    data: labels.map((y) => {
      const idx = y - r.plan.startYear;
      if (idx < 0 || idx >= r.result.years.length) return null;
      return (COMPARE.metric === 'savings' ? r.result.savings : r.result.total)[idx];
    }),
    borderColor: CMP_PALETTE[i % CMP_PALETTE.length],
    fill: false,
    tension: 0.15,
    pointRadius: 2,
    borderWidth: 2.5,
    spanGaps: false,
  }));

  destroyChart('compare');
  CHARTS.compare = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: chartOptions(),
  });
}

function wireCompare(area) {
  area.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.cmpPlan) {
      if (t.checked) {
        COMPARE.selected.add(t.dataset.cmpPlan);
      } else {
        if (COMPARE.selected.size <= 1) {
          alert('比較するプランは1つ以上選んでください。');
        } else {
          COMPARE.selected.delete(t.dataset.cmpPlan);
        }
      }
      renderCompare();
    } else if (t.name === 'cmp-metric') {
      COMPARE.metric = t.value;
      renderCompare();
    }
  });
}

/* ============================================
   印刷対応: 印刷直前にグラフを印刷用の大きさで
   描き直し、印刷後に元に戻す
   （スマホ印刷でグラフが小さく/欠けるのを防ぐ）
   ============================================ */

function resizeChartsForPrint() {
  Object.keys(CHARTS).forEach((k) => {
    const ch = CHARTS[k];
    if (ch && ch.canvas) ch.resize(980, 360);
  });
}

function restoreChartsAfterPrint() {
  Object.keys(CHARTS).forEach((k) => {
    const ch = CHARTS[k];
    if (ch && ch.canvas) ch.resize();
  });
}

window.addEventListener('beforeprint', resizeChartsForPrint);
window.addEventListener('afterprint', restoreChartsAfterPrint);
/* 一部のスマホブラウザは beforeprint を出さないため、こちらでも検知する */
if (window.matchMedia) {
  try {
    window.matchMedia('print').addEventListener('change', (e) => {
      if (e.matches) resizeChartsForPrint();
      else restoreChartsAfterPrint();
    });
  } catch (e) { /* 古いブラウザでは無視 */ }
}

/* 共通オプション: ゼロ線を赤で強調、ツールチップは「万円」表示 */
function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { boxWidth: 24 } },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${fmtMan(ctx.parsed.y)} 万円`,
        },
      },
    },
    scales: {
      y: {
        grid: {
          color: (ctx) => (ctx.tick && ctx.tick.value === 0 ? COLOR_RED : '#e3e8ee'),
          lineWidth: (ctx) => (ctx.tick && ctx.tick.value === 0 ? 2 : 1),
        },
        ticks: { callback: (v) => Number(v).toLocaleString('ja-JP') },
      },
      x: { grid: { display: false } },
    },
  };
}
