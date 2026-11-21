// 操作説明のデモ: 玉入れ。PICK(RUN)で玉を拾う → THROW(ACTION)で投げる → 玉がカゴに入る、をくり返す。
// 2 つのボタンを交互に押すことを見せる。玉・支柱・カゴ・キャラクターのコマは競技と同じ描画を使う
(function () {
  const H = PO.howto;
  const B = PO.BALL_TOSS;
  const PERIOD = 1.1; // 拾う → 投げるの 1 回の長さ(秒)
  const PICKS = [0, 1, 2, 3].map((k) => 0.3 + k * PERIOD);
  const THROWS = PICKS.map((t) => t + 0.55);
  const X = -120; // キャラクターの位置(実演の座標)
  const BASKET = { x: 130, y: -140 }; // カゴの口の中心(実演の座標)
  const G = B.GRAVITY / H.L.ZOOM; // 拡大して描くので、画面の上での重力が競技と同じになるよう割る
  const JA = '交互に押して投げろ!';

  const release = (id) => {
    const r = PO.chars.throwRelease(id);
    return { x: X + r.dx, y: -r.dy };
  };

  H.register({
    id: 'balltoss',
    roles: { run: 'PICK', action: 'THROW' },
    init() {
      return { holding: false, anim: null, animT: 0, flying: [], score: 0, inT: null, order: [] };
    },
    update(s, dt, env) {
      if (H.due(PICKS, env.t, dt)) {
        s.holding = true;
        s.anim = 'pick';
        s.animT = B.PICK_SHOW;
        s.order.push('pick');
        env.press('run');
        env.caption('PICK!', JA);
        PO.sound.play('pick');
      }
      if (H.due(THROWS, env.t, dt)) {
        s.holding = false;
        s.anim = 'throw';
        s.animT = B.THROW_SHOW;
        s.order.push('throw');
        const r = release(env.player);
        const T = B.FLIGHT;
        s.flying.push({ x0: r.x, y0: r.y, vx: (BASKET.x - r.x) / T, vy: (BASKET.y + 4 - r.y - 0.5 * G * T * T) / T, t: 0 });
        env.press('action');
        env.caption('THROW!', JA);
        PO.sound.play('toss');
      }
      s.animT = Math.max(0, s.animT - dt);
      if (s.animT === 0) s.anim = null;
      // 飛んでいる玉: カゴに届いたら入る(競技と同じ音)
      s.flying.forEach((b) => (b.t += dt));
      s.flying = s.flying.filter((b) => {
        if (b.t < B.FLIGHT) return true;
        s.score++;
        s.inT = 0;
        PO.sound.play('basket');
        return false;
      });
      if (s.inT != null) s.inT += dt;
    },
    render(ctx, s, env) {
      const color = PO.chars.byId(env.player).color;
      const bt = PO.events.get('balltoss');
      H.world(ctx, () => {
        // 地面
        ctx.fillStyle = '#2f6a2a';
        ctx.fillRect(-330, -6, 660, 22);
        bt.paintPole(ctx, BASKET.x, BASKET.y + B.BASKET_DEPTH - 6, 4);
        // 足元の玉(手が空のとき。拾うと消え、投げると次の玉が足元にある)
        if (!s.holding && s.anim !== 'pick') bt.paintBall(ctx, X + 26, -B.BALL_R + 2, color);
        const f = s.anim === 'pick' ? 0 : s.anim === 'throw' ? 2 : s.holding ? 1 : null;
        if (f != null) PO.chars.drawThrow(ctx, env.player, f, X, 0, false);
        else PO.chars.drawStripPose(ctx, env.player, 'stop', X, 0);
        // カゴ(奥)→ 飛んでいる玉 → カゴ(手前)
        const g = { x: BASKET.x, y: BASKET.y, hw: B.BASKET_W / 2, rh: 8, d: B.BASKET_DEPTH };
        bt.paintBasketBack(ctx, g);
        s.flying.forEach((b) => bt.paintBall(ctx, b.x0 + b.vx * b.t, b.y0 + b.vy * b.t + 0.5 * G * b.t * b.t, color));
        bt.paintBasketFront(ctx, g);
      });
      // 入った玉の数(カゴの上に小さく)
      if (s.score) {
        const p = H.toScreen(BASKET.x, BASKET.y);
        const pop = s.inT == null ? 1 : Math.min(1, s.inT * 8);
        PO.draw.text(ctx, 'IN! ×' + s.score, p.x, p.y - 44, { size: Math.round(26 * (0.7 + 0.3 * pop)), color: '#3affb0', align: 'center', italic: true });
      }
    },
    snapshot: (s) => ({ order: s.order.slice(), score: s.score, holding: s.holding, flying: s.flying.length }),
  });
})();
