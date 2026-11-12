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
