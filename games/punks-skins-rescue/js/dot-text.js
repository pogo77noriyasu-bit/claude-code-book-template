// PUNKS & SKINS RESCUE: ドット文字の共通描画(2026-11-22)
//
// ゲーム内の文字(タイトル・遊び方・HUD・HELP!・RESCUED!・MISS!・SAFE・STAGE CLEAR!・キャバクラ・GAME OVER)を、
// すべて 1980 年代の 8 ビットゲーム風のドット文字で描く。
//   - 英数字・記号だけの文字列 = Press Start 2P(8×8 ドット。ドンキーパンク・NAKED PUNK などと同じ書体)
//   - 日本語を含む文字列     = DotGothic16(16×16 ドット。英数字も同じ書体の半角のドット文字になる)
// 作り方: 書体の本来の大きさ(8px / 16px)で小さな canvas に描き、半透明の画素を「ドットあり / なし」の 2 値にそろえ、
//   1 ドットの黒い縁取りを付けてから、整数倍に最近傍補間(imageSmoothingEnabled = false)で拡大する。ぼやけない。
// 大きさ(size)は今までの指定(px)のまま受け取り、見た目の大きさが近くなる整数倍に直す:
//   英数字: 倍率 = round(size × 0.6 / 8)(前の書体 Courier New の 1 文字の幅 ≈ 0.6 × size に合わせる)
//   日本語: 倍率 = round(size / 16)
// 書体の読み込みが終わる前は、代わりの書体を同じ方法でドットにして描く(読み込めた次のフレームから正しい書体)。
// 描いた文字はキャッシュする(同じ文字列・色は 2 回目から drawImage 1 回)。
window.PSR = window.PSR || {};

