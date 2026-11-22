// PUNKS & SKINS RESCUE: キャバクラ演出(2026-11-22 試作)
// 3 ステージクリアごと(STAGE 3・6・9…)に、STAGE CLEAR! のあと約 5 秒(CLUB.T)、キャバクラの店内を出す(game.js の state 'club')。
// - 背景: nightclub.png を本編の背景と同じ 8 ビット風に変換した assets-8bit/nightclub_8bit.png(tools/make-8bit.js で作る。元の画像は変えない)。
//         ?gfx=original のときは元の nightclub.png。背景は固定で、動かさない
// - 人: キャバ嬢(本編と同じ hostess の絵)と客(パンクス・スキンズ = js/characters.js の味方 8 人。警官・機動隊員は出さない)。
//       新しく描いた絵はない。同じ人を繰り返し使う
// - 人数: 何回目の演出か(k = floor(ステージ / 3))で増える。式と増え方は config.js の CLUB。席の数が上限(STAGE 100 前後で満席)
// - 配置: 下の SEATS(背景のピクセル座標)。テーブルごとのまとまりの順に埋めるので、少ないうちは同じ席に客とキャバ嬢が集まる
// - 動き: 左右に 1 ドット揺れる・向きを変える・ときどき正面を向く(コマがある人だけ)・キャバ嬢はときどき乾杯のポーズ・ステージの人は跳ねる。
//         時刻(g.frame)と人の番号から計算するだけで、状態を持たない(人数が増えても軽い)
// ゲームの状態は読むだけ(ルール・得点・MISS・乱数には一切さわらない)。
window.PSR = window.PSR || {};

