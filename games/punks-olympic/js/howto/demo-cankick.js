// 操作説明のデモ: 缶蹴り。RUN の連打で助走 → キックラインの手前で KICK(ACTION)を押して助走終了 →
// KICK を押しているあいだ(ボタンが光ったまま)角度が上がる → 45 度付近で離す(光が消える)→ 缶を蹴って缶が飛ぶ
// 角度の上がる速さ・最小角度・缶の描画・角度のメーターは競技と同じ(PO.CAN_KICK・cankick.js の描画)
(function () {
  const H = PO.howto;
  const K = PO.CAN_KICK;
  const P = PO.DASH100; // 助走は 100m 走と同じ式
  const pxm = PO.config.PX_PER_M;
  const START = 0.3;
  const PRESS_AT = 2.1; // KICK を押す(助走終了・長押しの始まり)
  const TAPS = H.tapTimes(START, PRESS_AT - 0.05, 0.2, 0.1);
  const TARGET_ANGLE = 45;
  const RELEASE_AT = PRESS_AT + (TARGET_ANGLE - K.ANGLE_MIN) / K.ANGLE_SPEED; // 45 度になる時刻に離す
  const FLIGHT = 1.5; // 缶が飛んでいる時間(デモの見た目。画面に収まる距離)
  const X = -150; // キャラクターの位置(実演の座標)
  const GAP = 0.5; // 助走を終えた位置からキックラインまで(m)

  H.register({
    id: 'cankick',
    roles: { run: 'RUN', action: 'KICK' },
    init(env) {
      // KICK を押す時刻の位置を先読みして、そこから GAP m 先にキックラインを置く
      const pre = H.runner(env.player, P);
      const STEP = PO.config.STEP;
      // update と同じ順番で、KICK を押すステップ(そのステップの助走のあと)まで進める
      for (let t = STEP; ; t += STEP) {
        if (t >= START - 1e-9) {
          for (let i = 0; i < H.due(TAPS, t, STEP); i++) pre.tap(t);
          pre.step(STEP, t, {});
        }
        if (t >= PRESS_AT - 1e-9) break;
      }
      const line = pre.dist + GAP;
      return { r: H.runner(env.player, P), phase: 'ready', angle: K.ANGLE_MIN, line, kickT: 0, can: null, landed: false, kickAngle: null };
    },
    update(s, dt, env) {
      if (s.phase === 'ready' && env.t >= START - 1e-9) s.phase = 'run';
      if (s.phase === 'run') {
        const n = H.due(TAPS, env.t, dt);
        for (let i = 0; i < n; i++) {
          s.r.tap(env.t);
          env.press('run');
          env.caption('TAP! TAP!', '連打で助走!', true);
        }
        s.r.step(dt, env.t, { sound: true });
        if (env.t >= PRESS_AT - 1e-9) {
          // KICK を押した: 助走終了、押しているあいだ光る
          s.phase = 'aim';
          env.hold('action', true);
          env.caption('HOLD...', '長押しして角度を決めろ!');
        }
      } else if (s.phase === 'aim') {
        s.angle = Math.min(K.ANGLE_MAX, K.ANGLE_MIN + (env.t - PRESS_AT) * K.ANGLE_SPEED);
        if (env.t >= RELEASE_AT - 1e-9) {
          // 45 度で離す → 蹴る
          s.phase = 'kick';
          s.angle = TARGET_ANGLE;
          s.kickAngle = s.angle;
          env.hold('action', false);
          env.caption('RELEASE!', 'ボタンを離してキック!');
          PO.sound.play('cankick');
          s.can = { t: 0 };
        }
      } else if (s.phase === 'kick') {
        s.kickT += dt;
        if (s.can) {
          s.can.t += dt;
          if (!s.landed && s.can.t >= FLIGHT) {
            s.landed = true;
            PO.sound.play('canland');
          }
        }
      }
    },
    render(ctx, s, env) {
      const ck = PO.events.get('cankick');
      const lineX = X + (s.line - s.r.dist) * pxm; // キックライン(実演の座標)
      const canX0 = lineX + K.CAN_OFFSET * pxm;
      H.world(ctx, () => {
        H.drawTrack(ctx, s.r.dist);
        // キックライン
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(lineX) - 2, -12, 4, 30);
        // キャラクター: 待機 = 直立、助走 = 走り、角度を決める間 = ジャンプの踏み切り、蹴る = 空中のコマ(競技と同じ暫定のポーズ)
        if (s.phase === 'run' && s.r.v > 0.15) PO.chars.drawRunStrip(ctx, env.player, Math.floor(s.r.anim), X, 0);
        else if (s.phase === 'aim') PO.chars.drawJump(ctx, env.player, 0, X, 0);
        else if (s.phase === 'kick' && s.kickT < K.KICK_SHOW) PO.chars.drawJump(ctx, env.player, 1, X, 0);
        else PO.chars.drawStripPose(ctx, env.player, 'stop', X, 0);
        // 缶: 置いてある → 回りながら放物線で飛ぶ → 着地して転がる
        let cx = canX0;
        let cy = -2 - K.CAN_H / 2;
        let rot = 0;
        if (s.can) {
          const u = Math.min(1, s.can.t / FLIGHT);
          const roll = Math.max(0, s.can.t - FLIGHT);
          cx = canX0 + u * 240 + Math.min(40, roll * 60);
          cy += -150 * 4 * u * (1 - u);
          rot = s.can.t * 14 * (s.landed ? Math.max(0, 1 - roll) : 1);
        }
        ck.paintCan(ctx, cx, cy, rot);
      });
      // 角度のメーター(押しているあいだと蹴った直後。キャラクターの右上)
      if (s.phase === 'aim' || (s.phase === 'kick' && s.kickT < 0.6)) {
        const p = H.toScreen(X + 60, -80);
        ck.paintAngleGauge(ctx, p.x, p.y, s.angle);
      }
    },
    snapshot: (s) => ({ phase: s.phase, angle: s.angle, kickAngle: s.kickAngle, landed: s.landed, dist: s.r.dist, line: s.line }),
  });
})();
