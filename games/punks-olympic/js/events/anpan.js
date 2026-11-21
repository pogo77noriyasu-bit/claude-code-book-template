// 種目: あんパン食い競争(ANPAN RACE)。100m 走と同じ走り(RUN の連打)に、ACTION のジャンプとあんパンを足す
// - 各レーンの 20・35・50・65・80m にあんパンを吊るす(横棒・支柱・ひも・あんパンはプログラムで描く)
// - ジャンプして、口があんパンの真下を通るときに高さが合っていれば成功(あんパンが消え、速さはそのまま)。
//   ジャンプしない・高さが合わないまま通り過ぎたら失敗(ボヨン!と一時的に減速。戻らなくてよい)
// - CPU はあんパンの手前で自動でジャンプする。成功率は CPU ごとに違い、失敗する回はわざとタイミングを外す
// 走り・スタート・順位・電光掲示板・勝敗のポーズはトラック種目の共通部品(track-race.js)を使う
(function () {
  const C = PO.config;
  const S = PO.stadium;
  const P0 = Object.assign({}, PO.DASH100, PO.ANPAN_RACE); // R1 の調整値
  const P = P0;
  const pxm = C.PX_PER_M;

  // あんパン(中心 (cx, cy)): こげ茶の縁・茶色の生地・明るいつや・まん中のへそ(けしの実)。競技と操作説明のデモ(js/howto/)で共通に使う
  function paintBread(ctx, cx, cy) {
    const w = P.BREAD_W;
    const h = P.BREAD_HT;
    ctx.fillStyle = '#3a1d08';
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2 + 2, h / 2 + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b4641e';
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#de9445';
    ctx.beginPath();
    ctx.ellipse(cx - 3, cy - 3, w / 2 - 6, h / 2 - 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1405';
    ctx.fillRect(Math.round(cx) - 2, Math.round(cy) - 4, 4, 3);
    ctx.fillStyle = '#f2e6c8';
    ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 4, 1, 1);
    ctx.fillRect(Math.round(cx) + 1, Math.round(cy) - 3, 1, 1);
  }

  function create(setup) {
    // いまの ROUND の調整値(PO.difficulty。R1 は元の調整値のまま)。この中ではこれを使う
    const P = PO.difficulty.params('anpan', P0);
    let api = null;
    // あんパンの状態: lanes[lane][i] = { eaten, swingT(揺れ始めてからの秒。null = 揺れていない) }
    const breads = [0, 1, 2, 3].map(() => P.BREADS.map(() => ({ eaten: false, swingT: null })));
    const jumpTotal = P.JUMP_PREP + P.JUMP_AIR + P.JUMP_LAND;

    // 口の位置(足元・左右中央からの画面の px)
    const mouthOf = (r) => {
      const R = PO.RUN_STRIPS[r.charId];
      return { dx: R.jump.mouth[0] * R.scale, dy: R.jump.mouth[1] * R.scale };
    };
    // ジャンプの状態: 'prep'(踏み切り)/ 'air'(空中)/ 'land'(着地)/ null
    function jumpPhase(r) {
      if (!r.jump) return null;
      const t = r.jump.t;
      if (t < P.JUMP_PREP) return 'prep';
      if (t < P.JUMP_PREP + P.JUMP_AIR) return 'air';
      return 'land';
    }
    // 足元から上がっている高さ(px)。空中は放物線
    function jumpHeight(r) {
      if (jumpPhase(r) !== 'air') return 0;
      const u = (r.jump.t - P.JUMP_PREP) / P.JUMP_AIR;
      return P.JUMP_H * 4 * u * (1 - u);
    }
    function startJump(r) {
      if (r.jump || r.finished) return false; // ジャンプ中の再ジャンプはしない
      r.jump = { t: 0, sounded: false };
      return true;
    }

    // CPU のジャンプの予定: あんパンごとに成功・失敗を先に決め、踏み切るタイミングのずれ(秒)を持つ
    function planCpu(r, rate) {
      r.jumpRate = rate;
      r.plan = P.BREADS.map(() => {
        const ok = PO.rng.next() < rate;
        const sign = PO.rng.next() < 0.5 ? -1 : 1;
        const err = ok ? PO.rng.range(-P.CPU_HIT_ERR, P.CPU_HIT_ERR) : sign * PO.rng.range(P.CPU_MISS_ERR[0], P.CPU_MISS_ERR[1]);
        return { ok, err, done: false };
      });
    }

    const hooks = {
      init(a) {
        api = a;
        // 成功率は CPU の強い順(setup.cpus の並び。2026-11-19 から固定)。走者の並びはレーン順などで変わるので、キャラクターで引く
        const rates = P.CPU_JUMP_SUCCESS;
        api.runners.forEach((r) => {
          r.jump = null;
          r.eaten = 0;
          r.missed = 0;
          r.nextBread = 0; // 次に通るあんパンの番号
          if (!r.isPlayer) planCpu(r, rates[Math.max(0, setup.cpus.indexOf(r.charId))]);
        });
      },
      raceStep(dt, actions) {
        const st = api.st;
        // プレイヤー: ACTION でジャンプ(GO!! のあと・ゴール前だけ。ジャンプ中は受け付けない)
        if (actions > 0 && st.phase === 'race') startJump(api.player);
        api.runners.forEach((r) => {
          // CPU: 次のあんパンの手前で、頂点で口がとどくタイミング(+ 予定のずれ)で踏み切る
          if (!r.isPlayer && !r.finished && r.nextBread < P.BREADS.length && st.phase === 'race') {
            const plan = r.plan[r.nextBread];
            if (!plan.done && !r.jump && r.v > 0.5) {
              const m = mouthOf(r);
              const ahead = P.BREADS[r.nextBread] - (r.dist + m.dx / pxm); // 口からあんパンまで(m)
              const lead = r.v * (P.JUMP_PREP + P.JUMP_AIR / 2 + plan.err);
              if (ahead <= lead) {
                plan.done = true;
                startJump(r);
              }
            }
          }
          // ジャンプの時間を進める
          if (r.jump) {
            r.jump.t += dt;
            if (!r.jump.sounded && r.jump.t >= P.JUMP_PREP) {
              r.jump.sounded = true;
              if (r.isPlayer) PO.sound.play('jump');
            }
            if (r.jump.t >= jumpTotal) r.jump = null;
          }
          // 揺れているあんパン
          breads[r.lane].forEach((b) => {
            if (b.swingT != null) b.swingT += dt;
          });
        });
      },
      // 口があんパンの真下を通った瞬間に判定する
      afterMove(r, d0) {
        if (r.nextBread >= P.BREADS.length) return;
        const m = mouthOf(r);
        const bm = P.BREADS[r.nextBread];
        if (d0 + m.dx / pxm < bm && r.dist + m.dx / pxm >= bm) {
          const b = breads[r.lane][r.nextBread];
          const mouthH = m.dy + jumpHeight(r); // 口の高さ(足元から)
          const hit = jumpPhase(r) === 'air' && Math.abs(mouthH - P.BREAD_H) <= P.HIT_Y;
          if (hit) {
            b.eaten = true;
            r.eaten++;
            if (r.isPlayer) PO.sound.play('eat');
          } else {
            b.swingT = 0;
            r.missed++;
            r.v *= P.MISS_SLOW; // 一時的に減速(プレイヤーは連打、CPU は加速で戻る)
            if (r.isPlayer) PO.sound.play('miss');
          }
          r.nextBread++;
        }
      },
      airborne: (r) => jumpPhase(r) === 'air',
      drawLane(ctx, lane, camX) {
        if (lane === 0) drawFrames(ctx, camX, 'back');
        drawBreads(ctx, lane, camX);
      },
      drawRunner(ctx, r, x, footY) {
        const ph = jumpPhase(r);
        if (!ph) return false;
        PO.chars.drawJump(ctx, r.charId, ph === 'prep' ? 0 : ph === 'air' ? 1 : 2, x, footY - jumpHeight(r));
        return true;
      },
      drawFront(ctx, camX) {
        drawFrames(ctx, camX, 'front');
      },
      frameOf(r) {
        const ph = jumpPhase(r);
        return ph ? 'jump_' + ph : null;
      },
      runnerSnapshot(r) {
        return { jump: jumpPhase(r), jumpH: jumpHeight(r), eaten: r.eaten, missed: r.missed, jumpRate: r.jumpRate == null ? null : r.jumpRate, planned: r.plan ? r.plan.map((p) => p.ok) : null, mouthH: mouthOf(r).dy + jumpHeight(r) };
      },
      snapshot() {
        return { breads: breads.map((l) => l.map((b) => (b.eaten ? 'eaten' : b.swingT != null ? 'missed' : 'ready'))), breadAt: P.BREADS.slice() };
      },
    };

    // ---------- あんパン・横棒・支柱の描画 ----------
    // レーン lane の、スタートから d m の地面の点(画面)
    const groundAt = (lane, d, camX) => ({ x: S.laneLineX(C.START_X, lane) + d * pxm - camX, y: S.laneFootY(lane) });
    // 奥の芝(レーン 0 の上端)と手前の芝(レーン 3 の下端)の、d m の地面の点(レーンの斜めの並びを延ばす)
    function edgeAt(d, camX, near) {
      const a = groundAt(0, d, camX);
      const b = groundAt(3, d, camX);
      const y = near ? S.laneRect(3).y + S.laneRect(3).h + 6 : S.laneRect(0).y - 4;
      const k = (y - a.y) / (b.y - a.y);
      return { x: a.x + (b.x - a.x) * k, y };
    }
    // 横棒と支柱。'back' = 奥の支柱と横棒(選手より奥)、'front' = 手前の支柱(選手より手前)
    function drawFrames(ctx, camX, which) {
      P.BREADS.forEach((d) => {
        const far = edgeAt(d, camX, false);
        const near = edgeAt(d, camX, true);
        if (Math.max(far.x, near.x) < -40 || Math.min(far.x, near.x) > C.W + 40) return;
        const pole = (g) => {
          ctx.fillStyle = '#222';
          ctx.fillRect(Math.round(g.x) - 4, Math.round(g.y - P.BAR_H) - 2, 8, P.BAR_H + 4);
          ctx.fillStyle = '#d8d8d8';
          ctx.fillRect(Math.round(g.x) - 2, Math.round(g.y - P.BAR_H), 4, P.BAR_H);
          ctx.fillStyle = '#555';
          ctx.fillRect(Math.round(g.x) - 7, Math.round(g.y) - 3, 14, 5); // 足
        };
        if (which === 'back') {
          pole(far);
          // 横棒(奥の支柱の上から手前の支柱の上まで)
          ctx.strokeStyle = '#222';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(far.x, far.y - P.BAR_H);
          ctx.lineTo(near.x, near.y - P.BAR_H);
          ctx.stroke();
          ctx.strokeStyle = '#e04a3a';
          ctx.lineWidth = 3;
          ctx.stroke();
        } else pole(near);
      });
    }
    // レーンのひもとあんパン
    function drawBreads(ctx, lane, camX) {
      P.BREADS.forEach((d, i) => {
        const g = groundAt(lane, d, camX);
        if (g.x < -40 || g.x > C.W + 40) return;
        const b = breads[lane][i];
        const topY = g.y - P.BAR_H;
        // 失敗したあんパンは揺れる(だんだん小さく)
        const sw = b.swingT != null ? Math.sin(b.swingT * 12) * 14 * Math.exp(-b.swingT * 1.6) : 0;
        const cy = g.y - P.BREAD_H;
        const cx = g.x + sw;
        ctx.strokeStyle = '#f4f4f4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(g.x, topY);
        // 食べられたあんパンは、ひもだけ短く残る
        if (b.eaten) ctx.lineTo(g.x, topY + 18);
        else ctx.lineTo(cx, cy - P.BREAD_HT / 2);
        ctx.stroke();
        if (b.eaten) return;
        paintBread(ctx, cx, cy);
      });
    }

    return PO.trackRace.create(setup, { id: 'anpan', title: 'ANPAN RACE', P, hooks });
  }

  PO.events.register({ id: 'anpan', create, paintBread });
})();
