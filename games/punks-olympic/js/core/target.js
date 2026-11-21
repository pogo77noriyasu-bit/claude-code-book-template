// 通過基準(TARGET)の判定。全種目で共通に使う。基準値は config.js の PO.TARGETS[ラウンド][種目]
// - 判定はプレイヤー自身の記録(綱引きのように順位で決める種目は順位)。基準値と同じなら CLEAR
// - 記録なし(DNF・FOUL だけなど)は未達成
PO.target = (function () {
  const EPS = 1e-9; // 記録は 0.01 単位に丸めてあるので、浮動小数の誤差だけ見のがす

  // その種目のいまのラウンドの基準(なければ null)。
  // そのラウンドの基準が config.js にまだないときは、それより前でいちばん近いラウンドの基準を使う
  // (2026-11-19 の暫定: ROUND 2 以降も ROUND 1 と同じ TARGET。ラウンドごとの値は PO.TARGETS[2] などを足せば使われる)
  function get(eventId, round) {
    for (let k = round || PO.progress.round; k >= 1; k--) {
      const r = PO.TARGETS[k];
      if (r && r[eventId]) return r[eventId];
    }
    return null;
  }
  // 基準の表示(種目選択・競技前・競技中・リザルト・ラウンド終了で同じ表記。数値は PO.TARGETS から作る。数学記号は使わない)
  //   label: 英語の値(15.00 SEC / WIN / TOP 3 / 40+ BALLS / 20+ m)
  //   text : 英語の 1 行(TARGET : 15.00 SEC)。ピンクで表示
  //   ja   : 日本語の補足(15秒以内 / 勝利 / 3位以内 / 40個以上 / 20m以上)。英語の下に少し小さな白文字で表示
  const num = (v) => String(Math.round(v * 100) / 100); // 15 → '15'、15.5 → '15.5'
  function label(t) {
    if (!t) return '';
    if (t.kind === 'time') return t.max.toFixed(2) + ' SEC';
    if (t.kind === 'rank') return t.max === 1 ? 'WIN' : 'TOP ' + t.max;
    if (t.kind === 'count') return t.min + '+ BALLS';
    return t.min + '+ m';
  }
  const text = (t) => (t ? 'TARGET : ' + label(t) : '');
  function ja(t) {
    if (!t) return '';
    if (t.kind === 'time') return num(t.max) + '秒以内';
    if (t.kind === 'rank') return t.max === 1 ? '勝利' : num(t.max) + '位以内';
    if (t.kind === 'count') return num(t.min) + '個以上';
    return num(t.min) + 'm以上';
  }
  // 表示の色(英語 = ピンク、日本語 = 白)
  const COLOR = { en: '#ff8ad8', ja: '#ffffff' };
  // 判定に使うプレイヤーの値(順位の種目は順位、それ以外は記録)
  function scoreOf(t, result) {
    if (t.kind === 'rank') {
      const me = result.entries.find((e) => e.isPlayer);
      return me ? me.rank : null;
    }
    return result.playerValue == null ? null : result.playerValue;
  }
  // 判定: { clear, value, target, label }
  function judge(eventId, result, round) {
    const t = get(eventId, round);
    if (!t) return { clear: true, value: null, target: null, label: '' };
    const v = scoreOf(t, result);
    const clear = v != null && isFinite(v) && (t.max != null ? v <= t.max + EPS : v >= t.min - EPS);
    return { clear, value: v, target: t, label: label(t) };
  }
  // プレイヤーの値の表示(12.34 SEC / 2ND / 41 BALLS / 22.00m / 記録なしは NO RECORD)
  function valueText(eventId, j) {
    if (!j.target) return '';
    if (j.value == null) return 'NO RECORD';
    if (j.target.kind === 'rank') return j.target.max === 1 ? (j.value === 1 ? 'WIN' : 'LOSE') : PO.draw.ordinal(j.value);
    if (j.target.kind === 'time') return j.value.toFixed(2) + ' SEC';
    if (j.target.kind === 'count') return j.value + ' BALLS';
    return PO.records.format(eventId, j.value);
  }

  return { get, label, text, ja, judge, valueText, COLOR };
})();
