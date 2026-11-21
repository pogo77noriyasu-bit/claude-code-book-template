// ゲームの進行データ(全 6 種目を通して遊ぶ。ROUND の上限なし)。全種目で共通に使う
// - 最初に選んだキャラクター(player)を全種目・全 ROUND で使う。途中では変えられない
// - 対戦する CPU 3 人(cpus)はキャラクターを決めたときに残り 7 人から重複なしで抽選し、全種目・全 ROUND で同じ
//   (2026-11-19)。並び順が強さの序列(0 = 強い・1 = ふつう・2 = 弱い)で、総合順位の同点のときの CPU どうしの固定順にも使う。
//   GAME OVER でタイトルへ戻ったら(reset)次のゲームで抽選しなおす
// - 種目ごとの終了状態と競技結果(リザルトの entries = 4 人全員の記録と順位)を持つ。順位に関係なく、競技が終わったらプレイ済み
// - 一度終わった種目は、全種目が終わるまでもう一度は遊べない
// - 種目ごとに通過基準(TARGET、js/core/target.js)を判定し、1 種目でも未達成ならその時点で GAME OVER(残りの種目は遊べない)
// - 総合順位(standings): 全 6 種目の順位をポイント(PO.RANK_POINTS・綱引きは PO.TUG_POINTS)にして合計し、同点は
//   1 位(綱引きの勝ちを含む)の回数 → 2 位の回数 → 3 位相当(3 位・綱引きの負け)の回数 → プレイヤー → CPU の固定順で決める。
//   足し算なので、種目を遊ぶ順番では変わらない。将来の累積スコアとは別のデータ
// - 全種目で基準を達成したら表彰式。総合 1〜3 位なら ROUND CLEAR → 次の ROUND(nextRound)、総合 4 位なら ROUND の GAME OVER(endRound)
//   終わった ROUND の結果(4 人全員の記録・順位・総合順位ポイント)は history に分けて残す(自己ベストは records.js で別に持つので変わらない)
// - GAME OVER でタイトルへ戻ったら(reset)ラウンド 1 から
// - いまはページの中だけで持つ(再読み込みで最初から)
PO.progress = (function () {
  let player = null; // 選んだキャラクターの id(null = まだ選んでいない)
  let cpus = []; // 対戦する CPU 3 人の id(強い順。全種目・全 ROUND で同じ)
  let results = {}; // { eventId: { entries, playerValue, playerRank, order } }
  let order = 0;
  let round = 1;
  let gameOver = false;
  let history = []; // 終わったラウンドの結果 [{ round, results, standings, clear }](古い順)
  let previewMode = false; // 開発用のプレビューから始めた進行(自己ベストを保存しない)

  const ids = () => PO.EVENT_LIST.map((e) => e.id);
  // 残り 7 人から重複なしで 3 人
  const drawCpus = (pid) => PO.rng.shuffle(PO.CHARACTERS.map((c) => c.id).filter((id) => id !== pid)).slice(0, 3);

  // 1 種目の順位 → ポイント
  function pointsOf(eventId, rank) {
    if (eventId === 'tug') return rank === 1 ? PO.TUG_POINTS.win : PO.TUG_POINTS.lose;
    return PO.RANK_POINTS[rank] || 0;
  }
  // 総合順位: res = { eventId: { entries } }、members = [プレイヤー, CPU × 3(固定順)]
  //   返り値: [{ charId, isPlayer, points, firsts, seconds, thirds, events, rank }](総合順位の順)
  function standingsOf(res, pid, cpuIds) {
    const members = [pid].concat(cpuIds);
    const rows = members.map((id, i) => ({ charId: id, isPlayer: i === 0, points: 0, firsts: 0, seconds: 0, thirds: 0, events: 0, order: i }));
    Object.keys(res).forEach((eventId) => {
      res[eventId].entries.forEach((e) => {
        const row = rows.find((r) => r.charId === e.charId);
        if (!row) return;
        row.points += pointsOf(eventId, e.rank);
        row.events++;
        const p = pointsOf(eventId, e.rank); // 回数はポイントの段で数える(綱引きの勝ち = 1 位、負け = 3 位相当)
        if (p === PO.RANK_POINTS[1]) row.firsts++;
        else if (p === PO.RANK_POINTS[2]) row.seconds++;
        else if (p === PO.RANK_POINTS[3]) row.thirds++;
      });
    });
    rows.sort((a, b) => b.points - a.points || b.firsts - a.firsts || b.seconds - a.seconds || b.thirds - a.thirds || a.order - b.order);
    rows.forEach((r, i) => {
      r.rank = i + 1;
      delete r.order;
    });
    return rows;
  }

  return {
    // キャラクターを決める。1 種目でも終わったあとは変えられない(最初に選んだキャラクターのまま)。
    // 決めたときに CPU 3 人を抽選する(選び直したら抽選しなおす)
    start(charId) {
      if (!player) PO.score.newGame(); // 新しいゲーム: 累積スコアを 0 に(GAME OVER のあとも、次のゲームを始めるまでは前の点を表示する)
      if (!player || this.canRechoose) {
        if (player !== charId || !cpus.length) cpus = drawCpus(charId);
        player = charId;
      }
      return player;
    },
    // キャラクターを選び直せるか(ROUND 1 で、まだ 1 種目も終わっていない)。ROUND 2 以降は選んだキャラクターのまま
    get canRechoose() {
      return round === 1 && history.length === 0 && this.count === 0;
    },
    get player() {
      return player;
    },
    // 対戦する CPU 3 人(強い順)。キャラクターを選ぶ前は空
    get cpus() {
      return cpus.slice();
    },
    get started() {
      return !!player;
    },
    get round() {
      return round;
    },
    // 競技が終わった(リザルトに入った)ときに呼ぶ。judge = 通過基準の判定(PO.target.judge)。同じ種目の 2 回目は記録しない
    complete(eventId, result, judge) {
      if (results[eventId]) return false;
      const me = result.entries.find((e) => e.isPlayer);
      const clear = judge ? judge.clear : true;
      results[eventId] = { entries: result.entries, playerValue: result.playerValue, playerRank: me ? me.rank : null, order: ++order, clear, value: judge ? judge.value : null };
      if (!clear) gameOver = true;
      return true;
    },
    // GAME OVER(1 種目でも基準を達成できなかった・ROUND の総合 4 位)
    get gameOver() {
      return gameOver;
    },
    // 全種目で基準を達成した(表彰式へ)
    get roundClear() {
      return !gameOver && ids().every((id) => results[id] && results[id].clear);
    },
    isCompleted: (eventId) => !!results[eventId],
    // 基準を達成した種目(種目選択で灰色・選べない)
    isCleared: (eventId) => !!(results[eventId] && results[eventId].clear),
    get clearCount() {
      return ids().filter((id) => results[id] && results[id].clear).length;
    },
    result: (eventId) => results[eventId] || null,
    get count() {
      return ids().filter((id) => results[id]).length;
    },
    get total() {
      return ids().length;
    },
    get allDone() {
      return ids().every((id) => results[id]);
    },
    pointsOf,
    standingsOf,
    // いまの ROUND の総合順位(終わった種目だけで集計)
    standings() {
      return standingsOf(results, player, cpus);
    },
    // プレイヤーの総合順位(1〜4)
    get playerStanding() {
      const me = standingsOf(results, player, cpus).find((r) => r.isPlayer);
      return me ? me.rank : null;
    },
    // 次のラウンドへ(表彰式のあと、総合 1〜3 位)。いまのラウンドの結果と総合順位を history に移し、ラウンドを 1 増やして、
    // 種目のクリア状態・競技結果を空にする。キャラクターと CPU 3 人はそのまま
    nextRound() {
      history.push({ round, results, standings: this.standings(), clear: true });
      round++;
      results = {};
      order = 0;
      gameOver = false;
      return round;
    },
    // ROUND の GAME OVER(全種目で基準を達成したが総合 4 位)。結果を history に残して GAME OVER にする(次の ROUND へは進まない)
    endRound() {
      history.push({ round, results, standings: this.standings(), clear: false });
      gameOver = true;
      return round;
    },
    // 開発用のプレビュー: 選んだキャラクター・CPU 3 人で、ROUND r の始まり(0 / 6 CLEAR)の進行を作る。
    // この進行の間は自己ベストを保存しない(previewMode)。GAME OVER などで reset すると元に戻る
    startPreview(charId, r, cpuIds, keepScore) {
      this.reset();
      PO.score.newGame({ preview: true, keep: !!keepScore }); // プレビューの進行: ハイスコアを保存しない(keepScore = 表彰式のプレビューの点を続ける)
      player = charId;
      cpus = cpuIds && cpuIds.length === 3 ? cpuIds.slice() : drawCpus(charId);
      previewMode = true;
      for (let k = 1; k < (r || 1); k++) history.push({ round: k, results: {}, standings: [], clear: true, preview: true });
      round = r || 1;
      return round;
    },
    // 前の名前(表彰式のプレビューのあと ROUND 2 へ)。startPreview(charId, 2) と同じ
    startPreviewRound(charId) {
      return this.startPreview(charId, 2);
    },
    get previewMode() {
      return previewMode;
    },
    // 終わったラウンドの結果(古い順)。round を渡すとそのラウンドだけ
    history(r) {
      return r == null ? history.slice() : history.find((h) => h.round === r) || null;
    },
    // 最初から(キャラクターの選び直し・CPU の抽選しなおしもできる)
    reset() {
      history = [];
      previewMode = false;
      player = null;
      cpus = [];
      results = {};
      order = 0;
      round = 1;
      gameOver = false;
    },
    // テスト用
    snapshot: () => ({
      player,
      cpus: cpus.slice(),
      round,
      gameOver,
      previewMode,
      history: JSON.parse(JSON.stringify(history)),
      roundClear: !gameOver && ids().every((id) => results[id] && results[id].clear),
      completed: ids().filter((id) => results[id]),
      results: JSON.parse(JSON.stringify(results)),
      standings: standingsOf(results, player, cpus),
    }),
  };
})();
