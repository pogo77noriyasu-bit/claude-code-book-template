// 操作説明のデモ: リレー。RUN の連打で走る → 交換ゾーンで次の走者が待っていて走り出す → 競技と同じタイミングのバーの
// ▼ が緑(PERFECT)の範囲に入った瞬間に PASS(ACTION)を光らせてバトンを渡す → PERFECT! → 次の走者がそのまま走り続ける
// 交換ゾーン・PERFECT の範囲・判定・バーの描画・バトンの描画は競技と同じ(PO.RELAY・relay.js)
(function () {
  const H = PO.howto;
  const R = PO.RELAY;
  const P = Object.assign({}, PO.DASH100, R);
  const pxm = PO.config.PX_PER_M;
  const START = 0.2;
  const TAPS = H.tapTimes(START, 4.95, 0.16, 0.1);
  const PASS_AT = 3.0; // PASS を押す時刻
  const X = -40; // 操作している走者の位置(実演の座標。カメラが追う)
  const JUDGE_COLOR = { PERFECT: '#3affb0', GOOD: '#e8c62a', MISS: '#ff6a6a' };
  const JA = '緑の範囲でバトン交換!';
  const BAR = { bx: (PO.config.W - 420) / 2, by: 214, bw: 420 }; // バー(大きさは競技と同じ。位置だけデモの画面に合わせる)

  // 1 ステップ分の走り(init の先読みと update で同じ計算をする)
  function advance(s, dt, t, sound) {
    const n = H.due(TAPS, t, dt);
    for (let i = 0; i < n; i++) s.cur.tap(t);
    s.cur.step(dt, t, { sound });
    return n;
  }

  H.register({
    id: 'relay',
    roles: { run: 'RUN', action: 'PASS' },
    init(env) {
      // PASS を押す時刻の位置を先読みし、その位置が PERFECT の範囲に入った直後になるよう交換地点 X を置く
      const pre = { cur: H.runner(env.player, P) };
      const STEP = PO.config.STEP;
      // update と同じ順番で、PASS を押すステップ(そのステップの走りのあと)まで進める
      for (let t = STEP; ; t += STEP) {
        advance(pre, STEP, t, false);
        if (t >= PASS_AT - 1e-9) break;
      }
      const passDist = pre.cur.dist;
      // PASS を押すステップで、ちょうど PERFECT の範囲に入る(1 ステップに進む距離の半分だけ内側)
      const J = PO.difficulty.relayJudge(); // 判定の範囲はいまの ROUND の値(競技と同じ)
      const ex = passDist + J.PERFECT_M - (pre.cur.v * STEP) / 2;
      const a = H.runner(env.player, P);
      const b = H.runner(env.player, P); // 次の走者(同じチーム = 同じキャラクター)
      b.dist = ex - R.ZONE_IN + 1.5; // ゾーンの入り口の少し先で待つ
      return { a, b, cur: a, ex, passed: false, judge: null, judgeT: 0, cam: 0, bRun: false, passDist: null };
    },
    update(s, dt, env) {
      const n = advance(s, dt, env.t, true);
      for (let i = 0; i < n; i++) {
        env.press('run');
        if (!s.passed || env.t > PASS_AT + 0.6) env.caption('TAP! TAP!', JA, true);
      }
      if (!s.passed) {
        // 次の走者: 前の走者が近づいたら走り出し、前の走者のすぐ前(LEAD m)を並んで走る
        // (次の走者はゆっくり加速するので、前の走者が追いついて並ぶ。並んだら前の走者に押されて同じ速さになる)
        if (!s.bRun && s.a.dist >= s.b.dist - 3) s.bRun = true;
        if (s.bRun) {
          s.b.v = Math.min(s.a.v * 0.8, s.b.v + 4 * dt);
          s.b.dist = Math.max(s.b.dist + s.b.v * dt, s.a.dist + R.LEAD);
          s.b.anim += dt * 8 * PO.chars.stripCycles(PO.RUN_STRIPS[env.player], Math.max(s.b.v, 3), 0);
        }
        if (env.t >= PASS_AT - 1e-9) {
          // PASS: 交換地点からのずれで競技と同じ判定(PERFECT)。速さはそのまま次の走者へ
          s.passed = true;
          s.passDist = s.a.dist;
          const name = PO.events.get('relay').judgeAt(s.a.dist, s.ex);
          s.judge = name;
          s.judgeT = 0;
          s.b.v = s.a.v * R.KEEP[name];
          s.b.taps = s.a.taps.slice();
          s.cur = s.b;
          env.press('action');
          env.caption('PASS!', JA);
          PO.sound.play(name === 'PERFECT' ? 'perfect' : name === 'GOOD' ? 'pass' : 'tugmiss');
        }
      } else {
        // 渡し終えた走者は減速して止まる
        s.judgeT += dt;
        s.a.v = Math.max(0, s.a.v - s.a.v * P.RUNOUT_DECEL * dt - 2 * dt);
        s.a.dist += s.a.v * dt;
        if (s.a.v > 0.15) s.a.anim += dt * 8 * PO.chars.stripCycles(PO.RUN_STRIPS[env.player], s.a.v, 0);
      }
      // カメラ: 操作している走者を追う(交換のあとはなめらかに次の走者へ)
      const target = s.cur.dist;
      s.cam = s.passed ? s.cam + (target - s.cam) * Math.min(1, dt * 6) : target;
    },
    render(ctx, s, env) {
      const relay = PO.events.get('relay');
      const wx = (d) => X + (d - s.cam) * pxm; // 距離 → 実演の座標
      const drawRunner = (r, holding, dy) => {
        const x = wx(r.dist);
        if (r === s.b && !s.bRun) PO.chars.drawStripPose(ctx, env.player, 'start', x, dy);
        else if (r.v <= 0.15) PO.chars.drawStripPose(ctx, env.player, 'stop', x, dy);
        else {
          PO.chars.drawRunStrip(ctx, env.player, Math.floor(r.anim), x, dy);
          if (holding) relay.paintBaton(ctx, env.player, Math.floor(r.anim), x, dy);
        }
      };
      H.world(ctx, () => {
        H.drawTrack(ctx, s.cam);
        // 交換ゾーン(黄)・PERFECT の範囲(緑)・交換地点(白)。競技と同じ色
        const xa = wx(s.ex - R.ZONE_IN);
        const xb = wx(s.ex + R.ZONE_OUT);
        ctx.fillStyle = 'rgba(255, 230, 0, 0.35)';
        ctx.fillRect(Math.round(xa), -10, Math.round(xb - xa), 26);
        ctx.fillStyle = 'rgba(58, 255, 176, 0.5)';
        const J = PO.difficulty.relayJudge();
        ctx.fillRect(Math.round(wx(s.ex - J.PERFECT_M)), -10, Math.round(J.PERFECT_M * 2 * pxm), 26);
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(wx(s.ex)) - 2, -10, 4, 26);
        ctx.fillStyle = '#ffe600';
        ctx.fillRect(Math.round(xa), -10, 3, 26);
        ctx.fillRect(Math.round(xb) - 3, -10, 3, 26);
        // 次の走者は少し奥(並んで走る 2 人が見分けられるように)、前の走者は手前
        drawRunner(s.b, s.passed, -10);
        drawRunner(s.a, !s.passed, 0);
      });
      // 競技と同じタイミングのバー(交換が終わるまで)
      if (!s.passed || s.judgeT < R.JUDGE_SHOW) {
        const d = s.passed ? s.passDist : s.a.dist;
        const inZone = d >= s.ex - R.ZONE_IN;
        relay.paintPassBar(ctx, BAR, s.ex, d, s.passed ? null : { text: inZone ? 'PASS NOW!' : 'PASS ZONE ' + Math.max(0, Math.ceil(s.ex - R.ZONE_IN - d)) + 'm', color: inZone ? '#3affb0' : '#fff' });
      }
      // 判定(競技と同じ色)
      if (s.judge && s.judgeT < R.JUDGE_SHOW) {
        const pop = Math.min(1, s.judgeT * 10);
        PO.draw.text(ctx, s.judge + '!', PO.config.W / 2, BAR.by - 32, { size: Math.round(38 * (0.7 + 0.3 * pop)), color: JUDGE_COLOR[s.judge], align: 'center', italic: true });
      }
    },
    snapshot: (s) => ({ passed: s.passed, judge: s.judge, ex: s.ex, passDist: s.passDist, aDist: s.a.dist, bDist: s.b.dist, bV: s.b.v, cur: s.cur === s.a ? 1 : 2 }),
  });
})();
