// 操作説明のデモ: 100m 走。止まった構えから走り出し、RUN の連打がだんだん速くなるのに合わせて走る速さと足の回転が上がる
(function () {
  const H = PO.howto;
  const P = PO.DASH100;
  const START = 0.5; // 構えを見せてから走り出すまで(秒)
  const TAPS = H.tapTimes(START, 4.95, 0.24, 0.085); // 連打の時刻(だんだん速く)
  const CAP = { en: 'TAP! TAP! TAP!', ja: 'ひたすら連打!' };

  H.register({
    id: 'dash100',
    roles: { run: 'RUN' },
    init(env) {
      return { r: H.runner(env.player, P), taps: 0 };
    },
    update(s, dt, env) {
      const n = H.due(TAPS, env.t, dt);
      for (let i = 0; i < n; i++) {
        s.r.tap(env.t);
        s.taps++;
        env.press('run');
        env.caption(CAP.en, CAP.ja, true);
      }
      s.r.step(dt, env.t, { sound: true });
    },
    render(ctx, s, env) {
      const X = -40; // 走者の位置(実演の座標。カメラが走者を追う)
      H.world(ctx, () => {
        H.drawTrack(ctx, s.r.dist);
        if (s.taps === 0) PO.chars.drawStripPose(ctx, env.player, 'start', X, 0);
        else if (s.r.v <= 0.15) PO.chars.drawStripPose(ctx, env.player, 'stop', X, 0);
        else PO.chars.drawRunStrip(ctx, env.player, Math.floor(s.r.anim), X, 0);
        // 速いときは後ろに風の線(速さが目で見える)
        const k = Math.max(0, (s.r.v - 4) / (P.VMAX - 4));
        if (k > 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.25 + 0.5 * k).toFixed(2) + ')';
          for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(X - 60 - 40 * k - ((env.t * 400 + i * 37) % 30)), -70 + i * 22, Math.round(20 + 50 * k), 2);
        }
      });
    },
    snapshot: (s) => ({ v: s.r.v, dist: s.r.dist, anim: s.r.anim, taps: s.taps }),
  });
})();
