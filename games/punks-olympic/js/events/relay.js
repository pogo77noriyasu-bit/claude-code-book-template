// 種目: 400m リレー(RELAY)。4 チーム対抗(プレイヤー 1 チーム + CPU 3 チーム)、1 チーム = 同じキャラクター 4 人
// - 100m 走の共通部品 PO.trackRace をそのまま使い(スタート・連打の走り・CPU の走り・足音・歓声・ゴール・順位・リザルト)、
//   400m を 1 つの競技として連続で走る。100m ごとのバトン交換・待っている次の走者・バトン・ミニマップ・電光掲示板を hooks で足す
// - バトン交換: 交換地点(100m・200m・300m)のまわりの交換ゾーンの中で ACTION(ENTER / PASS)を押すと交換。
//   交換地点からのずれで PERFECT / GOOD / MISS(速さの倍率が違う)。押さずにゾーンを通り過ぎたら自動で MISS の交換
// - プレイヤーは 4 人とも操作する(交換すると操作する走者が自動で次の人に替わる。連打はそのまま続けてよい)
// - 画面は 100m 走と同じ直線の横スクロール。トラックを 1 周していることは画面上部の楕円のミニマップで表す
(function () {
  const C = PO.config;
  const S = PO.stadium;
  const R0 = PO.RELAY;
  const P0 = Object.assign({}, PO.DASH100, R0); // 走り・CPU・スタートは 100m 走と同じ値。リレーの値で上書き(R1 の調整値)
  const R = R0;
  const pxm = C.PX_PER_M;
  const JUDGE_COLOR = { PERFECT: '#3affb0', GOOD: '#e8c62a', MISS: '#ff6a6a' };

  // 交換地点 X のときのゾーンでの判定
  // 判定の範囲はいまの ROUND の値(PO.difficulty.relayJudge。競技・CPU・操作説明のデモ・タイミングのバーで同じ)。J で指定もできる
  function judgeAt(d, X, J) {
    const j = J || PO.difficulty.relayJudge();
    const off = Math.abs(d - X);
    if (off <= j.PERFECT_M) return 'PERFECT';
    if (off <= j.GOOD_M) return 'GOOD';
    return 'MISS';
  }

  // バトン交換のタイミングのバー: ゾーン(赤)・GOOD(黄)・PERFECT(緑)・交換地点(白)と走者の位置(▼)
  //   B: { bx, by, bw }(バーの左端・上端・幅)、X: 交換地点(m)、dist: 走者の位置(m)、label: { text, color } バーの下の文字(null なら出さない)
  //   競技(drawPassGuide)と操作説明のデモ(js/howto/)で共通に使う
  function paintPassBar(ctx, B, X, dist, label) {
    const { bx, by, bw } = B;
    const J = PO.difficulty.relayJudge(); // 判定の範囲はいまの ROUND の値
    const span = R.ZONE_IN + R.ZONE_OUT + 8; // 表示する範囲(m)
    const m0 = X - R.ZONE_IN - 4;
    const toX = (d) => bx + ((d - m0) / span) * bw;
    PO.draw.panel(ctx, bx - 8, by - 8, bw + 16, 36, '#10122e', '#ffe600');
    ctx.fillStyle = '#5a2030';
    ctx.fillRect(bx, by, bw, 20);
    ctx.fillStyle = '#e8c62a';
    ctx.fillRect(toX(X - J.GOOD_M), by, toX(X + J.GOOD_M) - toX(X - J.GOOD_M), 20);
    ctx.fillStyle = '#c03040';
    ctx.fillRect(toX(X - R.ZONE_IN), by, toX(X - J.GOOD_M) - toX(X - R.ZONE_IN), 20);
    ctx.fillRect(toX(X + J.GOOD_M), by, toX(X + R.ZONE_OUT) - toX(X + J.GOOD_M), 20);
    ctx.fillStyle = '#3affb0';
    ctx.fillRect(toX(X - J.PERFECT_M), by, toX(X + J.PERFECT_M) - toX(X - J.PERFECT_M), 20);
    ctx.fillStyle = '#fff';
    ctx.fillRect(toX(X) - 1, by - 4, 3, 28);
    const px = Math.max(bx, Math.min(bx + bw, toX(dist)));
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(px, by + 2);
    ctx.lineTo(px - 10, by - 14);
    ctx.lineTo(px + 10, by - 14);
    ctx.fill();
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.moveTo(px, by - 1);
    ctx.lineTo(px - 7, by - 12);
    ctx.lineTo(px + 7, by - 12);
    ctx.fill();
    if (label) PO.draw.text(ctx, label.text, bx + bw / 2, by + 44, { size: 18, color: label.color, align: 'center' });
  }
  // バトン(赤と白)を、走りのコマ n の手の位置・角度に描く。走りのコマがないキャラクターでは描かない
  function paintBaton(ctx, charId, n, x, fy) {
    const h = PO.chars.runHand(charId, n, x, fy);
    if (!h) return;
    ctx.save();
    ctx.translate(Math.round(h.x), Math.round(h.y));
    ctx.rotate(h.angle);
    ctx.fillStyle = '#000';
    ctx.fillRect(-10, -3.5, 20, 7);
    ctx.fillStyle = '#ff2a3a';
    ctx.fillRect(-9, -2.5, 18, 5);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-2, -2.5, 4, 5);
    ctx.restore();
  }

  function create(setup) {
    // いまの ROUND の調整値(PO.difficulty。R1 は元の調整値のまま)。この中ではこれを使う
    const P = PO.difficulty.params('relay', P0);
    const R = P; // リレーの値(交換の判定の範囲・CPU の交換のうまさもいまの ROUND の値)
    let api = null; // trackRace から渡される { runners, player, st, P, worldX, rankOf, laneFootY }
    const spent = []; // バトンを渡し終えた走者(その場で減速して止まる): { lane, charId, d, v, anim }
    let judge = null; // プレイヤーのチームの直前の交換の判定 { name, t }
    let finalT = -1; // FINAL RUNNER! を出してからの時間(-1 = まだ)

    const legStart = (r) => (r.leg === 0 ? 0 : r.passAt[r.leg - 1]);

    // バトン交換
    function exchange(r, name) {
      const X = R.EXCHANGES[r.leg];
      r.judges.push(name);
      r.passAt.push(r.dist);
      spent.push({ lane: r.lane, charId: r.charId, d: r.dist, v: r.v, anim: r.anim });
      r.v *= R.KEEP[name];
      r.leg++;
      r.visOff = R.LEAD; // 次の走者は前の走者の少し前でバトンを受け取る(見た目のずれを少しずつ戻す)
      r.cpuPlanAt = null;
      if (r.isPlayer) {
        judge = { name, t: 0, X };
        if (name === 'PERFECT') PO.sound.play('perfect');
        else if (name === 'GOOD') PO.sound.play('pass');
        else PO.sound.play('tugmiss');
        if (r.leg === R.LEGS - 1) {
          finalT = 0;
          PO.sound.crowd('up'); // 最終走者で歓声を大きく
        }
      }
    }

    // CPU の次の交換で ACTION を押す位置(判定は先に確率で決め、その判定になる位置を選ぶ。判定はプレイヤーと同じ式)
    function planCpu(r) {
      const X = R.EXCHANGES[r.leg];
      let rr = PO.rng.next();
      const t = r.passTable;
      const sign = PO.rng.next() < 0.5 ? -1 : 1;
      if (rr < t.PERFECT) r.cpuPlanAt = X + PO.rng.range(-R.PERFECT_M, R.PERFECT_M) * 0.8;
      else if ((rr -= t.PERFECT) < t.GOOD) r.cpuPlanAt = X + sign * PO.rng.range(R.PERFECT_M + 0.2, R.GOOD_M - 0.2);
      else r.cpuPlanAt = PO.rng.next() < 0.5 ? X - R.ZONE_IN + PO.rng.range(0.2, 1.5) : X + R.ZONE_OUT + 1; // 早すぎる or 押し遅れ(ゾーンの終わりで自動)
    }

    const hooks = {
      init(a) {
        api = a;
        // CPU の速さの順(速い・ふつう・遅い)に、バトン交換のうまさを割り振る
        const cpus = a.runners.filter((r) => !r.isPlayer).sort((p, q) => q.base - p.base);
        a.runners.forEach((r) => {
          r.leg = 0; // いまの走者(0〜3)
          r.passAt = []; // 交換した位置(m)
          r.judges = []; // 交換の判定
          r.visOff = 0;
          r.cpuPlanAt = null;
          r.passTable = r.isPlayer ? null : R.CPU_PASS[cpus.indexOf(r)];
        });
      },
      cpuDist: (r) => r.dist - legStart(r), // 終盤の失速は区間ごと(100m 走と同じ失速を各区間で)
      raceStep(dt, actions) {
        const pl = api.player;
        if (judge) judge.t += dt;
        if (finalT >= 0) finalT += dt;
        // プレイヤーの交換: ゾーンの中で ACTION。ゾーンの外では何も起きない
        if (actions > 0 && !pl.finished && pl.leg < R.LEGS - 1) {
          const X = R.EXCHANGES[pl.leg];
          if (pl.dist >= X - R.ZONE_IN && pl.dist <= X + R.ZONE_OUT) exchange(pl, judgeAt(pl.dist, X));
        }
        // 渡し終えた走者はその場で減速して止まる
        spent.forEach((s) => {
          s.v = Math.max(0, s.v - (P.RUNOUT_DECEL * s.v + P.FRICTION) * dt);
          s.d += s.v * dt;
          const strip = PO.chars.runStrip(s.charId);
          if (strip && s.v > 0.15) s.anim += dt * strip.frames * PO.chars.stripCycles(strip, s.v, 0);
        });
        api.runners.forEach((r) => (r.visOff = Math.max(0, r.visOff - dt * 1.5)));
      },
      afterMove(r) {
        if (r.finished || r.leg >= R.LEGS - 1) return;
        const X = R.EXCHANGES[r.leg];
        if (!r.isPlayer) {
          if (r.cpuPlanAt == null) planCpu(r);
          if (r.dist >= r.cpuPlanAt && r.dist >= X - R.ZONE_IN && r.dist <= X + R.ZONE_OUT) return exchange(r, judgeAt(r.dist, X));
        }
        // 押さずにゾーンを通り過ぎた: 自動で MISS の交換(競技は続けられる)
        if (r.dist > X + R.ZONE_OUT) exchange(r, 'MISS');
      },
      drawLane(ctx, lane, camX) {
        if (lane === api.runners[0].lane) drawZones(ctx, camX); // 地面の交換ゾーン(全レーン分)はいちばん奥の選手より先に
        const r = api.runners.find((o) => o.lane === lane);
        const fy = S.laneFootY(lane);
        const x = (d) => api.worldX({ lane, dist: d }) - camX;
        // 渡し終えた走者
        spent
          .filter((s) => s.lane === lane)
          .forEach((s) => {
            const sx = x(s.d);
            if (sx < -80 || sx > C.W + 80) return;
            if (s.v > 0.15) PO.chars.drawRunStrip(ctx, s.charId, Math.floor(s.anim), sx, fy);
            else PO.chars.drawStripPose(ctx, s.charId, 'stop', sx, fy);
          });
        // 交換地点で待っている次の走者(ゾーンの入り口でスタートの構え。前の走者が来たら少し前を走りながら受け取る)
        for (let k = r.leg + 1; k < R.LEGS; k++) {
          const stand = R.EXCHANGES[k - 1] - R.ZONE_IN;
          const next = k === r.leg + 1;
          const d = next ? Math.max(stand, r.dist + R.LEAD) : stand;
          const sx = x(d);
          if (sx < -80 || sx > C.W + 80) continue;
          if (next && d > stand) PO.chars.drawRunStrip(ctx, r.charId, Math.floor(r.anim + 3), sx, fy);
          else PO.chars.drawStripPose(ctx, r.charId, r.dist > stand - 30 ? 'start' : 'stop', sx, fy);
          // 待っている走者の番号
          if (!next || d === stand) PO.draw.text(ctx, k + 1 + '', sx, fy - 112, { size: 14, color: PO.chars.byId(r.charId).color, align: 'center' });
        }
      },
      // 走っている走者: 共通の描き方(走り・構え・直立・勝敗のポーズ)に、バトンと交換の見た目のずれを足す。
      // ゴールして止まったら、チームの 4 人を並べて勝敗のポーズ
      drawRunner(ctx, r, x, fy) {
        const sx = x + r.visOff * pxm;
        const ph = api.st.phase;
        const done = r.finished && r.v <= 0.15;
        let pose = null;
        if (ph === 'marks' || ph === 'set') pose = 'start';
        else if (done) pose = r.time != null && api.rankOf(r) === 1 ? 'goal' : 'lose';
        else if (r.v <= 0.15) pose = 'stop';
        if (done) {
          for (let k = 3; k >= 1; k--) PO.chars.drawStripPose(ctx, r.charId, pose, sx - k * 44, fy);
        }
        if (pose) PO.chars.drawStripPose(ctx, r.charId, pose, sx, fy);
        else {
          PO.chars.drawRunStrip(ctx, r.charId, Math.floor(r.anim), sx, fy);
          drawBaton(ctx, sx, fy, r);
        }
        return true;
      },
      drawFront(ctx) {
        drawMinimap(ctx);
        drawPassGuide(ctx);
        const my = PO.SCOREBOARD.MSG_Y;
        if (judge && judge.t < R.JUDGE_SHOW) {
          const pop = Math.min(1, judge.t * 10);
          PO.draw.text(ctx, judge.name + (judge.name === 'MISS' ? '...' : '!'), C.W / 2, my + 4 - judge.t * 10, {
            size: Math.round(84 * (0.6 + 0.4 * pop)),
            color: JUDGE_COLOR[judge.name],
            align: 'center',
            italic: true,
            shadow: '#000',
            outline: '#000',
          });
        } else if (finalT >= 0 && finalT < R.FINAL_SHOW) {
          const pop = Math.min(1, finalT * 8);
          PO.draw.text(ctx, 'FINAL RUNNER!', C.W / 2, my, { size: Math.round(72 * (0.6 + 0.4 * pop)), color: '#ff5cc8', align: 'center', italic: true, shadow: '#000', outline: '#000' });
        }
      },
      boardLines,
      runnerSnapshot: (r) => {
        // テスト用: バトンの位置(走りのコマのときだけ)
        const running = api.st.phase !== 'marks' && api.st.phase !== 'set' && r.v > 0.15 && !(r.finished && r.v <= 0.15);
        const sx = api.worldX(r) + r.visOff * pxm;
        return { leg: r.leg, passAt: r.passAt.slice(), judges: r.judges.slice(), cpuPlanAt: r.cpuPlanAt, baton: running ? PO.chars.runHand(r.charId, Math.floor(r.anim), sx, S.laneFootY(r.lane)) : null, animFrame: Math.floor(r.anim) % 8 };
      },
      snapshot: () => ({ judge: judge ? judge.name : null, finalShown: finalT >= 0, spent: spent.length }),
    };

    // ---------- 描画の部品 ----------
    // バトン(赤と白の短い筒)を、走っているコマの手に持たせる。手の位置と角度はコマごとに切り出しのときに調べたもの
    // (PO.chars.runHand。tools/build-run-strips.js の runHands)。走りのコマ以外(構え・直立)では描かない
    function drawBaton(ctx, x, fy, r) {
      paintBaton(ctx, r.charId, Math.floor(r.anim), x, fy);
    }

    // 地面の交換ゾーン: 各レーンに黄色の帯(ゾーン)と、交換地点の白い線・PERFECT の範囲(緑)
    function drawZones(ctx, camX) {
      R.EXCHANGES.forEach((X, i) => {
        for (let lane = 0; lane < 4; lane++) {
          const rect = S.laneRect(lane);
          const xa = api.worldX({ lane, dist: X - R.ZONE_IN }) - camX;
          const xb = api.worldX({ lane, dist: X + R.ZONE_OUT }) - camX;
          if (xb < 0 || xa > C.W) continue;
          const pl = api.player;
          const mine = lane === pl.lane && pl.leg === i;
          ctx.fillStyle = mine && Math.floor(api.st.t * 6) % 2 ? 'rgba(255, 230, 0, 0.5)' : 'rgba(255, 230, 0, 0.28)';
          ctx.fillRect(Math.round(xa), rect.y, Math.round(xb - xa), rect.h);
          const pa = api.worldX({ lane, dist: X - R.PERFECT_M }) - camX;
          const pb = api.worldX({ lane, dist: X + R.PERFECT_M }) - camX;
          ctx.fillStyle = 'rgba(58, 255, 176, 0.35)';
          ctx.fillRect(Math.round(pa), rect.y, Math.round(pb - pa), rect.h);
          const xc = api.worldX({ lane, dist: X }) - camX;
          ctx.fillStyle = '#fff';
          ctx.fillRect(Math.round(xc) - 2, rect.y, 4, rect.h);
          ctx.fillStyle = '#ffe600';
          ctx.fillRect(Math.round(xa), rect.y, 3, rect.h);
          ctx.fillRect(Math.round(xb) - 3, rect.y, 3, rect.h);
        }
        // 地点の距離(トラックの奥の縁の上。手前は 1P の印と重なるため)
        const r0 = S.laneRect(0);
        const xl = api.worldX({ lane: 0, dist: X }) - camX;
        if (xl > -60 && xl < C.W + 60) PO.draw.text(ctx, X + 'm  PASS', xl, r0.y - 12, { size: 16, color: '#ffe600', align: 'center' });
      });
    }

    // 交換が近づいたら出すタイミングのバー(描画はファイル上部の paintPassBar。操作説明のデモでも同じものを使う)
    function drawPassGuide(ctx) {
      const pl = api.player;
      if (pl.finished || pl.leg >= R.LEGS - 1 || api.st.phase !== 'race') return;
      const X = R.EXCHANGES[pl.leg];
      if (pl.dist < X - R.ZONE_IN - R.APPROACH) return;
      const inZone = pl.dist >= X - R.ZONE_IN;
      paintPassBar(ctx, { bx: (C.W - 420) / 2, by: 440, bw: 420 }, X, pl.dist, {
        text: inZone ? 'PASS NOW! (ENTER)' : 'PASS ZONE ' + Math.max(0, Math.ceil(X - R.ZONE_IN - pl.dist)) + 'm',
        color: inZone ? '#3affb0' : '#fff',
      });
    }

    // ミニマップ: 楕円(陸上競技場の形)の 400m トラックに、スタート・ゴール、交換地点 3 か所、4 チームの位置
    const MAP = { x: 736, y: 92, w: 212, h: 122 };
    function trackPoint(u, off) {
      // u: 0〜1(スタートから 1 周)。下の直線の左端をスタートに、反時計回り(画面では右へ進み、右のカーブを上がる)
      const cx = MAP.x + MAP.w / 2;
      const cy = MAP.y + MAP.h / 2 + 8;
      const rad = 34 + off;
      const half = 52; // 直線の半分の長さ(px)
      const straight = half * 2;
      const per = straight * 2 + Math.PI * rad * 2;
      let s = (((u % 1) + 1) % 1) * per;
      if (s < straight) return [cx - half + s, cy + rad];
      s -= straight;
      if (s < Math.PI * rad) {
        const a = Math.PI / 2 - s / rad;
        return [cx + half + Math.cos(a) * rad, cy + Math.sin(a) * rad];
      }
      s -= Math.PI * rad;
      if (s < straight) return [cx + half - s, cy - rad];
      s -= straight;
      const a = -Math.PI / 2 - s / rad;
      return [cx - half + Math.cos(a) * rad, cy + Math.sin(a) * rad];
    }
    function drawMinimap(ctx) {
      PO.draw.panel(ctx, MAP.x, MAP.y, MAP.w, MAP.h, 'rgba(16, 18, 46, 0.88)', '#ffe600');
      PO.draw.text(ctx, '400m', MAP.x + 8, MAP.y + 12, { size: 12, color: '#ffe600', outline: null });
      // トラック(赤茶の帯と内側の芝)
      const ring = (off, color, w) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
          const [x, y] = trackPoint(i / 80, off);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      };
      ring(4, '#c8503c', 14);
      ring(-4, '#3a9a3a', 2);
      // スタート・ゴール(白)と交換地点(黄)
      const tick = (u, color, label) => {
        const [x0, y0] = trackPoint(u, -4);
        const [x1, y1] = trackPoint(u, 12);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        if (label) {
          const [lx, ly] = trackPoint(u, 22);
          PO.draw.text(ctx, label, lx, ly, { size: 10, color, align: 'center', outline: '#000' });
        }
      };
      tick(0, '#ffffff', 'S/G');
      R.EXCHANGES.forEach((X) => tick(X / R.DIST, '#ffe600', null));
      // 4 チーム(レーンで少し外側にずらす)。プレイヤーは大きく、黄色の縁と P
      api.runners
        .slice()
        .sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0))
        .forEach((r) => {
          const [x, y] = trackPoint(Math.min(R.DIST, r.dist) / R.DIST - (r.dist >= R.DIST ? 1e-6 : 0), r.lane * 2.5 - 2);
          const s = r.isPlayer ? 6 : 4;
          ctx.fillStyle = r.isPlayer ? '#ffe600' : '#000';
          ctx.fillRect(Math.round(x) - s - 2, Math.round(y) - s - 2, s * 2 + 4, s * 2 + 4);
          ctx.fillStyle = PO.chars.byId(r.charId).color;
          ctx.fillRect(Math.round(x) - s, Math.round(y) - s, s * 2, s * 2);
          if (r.isPlayer) PO.draw.text(ctx, 'P', x, y + 1, { size: 10, color: '#000', align: 'center', outline: null });
        });
    }

    // 電光掲示板: 競技中 = 経過タイム・プレイヤーの距離と走者(n/4)・4 チームの順位(交換の直後は判定)、
    // 1 位のチームがゴールしたら RESULT と各チームの順位・タイム(ゴールしていないチームは --.--)
    const shortName = (id) => PO.chars.byId(id).name.split(' ')[0];
    const fmtTime = (t) => (t < 10 ? '0' : '') + t.toFixed(2);
    function boardLines() {
      const st = api.st;
      const rs = api.runners.slice().sort((a, b) => api.rankOf(a) - api.rankOf(b));
      if (st.winner) {
        return [{ text: 'RESULT', dot: 3, blink: true }].concat(
          rs.map((r) => ({
            left: api.rankOf(r) + ' ' + (r.isPlayer ? '>' : ' ') + shortName(r.charId),
            right: r.finished ? (r.time == null ? 'DNF' : fmtTime(r.time)) : '--.--',
            dot: 3,
          }))
        );
      }
      const racing = st.phase === 'race' || st.phase === 'finish';
      const pl = api.player;
      const showJudge = judge && judge.t < 2;
      return [
        { left: 'RELAY 400m', right: fmtTime(racing ? st.raceT : 0), dot: 4 },
        { left: 'RUNNER ' + Math.min(R.LEGS, pl.leg + 1) + '/' + R.LEGS, right: Math.floor(Math.min(R.DIST, pl.dist)) + 'm', dot: 3 },
        showJudge ? { left: 'PASS', right: judge.name, dot: 3, blink: judge.name === 'MISS' } : { text: 'POSITION', dot: 3 },
        { text: rs.map((r) => api.rankOf(r) + (r.isPlayer ? '>' : '.') + shortName(r.charId).slice(0, 4)).join(' '), dot: 2 },
      ];
    }

    return PO.trackRace.create(setup, { id: 'relay', title: 'RELAY', P, hooks, noText100m: true });
  }

  PO.events.register({ id: 'relay', create, judgeAt, paintPassBar, paintBaton });
})();
