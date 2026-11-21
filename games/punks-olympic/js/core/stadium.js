// 競技場(観客席・トラック・スタートライン)の描画。トラックを使う種目で共通に使う
// 背景画像を切り出した部品を、カメラの位置に合わせて横に並べる。
// タイトルロゴ(空の部分)は使わず、100m の文字はゴールの手前に 1 回だけ置く
PO.stadium = (function () {
  const C = PO.config;
  const D = PO.SPRITE_DATA.bg;

  // 原画の行 → 画面の y
  const toCanvasY = (srcY) => srcY - C.WORLD_SRC_Y0 + C.HUD_H;

  // レーン(0〜3、0 が奥)の足元の y
  function laneFootY(lane) {
    return toCanvasY(D.laneFoot[lane]);
  }
  // レーンの上端の y と高さ
  function laneRect(lane) {
    const [a, b] = D.lanes[lane];
    return { y: toCanvasY(a), h: b - a + 1 };
  }
  // スタートラインは斜め(奥行きの表現)なので、レーンごとにラインの x がずれる。
  // lineX(レーン 0 のラインの x)のとき、レーン lane のラインの x
  function laneLineX(lineX, lane) {
    return lineX + (D.lineXAtFoot[lane] - D.lineXAtFoot[0]);
  }

  // 正の剰余
  const mod = (a, n) => ((a % n) + n) % n;

  // opt.lines: 斜めの白線を置く位置(レーン 0 のラインの x の配列)
  // opt.text100m: 100m の文字の右端を置く位置(レーン 3 の x)。null なら置かない
  function draw(ctx, camX, opt) {
    // 観客席(半分の速さで流して奥行きを出す)
    const st = PO.assets.get('stands');
    const sy = toCanvasY(D.standsY0);
    for (let x = -mod(Math.floor(camX * C.STANDS_PARALLAX), st.width); x < C.W; x += st.width) ctx.drawImage(st, x, sy);
    // トラック(何もない区間をくり返す)
    const tr = PO.assets.get('track');
    const ty = toCanvasY(D.trackY0);
    for (let x = -mod(Math.floor(camX), tr.width); x < C.W; x += tr.width) ctx.drawImage(tr, x, ty);
    // 斜めの白線(スタート・ゴール)
    const li = PO.assets.get('startline');
    (opt.lines || []).forEach((lx) => {
      const x = Math.round(lx - D.lineXAtFoot[0] - D.lineOX - camX);
      if (x < C.W && x + li.width > 0) ctx.drawImage(li, x, ty);
    });
    // 100m の文字(レーン 3)
    if (opt.text100m != null) {
      const im = PO.assets.get('text100m');
      const r = laneRect(3);
      const x = Math.round(opt.text100m - im.width - camX);
      if (x < C.W && x + im.width > 0) ctx.drawImage(im, x, r.y + Math.round((r.h - im.height) / 2));
    }
  }

  return { draw, laneFootY, laneRect, laneLineX, toCanvasY };
})();
