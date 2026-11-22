// POGO77 GAMES 共通キャラクター: ドット絵(文字列)スプライトの共通部品
// ドンキーパンク(games/donkeypunk/js/sprites.js)と同じ方式:
//   1 文字 = 1 ドット、'.' は透明、色は PALETTE で決める。
// ここにはドンキーパンクのパレットをそのまま写してある(ドンキーパンク本体は変更しない・参照もしない)。
// 使い方:
//   <script src="../shared/characters/pixel-sprite.js"></script>
//   <script src="../shared/characters/hostess.js"></script> など
//   POGO77.chars.draw(ctx, 'hostessStand', cx, footY, { scale: 5, flip: true });
window.POGO77 = window.POGO77 || {};

POGO77.chars = (function () {
  // ドンキーパンクの PALETTE の写し(色を足すときは末尾に追加し、既存の文字の色は変えない)
  const PALETTE = {
    K: '#141414', // 黒(革ジャン・ブーツ)
    k: '#3a3a44', // 濃いグレー
    R: '#ff2a2a', // 赤(モヒカン)
    r: '#a81414', // 暗い赤
    S: '#f4bc94', // 肌
    s: '#c98a62', // 肌の影
    W: '#ffffff',
    G: '#cfd6e0', // 銀(スタッズ・ピアス)
    J: '#3458b0', // ジーンズ
    j: '#22397a',
    B: '#2a1a12', // ブーツ
    b: '#7a7a7a', // ブーツの底
    N: '#1d2c74', // 警官の制服(紺)
    n: '#2f48b8', // 制服の明るい部分
    Y: '#ffd23c', // 金(バッジ)/ キャバ嬢の金髪
    F: '#5c3418', // ゴリラの毛
    f: '#8a5630', // ゴリラの顔
    P: '#ff5aa6', // ピンク(キャバ嬢のドレス・リボン・ヒール)
    p: '#b8306e', // 暗いピンク
    g: '#1f8a3a', // ビール瓶(緑のガラス)
    h: '#8cf0a0', // ガラスの光
    L: '#f4e2a0', // ラベル
    C: '#e02a2a', // 缶の赤
    c: '#d8dde4', // 缶の銀
    T: '#d89a52', // 木(明るい)
    t: '#8e5626', // 木(影)
    w: '#f6d29a', // 木のつや
    O: '#ff8a1e', // オレンジ(炎)
    e: '#d8e4f0', // 青白い白
    U: '#3a8cff', // 青
    V: '#3cd04a', // 緑
    m: '#0e5222', // 濃い緑
  };

  // 登録されたスプライト(名前 → { w, h, rows })
  const DATA = {};

  // 文字列の配列 → { w, h, rows }(短い行は右を透明で埋める)
  function def(rows) {
    const w = Math.max(...rows.map((r) => r.length));
    return { w, h: rows.length, rows: rows.map((r) => r.padEnd(w, '.')) };
  }

  // スプライトをまとめて登録する({ 名前: def([...]) })
  function register(map) {
    for (const name of Object.keys(map)) DATA[name] = map[name];
  }

  // 描画を速くするため、スプライトごと(左右反転ごと)にオフスクリーンキャンバスへ焼いておく
  const cache = {};
  function bake(name, flip) {
    const key = name + (flip ? ':f' : '');
    if (cache[key]) return cache[key];
    const s = DATA[name];
    if (!s) throw new Error('unknown sprite: ' + name);
    const cv = document.createElement('canvas');
    cv.width = s.w;
    cv.height = s.h;
    const c = cv.getContext('2d');
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const ch = s.rows[y][x];
        if (ch === '.' || !PALETTE[ch]) continue;
        c.fillStyle = PALETTE[ch];
        c.fillRect(flip ? s.w - 1 - x : x, y, 1, 1);
      }
    }
    cache[key] = cv;
    return cv;
  }

  // (cx, footY) を下端中央として描く。opts: scale(既定 2)/ flip
  function draw(ctx, name, cx, footY, opts) {
    opts = opts || {};
    const scale = opts.scale || 2;
    const s = DATA[name];
    const img = bake(name, !!opts.flip);
    const w = s.w * scale;
    const h = s.h * scale;
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false; // ドットをぼかさない
    ctx.drawImage(img, Math.round(cx - w / 2), Math.round(footY - h), w, h);
    ctx.imageSmoothingEnabled = prev;
  }

  return { PALETTE, DATA, def, register, bake, draw };
})();
