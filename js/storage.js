/* ============================================
   storage.js — データ保存
   ・localStorage への自動保存（編集のたび）
   ・JSONファイルへの書き出し（バックアップ）
   ・JSONファイルからの読み込み（復元）
   ============================================ */
'use strict';

const STORAGE_KEY = 'lifeplan-app-v1';

/* ---------- 自動保存 ---------- */
function saveToLocal() {
  try {
    const data = { version: 1, currentPlanId: APP.currentPlanId, plans: APP.plans };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('自動保存に失敗しました:', e);
  }
}

function loadFromLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.plans) || data.plans.length === 0) return null;
    return data;
  } catch (e) {
    console.error('保存データの読み込みに失敗しました:', e);
    return null;
  }
}

/* ---------- JSONファイルへ書き出し（バックアップ） ---------- */
function exportJson() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    currentPlanId: APP.currentPlanId,
    plans: APP.plans,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  a.download = `ライフプラン_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- JSONファイルから読み込み（復元） ---------- */
function importJsonFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.plans) || data.plans.length === 0) {
        alert('このファイルにはプランデータが見つかりませんでした。');
        return;
      }
      const ok = data.plans.every((p) =>
        p && p.name && Array.isArray(p.incomeItems) && Array.isArray(p.expenseItems) && Array.isArray(p.members));
      if (!ok) {
        alert('ファイルの形式が正しくありません（このアプリで保存したJSONファイルを選んでください）。');
        return;
      }
      /* 読み込み内容のサマリーを確認ダイアログに表示 */
      const names = data.plans.map((p, i) => `　${i + 1}. ${p.name}（${p.startYear}〜${p.endYear}年）`).join('\n');
      const saved = data.exportedAt
        ? `保存日時: ${new Date(data.exportedAt).toLocaleString('ja-JP')}\n`
        : '';
      if (!confirm(`このファイルには ${data.plans.length} 件のプランが入っています。\n${names}\n${saved}\n現在のデータはすべて置き換えられます。読み込みますか？`)) {
        return;
      }
      APP.plans = data.plans;
      APP.currentPlanId = data.plans.some((p) => p.id === data.currentPlanId)
        ? data.currentPlanId
        : data.plans[0].id;
      refreshPlanSelect();
      render();
      alert('読み込みが完了しました。');
    } catch (e) {
      alert('読み込みに失敗しました: ' + e.message);
    }
  };
  reader.readAsText(file, 'utf-8');
}