PSR.club = (function () {
  const C = PSR.config;
  const chars = POGO77.chars;

  // 客に出す人: 落ちてくるキャラクターの味方(一覧は js/characters.js。重複して持たない)。
  // 最初の 2 人が赤モヒカンとスキンズになるよう、並びだけ決める
  const ALLY_REFS = PSR.CHARACTERS.filter((c) => c.side === 'ally').map((c) => c.ref);
  const GUEST_ORDER = ['punk_001@1', 'skin_002@1', 'punk_012@3', 'punk_009@1', 'punk_011@4', 'punk_014@1', 'punk_010@1', 'punk_013@1']
    .filter((r) => ALLY_REFS.includes(r))
    .concat(ALLY_REFS.filter((r) => !['punk_001@1', 'skin_002@1', 'punk_012@3', 'punk_009@1', 'punk_011@4', 'punk_014@1', 'punk_010@1', 'punk_013@1'].includes(r)));
  // 正面を向くコマ('front')がある人(ときどき正面を向く)
  const HAS_FRONT = (ref) => {
    try {
      return !!POGO77.characters.get(ref).size('front');
    } catch (e) {
      return false;
    }
  };

  // 席(背景のピクセル座標。x = 足元の中央、y = 足元、s = ドットの倍率(奥ほど小さい)、
  //     role = 'h'(キャバ嬢)/ 'g'(客)、cut = 足元から何ドットを隠すか(ソファの背・テーブルの陰で脚が見えない)、
  //     look = 最初の向き(1 = 右 / -1 = 左)、dance = ステージで跳ねる)
  // 並び = 埋める順。テーブルごとのまとまりで、客とキャバ嬢が同じテーブルに集まるようにしてある
  const SEATS = [
    // ① 右の長いソファとテーブル(画面の右・中央。初回はここ。キャバ嬢は客のあいだに座る)
    { x: 1255, y: 684, s: 5, role: 'g', look: 1 },
    { x: 1340, y: 692, s: 5, role: 'h', look: -1 },
    { x: 1425, y: 700, s: 5, role: 'g', look: -1 },
    { x: 1510, y: 708, s: 5, role: 'h', look: -1 },
    // ② 左の大きなソファとテーブル
    { x: 140, y: 662, s: 5, role: 'g', look: 1 },
    { x: 215, y: 640, s: 5, role: 'h', look: 1 },
    { x: 65, y: 625, s: 4, role: 'g', look: 1 },
    { x: 285, y: 600, s: 4, role: 'g', look: 1 },
    // ③ 奥の左のボックス席(小さく)
    { x: 465, y: 562, s: 3, role: 'g', look: 1 },
    { x: 530, y: 560, s: 3, role: 'h', look: 1 },
    { x: 600, y: 556, s: 3, role: 'g', look: -1 },
    // ④ スツール(白い四角い椅子)
    { x: 420, y: 630, s: 4, role: 'g', look: 1 },
    { x: 570, y: 590, s: 3, role: 'g', look: -1 },
    { x: 722, y: 586, s: 3, role: 'h', look: -1 },
    // ⑤ 右の長いソファの奥側・右端
    { x: 1595, y: 716, s: 5, role: 'g', look: -1 },
    { x: 1180, y: 676, s: 4, role: 'g', look: 1 },
    // ⑥ 手前右のテーブル(大きく)
    { x: 1420, y: 930, s: 5, role: 'g', look: 1 },
    { x: 1560, y: 936, s: 5, role: 'h', look: -1 },
    { x: 1640, y: 880, s: 5, role: 'g', look: -1 },
    // ⑦ 手前左のテーブル(大きく)
    { x: 90, y: 925, s: 5, role: 'g', look: 1 },
    { x: 200, y: 900, s: 5, role: 'h', look: 1 },
    { x: 470, y: 930, s: 5, role: 'g', look: -1 },
    // ⑧ 奥の中央のソファ
    { x: 895, y: 600, s: 3, role: 'g', look: -1 },
    { x: 840, y: 596, s: 3, role: 'h', look: -1 },
    // ⑨ 手前の中央のソファ(背もたれの向こうに座る。脚は隠れる)
    { x: 900, y: 735, s: 4, role: 'g', look: 1, cut: 6 },
    { x: 980, y: 748, s: 4, role: 'g', look: 1, cut: 6 },
    { x: 1060, y: 762, s: 4, role: 'h', look: 1, cut: 6 },
    // ⑩ ステージ(パンクスがライブで盛り上がる。跳ねる)
    { x: 1260, y: 495, s: 3, role: 'g', look: 1, dance: true },
    { x: 1340, y: 495, s: 3, role: 'g', look: -1, dance: true },
    { x: 1180, y: 498, s: 3, role: 'g', look: 1, dance: true },
    { x: 1420, y: 497, s: 3, role: 'g', look: -1, dance: true },
    // ⑪ 光る通路(立って盛り上がる客・行き来するキャバ嬢)
    { x: 1000, y: 620, s: 4, role: 'g', look: -1 },
    { x: 880, y: 655, s: 4, role: 'h', look: 1 },
    { x: 760, y: 690, s: 4, role: 'g', look: 1 },
    { x: 640, y: 728, s: 5, role: 'g', look: -1 },
    { x: 1110, y: 590, s: 4, role: 'g', look: -1 },
    { x: 545, y: 770, s: 5, role: 'h', look: 1 },
    // ⑫ 手前のスツール・通路の手前
    { x: 730, y: 800, s: 5, role: 'g', look: -1 },
    { x: 330, y: 760, s: 5, role: 'g', look: 1 },
    { x: 620, y: 925, s: 5, role: 'g', look: 1 },
    // ⑬ 満席に近いとき: 立ち見・壁ぎわ・カウンターの前・ステージの端
    { x: 1080, y: 500, s: 3, role: 'g', look: 1, dance: true },
    { x: 1500, y: 500, s: 3, role: 'h', look: -1, dance: true },
    { x: 780, y: 505, s: 3, role: 'g', look: 1, cut: 9 }, // 奥のボックス席の背もたれの向こう(カウンターの前)
    { x: 862, y: 510, s: 3, role: 'h', look: -1, cut: 9 },
    { x: 990, y: 535, s: 3, role: 'g', look: 1 },
    { x: 360, y: 560, s: 3, role: 'g', look: 1 },
    { x: 30, y: 760, s: 4, role: 'g', look: 1 },
    { x: 1190, y: 800, s: 5, role: 'g', look: -1, cut: 8 },
    { x: 1290, y: 820, s: 5, role: 'h', look: -1, cut: 8 },
    { x: 840, y: 935, s: 5, role: 'g', look: 1 },
  ];
  const HOST_SEATS = SEATS.filter((s) => s.role === 'h');
  const GUEST_SEATS = SEATS.filter((s) => s.role === 'g');

  // 何回目の演出か(STAGE 3 = 1 回目)
  const clubIndex = (stage) => Math.max(1, Math.floor(stage / C.CLUB.EVERY));
  // 人数(config.js の CLUB。席の数が上限)
  function counts(stage) {
    const k = clubIndex(stage);
    const CL = C.CLUB;
    const hostess = Math.min(HOST_SEATS.length, Math.floor(CL.HOSTESS_START + (k - 1) * CL.HOSTESS_PER_CLUB));
    const guests = Math.min(GUEST_SEATS.length, Math.floor(CL.GUEST_START + (k - 1) * CL.GUEST_PER_CLUB));
    return { hostess, guests };
  }

  // ステージ stage の店内の人(描く順 = 奥から手前。足元の y が小さい順)
  const layoutCache = {};
  function layout(stage) {
    if (layoutCache[stage]) return layoutCache[stage];
    const n = counts(stage);
    const people = [];
    HOST_SEATS.slice(0, n.hostess).forEach((s, i) => people.push({ ...s, role: 'h', ref: 'hostess', id: 'h' + i }));
    GUEST_SEATS.slice(0, n.guests).forEach((s, i) => people.push({ ...s, role: 'g', ref: GUEST_ORDER[i % GUEST_ORDER.length], id: 'g' + i }));
    people.sort((a, b) => a.y - b.y);
    people.forEach((p, i) => (p.seed = i * 7.31 + p.x * 0.013));
    return (layoutCache[stage] = people);
  }

  // 0 以上 1 未満の決まった値
  function hash(a, b) {
    const v = Math.sin(a * 127.1 + b * 311.7 + 0.5) * 43758.5453;
    return v - Math.floor(v);
  }

  let bg = null;
  function init(image) {
    bg = image || null;
  }

  // 1 人を描く(t = 描画の時刻)
  function drawPerson(ctx, p, t) {
    const s = p.s;
    const ph = Math.floor(p.seed * 10);
    // 左右の揺れ(ドット): 20 ステップごとに -1 / 0 / 1 / 0
    const sway = [0, 1, 0, -1][Math.floor((t + ph * 7) / 20) % 4];
    // 向き: 人ごとに 1.5〜3 秒の間隔で向きを変える
    const turnLen = 90 + Math.floor(hash(p.seed, 1) * 90);
    const turned = Math.floor((t + ph * 13) / turnLen) % 2 === 1;
    const flip = (p.look < 0) !== turned;
    // ステージの人は跳ねる(10 ステップごとに 1 ドット)
    const hop = p.dance && Math.floor((t + ph) / 10) % 2 === 0 ? s : 0;
    const x = Math.round(p.x + sway * s);
    const y = Math.round(p.y - hop);
    ctx.save();
    if (p.cut) {
      // ソファの背・テーブルの陰: 足元から cut ドットぶんを描かない
      ctx.beginPath();
      ctx.rect(x - 15 * s, y - 30 * s, 30 * s, (30 - p.cut) * s);
      ctx.clip();
    }
    if (p.role === 'h') {
      // キャバ嬢: 本編と同じ絵。ときどき乾杯のポーズ(救助ポーズのコマ)
      const cheer = (t + ph * 17) % 150 < 24;
      chars.draw(ctx, cheer ? 'hostessRescue' : 'hostessStand', x, y, { scale: s, flip });
    } else {
      // 客: 立ち姿。正面のコマがある人は、ときどき正面を向く
      const ch = POGO77.characters.get(p.ref);
      const front = HAS_FRONT(p.ref) && (t + ph * 23) % 200 < 40;
      ch.drawFrame(ctx, front ? 'front' : 'stand', x, y, { scale: s, flip: front ? false : flip });
    }
    ctx.restore();
  }

  function draw(ctx, g, text) {
    // 背景(固定)。画面の大きさに合わせて描く。ドットはぼかさない
    ctx.imageSmoothingEnabled = false;
    if (bg) ctx.drawImage(bg, 0, 0, C.W, C.H);
    else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, C.W, C.H);
    }
    const t = g.frame;
    for (const p of layout(g.stage)) drawPerson(ctx, p, t);
    // 見出し(天井の暗いところ)
    if (text) {
      text('STAGE ' + g.stage + ' CLEAR!', C.W / 2, 44, 48, '#fff27a', 'center');
      text('CLUB TIME!', C.W / 2, 100, 40, '#ff5aa6', 'center');
    }
  }

  // 確認用: ステージ stage の人数と配置(読むだけ)
  function snapshot(stage) {
    const n = counts(stage);
    return {
      stage,
      club: clubIndex(stage),
      hostess: n.hostess,
      guests: n.guests,
      total: n.hostess + n.guests,
      seats: { hostess: HOST_SEATS.length, guests: GUEST_SEATS.length },
      people: layout(stage).map((p) => ({ id: p.id, role: p.role, ref: p.ref, x: p.x, y: p.y, s: p.s })),
    };
  }

  return { init, draw, layout, counts, snapshot, SEATS };
})();
