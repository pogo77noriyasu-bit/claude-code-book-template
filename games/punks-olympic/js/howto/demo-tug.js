// 操作説明のデモ: 綱引き。競技と同じタイミングゲージ(往復の周期・判定の範囲・描画)を動かし、
// カーソルが PERFECT(緑)の範囲に入った瞬間に ACTION を光らせて綱を引く。往路(左→右)と復路(右→左)の両方で 1 回ずつ引く。
// 押したあとは折り返すまでゲージが暗くなり(競技と同じ)、ゲージの両端の矢印でカーソルの向きを見せる
(function () {
  const H = PO.howto;
  const P = PO.TUG;
  const START = 0.3; // ゲージが動き出す時刻
  const G = { x: 230, y: 216, w: 500, h: 34 }; // ゲージの位置(大きさは競技と同じ。位置だけデモの画面に合わせる)
  // カーソルが PERFECT の範囲に入った瞬間(範囲の端から 1 ステップに動く量の半分だけ内側)の、往復の中の時刻。
  // 往路は左の端から(位置 0.5 - PERFECT)、復路は右の端から(位置 0.5 + PERFECT)入る
  const IN = 0.005;
  const ENTER_GO = ((0.5 - P.ZONES.PERFECT + IN) / 2) * P.GAUGE_PERIOD;
  const ENTER_BACK = (1 - (0.5 + P.ZONES.PERFECT - IN) / 2) * P.GAUGE_PERIOD;
  const PULLS = [];
  for (let k = 0; k < 4; k++) [ENTER_GO, ENTER_BACK].forEach((e) => PULLS.push(START + k * P.GAUGE_PERIOD + e));
  const DRIFT = 28; // 相手が引き戻す速さ(px/秒。押し戻されるようすを見せる。引く回数が多いので画面から出ないように)
  const CAP = { en: 'TIMING!', ja: 'タイミングよく引け!' };

  H.register({
    id: 'tug',
    roles: { action: 'PULL' },
    init() {
      return { p: 0, u: 0, pullT: 0, judge: null, locked: -1, count: 0, judges: [], dirs: [] };
    },
    update(s, dt, env) {
      const tug = PO.events.get('tug');
      const gt = env.t - START; // ゲージの時間
      if (env.t >= START - 1e-9) env.caption(CAP.en, CAP.ja);
      if (H.due(PULLS, env.t, dt)) {
        // 押した瞬間のカーソルの位置で、競技と同じ判定(PERFECT になる)
        const name = tug.judgeAt(tug.gaugePos(gt));
        s.judges.push(name);
        s.judge = { name, t: 0 };
        s.locked = tug.strokeOf(gt); // 競技と同じく、折り返すまで押せない(暗くなる)
        s.dirs.push(s.locked % 2 === 0 ? 'go' : 'back');
        s.count++;
        s.u -= P.FORCE[name] * P.PULL_IMPULSE; // プレイヤーは左のチーム(左へ引く)
        s.pullT = P.PULL_SHOW;
        env.press('action');
        PO.sound.play('tugpull');
        PO.sound.play('stomp');
        if (name === 'PERFECT') PO.sound.play('perfect');
      }
      if (s.judge) s.judge.t += dt;
      s.pullT = Math.max(0, s.pullT - dt);
      // 綱の動き(競技と同じ減衰)と、相手が少しずつ引き戻す動き
      s.u *= Math.exp(-P.DAMP * dt);
      s.p += (s.u + (env.t > START ? DRIFT : 0)) * dt;
    },
    render(ctx, s, env) {
      const tug = PO.events.get('tug');
      const gt = Math.max(0, env.t - START);
      const pf = s.pullT > 0 ? 1 : s.u + DRIFT > 0 ? 2 : 0; // 引く / 踏ん張り(押し戻されている)/ 構え
      const rf = s.pullT > 0 ? 2 : 0; // 相手: こちらが引いた直後は踏ん張り
      const px = -78 + s.p; // プレイヤー(左・右向き)
      const rx = 78 + s.p; // 相手(右・左右反転)
      H.world(ctx, () => {
        // 地面と中央線
        ctx.fillStyle = '#2f6a2a';
        ctx.fillRect(-330, -6, 660, 22);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-1, -6, 3, 22);
        // 綱(両方の手を結ぶ。中央に赤い目印)
        const a = PO.chars.pullRope(env.player, pf);
        const b = PO.chars.pullRope(env.rival, rf);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(px + a.dx, -a.dy);
        ctx.lineTo(rx - b.dx, -b.dy);
        ctx.stroke();
        ctx.strokeStyle = '#d9b26a';
        ctx.lineWidth = 3;
        ctx.stroke();
        const mx = (px + a.dx + rx - b.dx) / 2;
        const my = (-a.dy - b.dy) / 2;
        ctx.fillStyle = '#ff2a3a';
        ctx.fillRect(Math.round(mx) - 3, Math.round(my) - 6, 6, 12);
        PO.chars.drawPull(ctx, env.rival, rf, rx, 0, true);
        PO.chars.drawPull(ctx, env.player, pf, px, 0, false);
      });
      // 競技と同じタイミングゲージ(押したあと、折り返すまでは暗くなる)
      const active = env.t >= START;
      const locked = active && tug.strokeOf(gt) === s.locked;
      tug.paintGauge(ctx, G, { pos: active ? tug.gaugePos(gt) : 0, locked, judge: s.judge, hint: locked ? 'WAIT...' : null });
      // カーソルの向き: 動いている向きの矢印を明るく(往路 = 右の →、復路 = 左の ←)
      const dir = active ? (tug.strokeOf(gt) % 2 === 0 ? 1 : -1) : 0;
      const y = G.y + G.h / 2;
      PO.draw.text(ctx, '←', G.x - 40, y, { size: 34, color: dir < 0 ? '#ffe600' : '#444', align: 'center', outline: dir < 0 ? '#000' : null });
      PO.draw.text(ctx, '→', G.x + G.w + 40, y, { size: 34, color: dir > 0 ? '#ffe600' : '#444', align: 'center', outline: dir > 0 ? '#000' : null });
    },
    snapshot: (s) => ({ count: s.count, judges: s.judges.slice(), dirs: s.dirs.slice(), p: s.p, locked: s.locked }),
  });
})();
