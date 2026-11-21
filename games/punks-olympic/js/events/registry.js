// 種目の登録所。種目ごとのファイル(js/events/*.js)が PO.events.register で自分を登録する。
// 新しい種目を足すときは、ファイルを 1 つ作って register し、config.js の EVENT_LIST の available を true にする。
//
// 種目の決まりごと(インターフェース):
//   register({ id, create(setup) })
//   create(setup) が返すもの:
//     update(dt)      固定ステップごとに呼ばれる(入力は PO.input.consume('run' / 'action') で読む)
//     render(ctx)     描画
//     done            true になったらリザルト画面へ
//     result()        { entries: [{ charId, isPlayer, value, rank }], playerValue }(value は記録。null = 記録なし)
//     snapshot()      テスト用の状態
//   setup: { eventId, player: キャラ id, cpus: [キャラ id × 3] }
PO.events = (function () {
  const table = {};

  function register(def) {
    table[def.id] = def;
  }
  function get(id) {
    return table[id] || null;
  }
  // 遊べる種目か(実装があり、一覧で available)
  function playable(id) {
    const info = PO.EVENT_LIST.find((e) => e.id === id);
    return !!(info && info.available && table[id]);
  }

  return { register, get, playable };
})();

// 乱数(テストで固定できるように seed を持つ)
PO.rng = (function () {
  let s = (Math.random() * 2 ** 32) >>> 0;
  function next() {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    seed: (v) => (s = v >>> 0),
    // 配列をシャッフルしたコピー
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
})();