PSR.dotText = (function () {
  const EN = { family: '"Press Start 2P", monospace', base: 8, ref: 'H', perSize: 0.6 / 8 };
  const JA = { family: '"DotGothic16", monospace', base: 16, ref: '漢', perSize: 1 / 16 };
  const ASCII = /^[\x20-\x7e←→]*$/; // ← → は Press Start 2P にないので、ドット絵の矢印で描く(ARROWS)
  const ALPHA_ON = 110; // この不透明度以上の画素を「ドットあり」にする

  // Press Start 2P にない矢印(8×8 ドット。'X' = ドット)
  const ARROWS = {
    '←': ['...X....', '..XX....', '.XXXXXXX', 'XXXXXXXX', '.XXXXXXX', '..XX....', '...X....', '........'],
    '→': ['....X...', '....XX..', 'XXXXXXX.', 'XXXXXXXX', 'XXXXXXX.', '....XX..', '....X...', '........'],
  };

  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: true });

  const fontOf = (str) => (ASCII.test(str) ? EN : JA);
  const scaleOf = (str, size) => Math.max(1, Math.round(size * fontOf(str).perSize));
  const cssFont = (f) => f.base + 'px ' + f.family;

  // ---- 書体の読み込み(Google Fonts は日本語を文字の範囲ごとに分けて配るので、使う文字ごとに読み込む) ----
  // 注意: Google Fonts の CSS がまだ届いていないと、document.fonts.check() は「該当する書体がない = 読み込み済み」として
  // true を返す。そのまま代わりの書体の文字をキャッシュすると、あとで正しい書体が届いても直らない(幅も変わる)。
  // そこで「その書体の FontFace が登録され、読み込みが終わっている」ことを確かめてからキャッシュする。
  // GIVE_UP_MS たっても書体が来ない(オフラインなど)ときは、代わりの書体のまま固定する。
  const GIVE_UP_MS = 6000;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const tried = new Set(); // 読み込みが終わった(または、あきらめた)「書体|文字列」
  const pending = new Set();
  const familyName = (f) => f.family.split(',')[0].replace(/"/g, '').trim();
  // その書体の FontFace が 1 つでも登録されているか(CSS が届いたか)
  function hasFace(f) {
    const name = familyName(f);
    for (const face of document.fonts) if (face.family.replace(/"/g, '') === name) return true;
    return false;
  }
  function ready(f, str) {
    const key = f.family + '|' + str;
    if (tried.has(key)) return true;
    if (!document.fonts || !document.fonts.check) return true;
    if (performance.now() - t0 > GIVE_UP_MS) {
      tried.add(key);
      return true;
    }
    if (!hasFace(f)) return false; // CSS がまだ(届いたら次のフレームから読み込む)
    try {
      if (document.fonts.check(cssFont(f), str)) {
        tried.add(key);
        return true;
      }
    } catch (e) {
      return true;
    }
    if (!pending.has(key)) {
      pending.add(key);
      document.fonts
        .load(cssFont(f), str)
        .catch(() => [])
        .then((faces) => {
          pending.delete(key);
          if (faces && faces.length) tried.add(key); // 読み込めた。0 件なら次のフレームでまた試す
        });
    }
    return false;
  }

  // ---- 書体ごとの縦の位置(基準の文字の、ドットのある一番上と一番下の行) ----
  const metrics = new Map();
  function rowsOf(f) {
    if (metrics.has(f) && metrics.get(f).ok) return metrics.get(f);
    const ok = ready(f, f.ref);
    const m = bake(f, f.ref, '#fff', false).ink;
    const r = { top: m.top, bottom: m.bottom, ok };
    metrics.set(f, r);
    return r;
  }

  // 文字列を本来の大きさで描いて 2 値のドットにし、縁取りを付けた小さな canvas を返す
  //   戻り値: { cv(縁取りの 1 ドットを含む), w(文字の送り幅。ドット), pad(縁取りの幅 = 1), ink(ドットのある行の範囲) }
  function bake(f, str, color, outline) {
    const pad = 1;
    const H = f.base * 2; // ベースラインの下(g・p など)とすき間も入る高さ
    const top0 = Math.round(f.base * 0.5); // 文字の上の余白
    wctx.font = cssFont(f);
    // 矢印は Press Start 2P にないので、ドット絵に置き換える(幅は 1 文字 = 8 ドット)
    const parts = [];
    let w = 0;
    for (const ch of str) {
      if (f === EN && ARROWS[ch]) {
        parts.push({ arrow: ARROWS[ch], x: w });
        w += 8;
      } else {
        const last = parts[parts.length - 1];
        if (last && last.s !== undefined) last.s += ch;
        else parts.push({ s: ch, x: w });
        w = parts[parts.length - 1].x + Math.round(wctx.measureText(parts[parts.length - 1].s).width);
      }
    }
    w = Math.max(1, w);
    const W = w + pad * 2;
    const Hc = H + pad * 2;
    work.width = W;
    work.height = Hc;
    wctx.clearRect(0, 0, W, Hc);
    wctx.font = cssFont(f);
    wctx.textBaseline = 'top';
    wctx.fillStyle = '#fff';
    for (const p of parts) {
      if (p.s !== undefined) wctx.fillText(p.s, pad + p.x, pad + top0);
      else for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (p.arrow[r][c] === 'X') wctx.fillRect(pad + p.x + c, pad + top0 + r, 1, 1);
    }
    const src = wctx.getImageData(0, 0, W, Hc).data;
    const on = new Uint8Array(W * Hc);
    let top = Hc;
    let bottom = -1;
    for (let i = 0; i < W * Hc; i++) {
      if (src[i * 4 + 3] >= ALPHA_ON) {
        on[i] = 1;
        const y = Math.floor(i / W);
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    // 色を塗る(文字 = color、そのまわり 8 方向 1 ドット = 黒の縁取り)
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = Hc;
    const cx = cv.getContext('2d');
    const img = cx.createImageData(W, Hc);
    const [cr, cg, cb] = rgb(color);
    for (let y = 0; y < Hc; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let r = -1;
        let g = 0;
        let b = 0;
        if (on[i]) [r, g, b] = [cr, cg, cb];
        else if (outline) {
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx >= 0 && yy >= 0 && xx < W && yy < Hc && on[yy * W + xx]) {
                near = true;
                break;
              }
            }
          if (near) r = 0;
        }
        if (r >= 0) {
          img.data[i * 4] = r;
          img.data[i * 4 + 1] = g;
          img.data[i * 4 + 2] = b;
          img.data[i * 4 + 3] = 255;
        }
      }
    }
    cx.putImageData(img, 0, 0);
    return { cv, w, pad, ink: { top, bottom } };
  }

  // '#rrggbb' → [r, g, b]
  function rgb(c) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
  }

  const cache = new Map();
  function sprite(str, color, outline) {
    const f = fontOf(str);
    const key = f.base + '|' + color + '|' + (outline ? 1 : 0) + '|' + str;
    const hit = cache.get(key);
    if (hit) return hit;
    const ok = ready(f, str);
    const s = bake(f, str, color, outline);
    s.font = f;
    if (ok) {
      if (cache.size > 400) cache.clear(); // スコアなどで文字列が増えすぎないように
      cache.set(key, s);
    }
    return s;
  }

  // 画面上の幅(px)
  function measure(str, size) {
    if (!str) return 0;
    return sprite(str, '#fff', true).w * scaleOf(str, size);
  }

  // 倍率 1 のときの幅(ドット)
  function measure1(str) {
    return str ? sprite(str, '#fff', true).w : 0;
  }

  // (x, y) に描く。y は文字の縦の中心(今までの textBaseline 'middle' と同じ)。align = 'left' | 'center' | 'right'
  // opts.scale を渡すと、その倍率(整数)で描く(textPair で幅に収めるとき)
  function draw(ctx, str, x, y, size, color, align, opts) {
    if (!str) return;
    const o = opts || {};
    const s = sprite(str, color, o.outline !== false);
    const k = o.scale || scaleOf(str, size);
    const m = rowsOf(s.font);
    const wpx = s.w * k;
    let x0 = x;
    if (align === 'center') x0 = x - wpx / 2;
    else if (align === 'right') x0 = x - wpx;
    const mid = (m.top + m.bottom + 1) / 2; // 基準の文字(H / 漢)のドットの縦の中心
    const dx = Math.round(x0) - s.pad * k;
    const dy = Math.round(y - mid * k);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.cv, dx, dy, s.cv.width * k, s.cv.height * k);
    ctx.restore();
  }

  // 先に読み込んでおく(タイトル画面の日本語など)。読み込みが終わるまでは代わりの書体のドット文字
  function preload(strings) {
    for (const s of strings) ready(fontOf(s), s);
  }

  return { draw, measure, measure1, scaleOf, fontOf, preload, EN, JA };
})();
