// PUNKS & SKINS RESCUE: 8 ビット風グラフィック(2026-11-22 に NORI が正式採用。標準の表示)
// 通常の URL で有効。元のグラフィック(background.png・元の色)は URL に ?gfx=original を付けると表示できる(元の素材は残してある)。
// ?gfx=8bit は試作のころの URL で、付けても付けなくても同じ(8 ビット風)。
// - 背景: tools/make-8bit.js で作った assets-8bit/background_8bit.png(元の background.png は変更しない)
// - キャラクター: 色を下の 8 ビット機風パレット(54 色)の近い色に置き換える(このページの中だけ。素材のファイルは変えない)
// - スキンズ: 高解像度の image 版(skin.png)ではなく、共通素材の 20×20 ドット版 skin_002@1 を使う
// ドットの大きさはキャラクター(20×20 ドットを 5 倍)と同じ 5px にそろえる。ゲームのルール・操作・当たり判定は変えない。
window.PSR = window.PSR || {};

PSR.gfx8 = (function () {
  // ?gfx=original(または ?gfx=orig)のときだけ元のグラフィック。それ以外は 8 ビット風
  const enabled = !/[?&]gfx=orig(inal)?(&|$)/.test(location.search);

  // 1 ドットの大きさ(px)。キャラクターの表示倍率 PSR.config.SPRITE_SCALE と同じ
  const BLOCK = 5;
  // 背景に使う色の上限(パレットの中から、よく使う色をこの数まで)
  const MAX_BG_COLORS = 28;

  // 1980 年代の家庭用 8 ビット機でよく使われた 54 色のパレット(黒は 1 つにまとめた)
  const PALETTE = [
    '7c7c7c', '0000fc', '0000bc', '4428bc', '940084', 'a80020', 'a81000', '881400', '503000', '007800', '006800', '005800', '004058', '000000',
    'bcbcbc', '0078f8', '0058f8', '6844fc', 'd800cc', 'e40058', 'f83800', 'e45c10', 'ac7c00', '00b800', '00a800', '00a844', '008888',
    'f8f8f8', '3cbcfc', '6888fc', '9878f8', 'f878f8', 'f85898', 'f87858', 'fca044', 'f8b800', 'b8f818', '58d854', '58f898', '00e8d8', '787878',
    'fcfcfc', 'a4e4fc', 'b8b8f8', 'd8b8f8', 'f8b8f8', 'f8a4c0', 'f0d0b0', 'fce0a8', 'f8d878', 'd8f878', 'b8f8b8', 'b8f8d8', '00fcfc', 'f8d8f8',
  ].map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);

  // 人の目に近い色の距離(赤の平均で重みを変える。単純な RGB の距離より自然な色が選ばれる)
  function dist(a, b) {
    const rm = (a[0] + b[0]) / 2;
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
  }

  // いちばん近いパレットの色の番号。list を渡すとその中から選ぶ
  function nearestIndex(rgb, list) {
    const cand = list || PALETTE.map((_, i) => i);
    let best = cand[0];
    let bd = Infinity;
    for (const i of cand) {
      const d = dist(rgb, PALETTE[i]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  const toHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const fromHex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mapHex = (hex) => toHex(PALETTE[nearestIndex(fromHex(hex))]);

  // キャラクターの色をパレットの色に置き換える(ページを開いたときに 1 回。ドット絵を焼く前に行う)
  function applyToSprites() {
    if (!enabled) return;
    const P = POGO77.chars.PALETTE; // キャバ嬢・赤モヒカン・担架が使うパレット(このページのメモリの中だけ書き換える)
    for (const k of Object.keys(P)) P[k] = mapHex(P[k]);
    // 共通ローダーのドット絵(落ちてくる 10 人 = js/characters.js。窓の HELP! 演出の人もこの中)も同じパレットへ。色違い(variant)の色も
    const refs = new Set((PSR.CHARACTERS || []).map((c) => c.ref));
    for (const ref of refs) {
      let ch = null;
      try {
        ch = POGO77.characters && POGO77.characters.get(ref);
      } catch (e) {
        ch = null; // 読み込んでいない素材は飛ばす
      }
      if (!ch) continue;
      if (ch.palette) for (const k of Object.keys(ch.palette)) ch.palette[k] = mapHex(ch.palette[k]);
      for (const v of Object.values(ch.variants || {})) if (v.colors) for (const k of Object.keys(v.colors)) v.colors[k] = mapHex(v.colors[k]);
    }
  }

  // 炎のアニメーション(2026-11-22 に正式採用。標準で ON)。?fire=0 を付けると止めて、静止した炎の 8 ビット背景になる
  // - 背景は炎を消した background_8bit_nofire.png、その上に fire_8bit.png(4 コマを横に並べたシート。1px = 1 マス)を重ねる
  // - 範囲・色・コマ数はここで決め、tools/make-fire-8bit.js も同じ値を使う
  const FIRE = {
    enabled: enabled && !/[?&]fire=0(&|$)/.test(location.search),
    background: 'assets-8bit/background_8bit_nofire.png',
    sheet: 'assets-8bit/fire_8bit.png',
    // 炎を探す範囲(マス。1 マス = BLOCK px)。左のビルの屋上と窓だけ(右の街の窓明かり・街灯・月は入れない)
    x0: 6,
    y0: 6,
    w: 97,
    h: 135,
    frames: 4,
    stepsPerFrame: 10, // 10 ステップ(1/60 秒 × 10 ≈ 0.17 秒)ごとにコマを切り替える
    // 炎の色(熱さの順。1 = 暗い赤 〜 5 = 明るい黄色)。背景の炎に使われているパレットの色
    heat: { '881400': 1, a81000: 1, f83800: 2, f87858: 2, e45c10: 3, fca044: 3, ac7c00: 3, f8b800: 4, f0d0b0: 5, f8d878: 5 },
    colors: ['', 'a81000', 'f83800', 'e45c10', 'f8b800', 'f8d878'],
    // 炎の縁取りの色(炎と一緒に消して、炎のコマの側で描き直す。範囲の中だけ)
    outline: ['503000'],
  };

  return { enabled, BLOCK, MAX_BG_COLORS, PALETTE, nearestIndex, mapHex, applyToSprites, FIRE, background: 'assets-8bit/background_8bit.png' };
})();

PSR.gfx8.applyToSprites();
