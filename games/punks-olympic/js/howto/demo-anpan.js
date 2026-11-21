// 操作説明のデモ: あんパン食い競争。RUN の連打で走り、あんパンに近づいたら ACTION でジャンプしてあんパンを食べ、着地したらまた走る
// ジャンプの時間・高さ・口の位置は競技と同じ値(PO.ANPAN_RACE・切り出したジャンプのコマの mouth)
(function () {
  const H = PO.howto;
  const P = Object.assign({}, PO.DASH100, PO.ANPAN_RACE);
  const pxm = PO.config.PX_PER_M;
  const START = 0.3;
  const TAPS = H.tapTimes(START, 4.95, 0.2, 0.1);
  const JUMP_AT = 2.3; // ACTION を押す時刻
  const EAT_U = 0.4; // 空中のこの割合で口があんパンに届く(頂点の少し手前。競技と同じ判定で成功する高さ)
  const EAT_AT = JUMP_AT + P.JUMP_PREP + P.JUMP_AIR * EAT_U;
  const X = -60; // 走者の位置(実演の座標)
  const JA = '連打で走ってジャンプ!';

  // 1 ステップ分の走り・ジャンプ(init の先読みと update で同じ計算をする)
  function advance(s, dt, t, sound) {
    const n = H.due(TAPS, t, dt);
    for (let i = 0; i < n; i++) s.r.tap(t);
    s.r.step(dt, t, { air: phase(s) === 'air', sound });
    if (s.jumpT != null) s.jumpT += dt;
    return n;
  }
  function phase(s) {
    if (s.jumpT == null) return null;
    if (s.jumpT < P.JUMP_PREP) return 'prep';
    if (s.jumpT < P.JUMP_PREP + P.JUMP_AIR) return 'air';
    if (s.jumpT < P.JUMP_PREP + P.JUMP_AIR + P.JUMP_LAND) return 'land';
    return null;
  }
  function height(s) {
    if (phase(s) !== 'air') return 0;
    const u = (s.jumpT - P.JUMP_PREP) / P.JUMP_AIR;
    return P.JUMP_H * 4 * u * (1 - u);
  }
  const mouthOf = (id) => {
    const R = PO.RUN_STRIPS[id];
    return { dx: R.jump.mouth[0] * R.scale, dy: R.jump.mouth[1] * R.scale };
  };

  H.register({
    id: 'anpan',
    roles: { run: 'RUN', action: 'JUMP' },
    init(env) {
      // 口があんパンに届く時刻に、あんパンがちょうど口の真上に来るよう、走った距離を先読みしてあんパンを置く
      const pre = { r: H.runner(env.player, P), jumpT: null };
      const STEP = PO.config.STEP;
      for (let t = STEP; t <= EAT_AT + 1e-9; t += STEP) {
        if (pre.jumpT == null && t >= JUMP_AT - 1e-9) pre.jumpT = 0;
        advance(pre, STEP, t, false);
      }
      const breadDist = pre.r.dist + mouthOf(env.player).dx / pxm;
      return { r: H.runner(env.player, P), jumpT: null, breadDist, eaten: false, jumped: false, mouthH: null };
    },
    update(s, dt, env) {
      if (!s.jumped && env.t >= JUMP_AT - 1e-9) {
        // ジャンプ: ACTION が光るのと同じステップで踏み切り・効果音
        s.jumped = true;
        s.jumpT = 0;
        env.press('action');
        env.caption('JUMP!', JA);
        PO.sound.play('jump');
      }
      const n = advance(s, dt, env.t, true);
      for (let i = 0; i < n; i++) {
        env.press('run');
        if (!s.jumped || phase(s) === null) env.caption('TAP! TAP! TAP!', JA, true);
      }
      // 口があんパンの真下を通ったら食べる(競技と同じ高さの判定)
      if (!s.eaten && s.r.dist + mouthOf(env.player).dx / pxm >= s.breadDist) {
        s.mouthH = mouthOf(env.player).dy + height(s);
        if (phase(s) === 'air' && Math.abs(s.mouthH - P.BREAD_H) <= P.HIT_Y) {
          s.eaten = true;
          PO.sound.play('eat');
        }
      }
    },
    render(ctx, s, env) {
      const bx = X + (s.breadDist - s.r.dist) * pxm; // あんパンの x(実演の座標)
      H.world(ctx, () => {
        H.drawTrack(ctx, s.r.dist);
        // 支柱と横棒(競技と同じ色)・ひも・あんパン
        if (bx > -400 && bx < 400) {
          const px = bx + 34;
          ctx.fillStyle = '#222';
          ctx.fillRect(Math.round(px) - 4, -P.BAR_H - 2, 8, P.BAR_H + 4);
          ctx.fillStyle = '#d8d8d8';
          ctx.fillRect(Math.round(px) - 2, -P.BAR_H, 4, P.BAR_H);
          ctx.fillStyle = '#e04a3a';
          ctx.fillRect(Math.round(bx) - 6, -P.BAR_H - 2, Math.round(px - bx) + 8, 5);
          ctx.strokeStyle = '#f4f4f4';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(bx, -P.BAR_H);
          ctx.lineTo(bx, s.eaten ? -P.BAR_H + 18 : -P.BREAD_H - P.BREAD_HT / 2);
          ctx.stroke();
          if (!s.eaten) PO.events.get('anpan').paintBread(ctx, bx, -P.BREAD_H);
        }
        const ph = phase(s);
        if (ph) PO.chars.drawJump(ctx, env.player, ph === 'prep' ? 0 : ph === 'air' ? 1 : 2, X, -height(s));
        else if (s.r.v <= 0.15) PO.chars.drawStripPose(ctx, env.player, 'start', X, 0);
        else PO.chars.drawRunStrip(ctx, env.player, Math.floor(s.r.anim), X, 0);
      });
    },
    snapshot: (s) => ({ v: s.r.v, dist: s.r.dist, jumped: s.jumped, eaten: s.eaten, mouthH: s.mouthH, jump: phase(s) }),
  });
})();
