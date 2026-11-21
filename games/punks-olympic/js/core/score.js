// 累積スコア(1UP)とハイスコア(HI-SCORE)。2026-11-19
// - SCORE: いまのゲームの累積得点。新しいゲームの始め(PO.progress.start で新しくキャラクターを決めたとき)に 0。ROUND が変わっても続く
// - HI-SCORE: 過去最高の累積得点。localStorage(PO.SCORE.HI_KEY)に保存。自己ベスト(records.js)とは別
// - 種目のあと(リザルト)に「基本得点 + 順位ボーナス + TARGET ボーナス」、全 6 種目のあと(表彰式)に「総合順位ボーナス + ROUND CLEAR ボーナス」を加える。
//   どちらも ROUND と種目ごとに 1 回だけ(同じキーで 2 回目は加えず、1 回目の内訳を返す。画面の出し直し・連打で二重に加わらない)
// - 総合順位ポイント(PO.RANK_POINTS)とは別のデータ。係数・ボーナスはすべて config.js の PO.SCORE
// - 開発用のプレビューの進行(PO.progress.previewMode)・プレビューの表彰式の間は、ハイスコアを保存しない
// - GAME OVER が決まったら finalize(): 最終結果 { game_code, score, round, character_id } をここに残し(lastResult)、
//   window に 'punks-olympic:gameover' のイベントを出す。将来の API・DB(世界ランキング)はここから受け取る(種目・画面から直接は送らない)
PO.score = (function () {
  const S = () => PO.SCORE;
  let current = 0;
  let hiAtStart = 0; // ゲームの始めのハイスコア(NEW HI-SCORE!! の判定)
  let awarded = {}; // 加えた内訳(キー = 'R1:dash100' / 'R1:round')
  let preview = false; // プレビュー(ハイスコアを保存しない)
  let lastResult = null;
  let hiPreview = false; // プレビュー中に画面の上だけハイスコアを超えた(保存はしていない)
  let hi = loadHi();

  function loadHi() {
    try {
      const v = JSON.parse(localStorage.getItem(PO.SCORE.HI_KEY) || 'null');
      return v && Number.isFinite(v.score) ? v.score : 0;
    } catch (e) {
      return 0;
    }
  }
  const noSave = () => preview || (PO.progress && PO.progress.previewMode);
  // 加えたあと、ハイスコアを超えていたら更新して保存する(プレビューでは画面の表示だけ、保存しない)
  function bump(n) {
    current += n;
    if (current > hi) {
      hi = current;
      if (!noSave()) {
        try {
          localStorage.setItem(S().HI_KEY, JSON.stringify({ score: hi, round: PO.progress.round, character_id: PO.progress.player, date: new Date().toISOString() }));
        } catch (e) {
          /* 保存できなくても続ける */
        }
      } else hiPreview = true;
    }
  }
  // 10 点未満を切り捨て、最低 0 点
  const floorPts = (v) => Math.max(0, Math.floor(Math.round(v * 100) / 100 / S().floor) * S().floor);

  // 競技記録による基本得点(value: プレイヤーの記録。null = 記録なし → 0 点)
  function recordScore(eventId, value) {
    const R = S().record[eventId];
    if (!R || value == null || !Number.isFinite(value)) return 0;
    if (R.kind === 'time') {
      // 0.01 秒単位の整数で計算する(小数の誤差で 10 点ずれないように)
      const t100 = Math.round(value * 100);
      return floorPts(((R.base * 100 - t100) * R.mult) / 100);
    }
    if (R.kind === 'per') return floorPts((Math.round(value * 100) * R.per) / 100);
    if (R.kind === 'tug') {
      // 勝ち: win + 残り時間ボーナス(延長戦で決まったときは残り 0)
      const limit = PO.TUG.TIME_LIMIT;
      const left = Math.max(0, limit - value);
      return floorPts(R.win + (left / limit) * R.timeBonus);
    }
    return 0;
  }
  // 種目の順位ボーナス(綱引きは勝ち・負け。記録なしには付けない)
  function placeBonus(eventId, rank, value) {
    if (value == null) return 0;
    if (eventId === 'tug') return rank === 1 ? S().tugPlace.win : S().tugPlace.lose;
    return S().place[rank] || 0;
  }
  // 1 種目の内訳(加えない)
  function eventBreakdown(eventId, result, judge) {
    const me = result.entries.find((e) => e.isPlayer);
    const value = result.playerValue;
    const record = recordScore(eventId, value);
    const place = placeBonus(eventId, me ? me.rank : null, value);
    const target = judge && judge.clear ? S().target : 0;
    return { record, place, target, total: record + place + target };
  }
  // 種目のあと: 内訳を加える(ROUND・種目ごとに 1 回だけ)。{ record, place, target, total, before, after }
  function addEvent(eventId, result, judge, round) {
    const key = 'R' + (round || PO.progress.round) + ':' + eventId;
    if (awarded[key]) return Object.assign({ again: true }, awarded[key]);
    const b = eventBreakdown(eventId, result, judge);
    const before = current;
    bump(b.total);
    awarded[key] = Object.assign(b, { before, after: current });
    return awarded[key];
  }
  // 全 6 種目のあと(表彰式): 総合順位ボーナス + ROUND CLEAR ボーナス(総合 1〜3 位のとき ROUND × roundClear)。ROUND ごとに 1 回だけ
  function addRound(round, playerRank) {
    const key = 'R' + round + ':round';
    if (awarded[key]) return Object.assign({ again: true }, awarded[key]);
    const overall = S().overall[playerRank] || 0;
    const clear = playerRank >= 1 && playerRank <= 3 ? S().roundClear * round : 0;
    const before = current;
    bump(overall + clear);
    awarded[key] = { overall, clear, total: overall + clear, before, after: current };
    return awarded[key];
  }
  // 新しいゲーム: SCORE を 0 に。opt.preview = プレビューの進行(ハイスコアを保存しない)。opt.keep = いまの点を残す(プレビューの続き)
  function newGame(opt) {
    const o = opt || {};
    if (!o.keep) current = 0;
    awarded = o.keep ? awarded : {};
    preview = !!o.preview;
    hiPreview = false;
    hi = Math.max(loadHi(), o.keep ? hi : 0);
    hiAtStart = loadHi();
    lastResult = null;
  }
  // GAME OVER が決まったとき: 最終結果を 1 か所に残し、イベントで知らせる(将来の API・DB 連携用)
  function finalize(round, characterId) {
    if (lastResult) return lastResult;
    lastResult = { game_code: S().GAME_CODE, score: current, round, character_id: characterId, newHi: current > hiAtStart && current > 0, preview: noSave() };
    try {
      window.dispatchEvent(new CustomEvent('punks-olympic:gameover', { detail: Object.assign({}, lastResult) }));
    } catch (e) {
      /* 古いブラウザでも続ける */
    }
    return lastResult;
  }
  // 表示: 最低 digits 桁のゼロ埋め(大きい点は桁を増やす)
  function text(v) {
    const s = String(Math.max(0, Math.floor(v)));
    return s.length >= S().digits ? s : '0'.repeat(S().digits - s.length) + s;
  }

  return {
    recordScore,
    placeBonus,
    eventBreakdown,
    addEvent,
    addRound,
    newGame,
    finalize,
    text,
    awardedFor: (round, eventId) => awarded['R' + round + ':' + eventId] || null,
    get current() {
      return current;
    },
    get hi() {
      return hi;
    },
    get savedHi() {
      return loadHi();
    },
    get newHi() {
      return current > hiAtStart && current > 0;
    },
    get lastResult() {
      return lastResult ? Object.assign({}, lastResult) : null;
    },
    // 最終結果(GAME OVER のあと。将来の API・DB 連携はここから受け取る)
    getFinalResult() {
      return lastResult ? { game_code: lastResult.game_code, score: lastResult.score, round: lastResult.round, character_id: lastResult.character_id } : null;
    },
    get preview() {
      return noSave();
    },
    // テスト用
    setCurrent(v) {
      current = v;
    },
    snapshot: () => ({ current, hi, hiAtStart, awarded: JSON.parse(JSON.stringify(awarded)), preview: noSave(), lastResult }),
  };
})();
