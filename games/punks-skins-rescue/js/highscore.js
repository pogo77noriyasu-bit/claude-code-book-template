// PUNKS & SKINS RESCUE: ハイスコアの記録(2026-11-22)
// GAME OVER のとき(js/game.js の gameOver)に 1 回だけ submit を呼ぶ。上位 HIGHSCORE_MAX 件を localStorage の psr.highscores に残す。
// 保存できない環境(プライベートブラウズなど)でも、そのページを開いているあいだはメモリで覚えておく。
window.PSR = window.PSR || {};

PSR.highscore = (function () {
  const KEY = 'psr.highscores';
  let mem = null; // 保存できないときの控え

  function list() {
    if (mem) return mem.slice();
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a.filter((e) => e && typeof e.score === 'number') : [];
    } catch (e) {
      return [];
    }
  }

  // 記録する。戻り値 { best(記録後の最高点), rank(この回の順位。0 始まり。圏外は -1), isNew(最高点を更新したか) }
  function submit(rec) {
    const max = (PSR.config && PSR.config.HIGHSCORE_MAX) || 5;
    const before = list();
    const prevBest = before.length ? before[0].score : 0;
    const entry = { score: rec.score, stage: rec.stage, rescued: rec.rescued, date: new Date().toISOString().slice(0, 10) };
    const all = before.concat([entry]).sort((a, b) => b.score - a.score);
    const rank = rec.score > 0 ? all.indexOf(entry) : -1; // 0 点は記録しない
    const kept = (rank >= 0 ? all : before).slice(0, max);
    try {
      localStorage.setItem(KEY, JSON.stringify(kept));
      mem = null;
    } catch (e) {
      mem = kept;
    }
    return { best: kept.length ? kept[0].score : 0, rank: rank < max ? rank : -1, isNew: rec.score > 0 && rec.score > prevBest };
  }

  return { list, submit };
})();
