// 物理演算(プレイヤーと障害物で共通の、空中移動・着地・天井の処理)
window.DP = window.DP || {};

DP.physics = (function () {
  const geo = DP.geometry;

  // 空中にいる物体を 1 ステップ動かす。
  // body: { x, y(足元), vx, vy }
  // opts: { gravity, maxFall, halfW, height(天井判定する場合), clampX(画面端で止める場合), ignore(着地しない鉄骨) }
  // 戻り値: { landed: 鉄骨 | null, bumped: bool }
  function stepAirborne(body, level, opts) {
    const W = DP.config.WIDTH;
    const prevX = body.x;
    const prevY = body.y;

    body.vy = Math.min(body.vy + opts.gravity, opts.maxFall);
    body.x += body.vx;
    body.y += body.vy;

    // 画面の外へ出ないようにする
    if (opts.clampX) {
      const minX = opts.halfW;
      const maxX = W - opts.halfW;
      if (body.x < minX) { body.x = minX; body.vx = 0; }
      if (body.x > maxX) { body.x = maxX; body.vx = 0; }
    }

    // 画面の左右の端で跳ね返す(1 面の瓶・缶)。中心が画面の端(x=0 / WIDTH)を越えたとき、
    // opts.wallBounce(跳ね返したあとの x, このステップの最初の高さ) が true なら(その下に鉄骨があるなら)端で折り返して横の速さを逆にする。
    // 最初の高さで調べるのは、速いと端を越えた 1 ステップのうちに下の鉄骨の上面より下まで落ちていることがあるため。
    // 着地の判定より前に行うので、跳ね返ったその場所の鉄骨にそのまま着地できる(1 段飛ばさない)。
    // 向きが画面の内側へ変わるので、同じ端で続けて折り返すことはない
    // wallMargin: 跳ね返す位置を端からこれだけ内側にする(1 面の 2 個セットは全長の半分。単体は 0)
    if (opts.wallBounce) {
      const m = opts.wallMargin || 0;
      let edge = null;
      if (body.x < m && body.vx < 0) edge = m;
      else if (body.x > W - m && body.vx > 0) edge = W - m;
      if (edge !== null) {
        const mx = 2 * edge - body.x;
        if (opts.wallBounce(mx, prevY)) {
          body.x = mx;
          body.vx = -body.vx;
        }
      }
    }

    const result = { landed: null, bumped: false };

    // 上昇中: 頭が鉄骨の下面にぶつかったら止める(下から突き抜けない)
    if (body.vy < 0 && opts.height) {
      const ceil = geo.findCeiling(level, prevX, prevY - opts.height, body.x, body.y - opts.height, opts.halfW);
      if (ceil) {
        body.y = ceil.y + opts.height;
        body.vy = 0;
        result.bumped = true;
      }
    }

    // 下降中: 鉄骨の上面を通過したら、その上に乗せる
    if (body.vy >= 0) {
      const g = geo.findLanding(level, prevX, prevY, body.x, body.y, opts.ignore);
      if (g) {
        body.y = geo.surfaceY(g, body.x);
        body.vy = 0;
        result.landed = g;
      }
    }
    return result;
  }

  // 鉄骨の上を横に動かす。端からはみ出したら false(落下開始の合図)
  function moveOnGirder(body, g, dx) {
    body.x += dx;
    if (!geo.containsX(g, body.x)) return false;
    body.y = geo.surfaceY(g, body.x);
    return true;
  }

  return { stepAirborne, moveOnGirder };
})();
