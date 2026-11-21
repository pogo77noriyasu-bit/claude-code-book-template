// 種目: 玉入れ(BALL TOSS)。プレイヤー 1 人 + CPU 3 人の個人戦。制限時間内にカゴへ入れた玉の数で順位を決める
// 操作: RUN(SPACE / PICK)で地面の玉を拾い、ACTION(ENTER / THROW)で投げる。交互にすばやく押す。
//   同じキーを続けて押す(玉を持っているのに拾う・手が空なのに投げる)と、短い時間(PENALTY)操作できない。
//   長押しは入力の共通部品で 1 回としか数えない
// 玉はプログラムで描く。投げた玉は放物線でカゴへ飛び、カゴに入った瞬間にその色の選手の得点になる
// (外れた玉は地面に落ちて、また拾える)。地面の玉は拾うたびに補充するのでなくならない
// 流れ: intro → ready(READY)→ set(SET)→ play(START!!)→ settle(TIME UP! 飛んでいる玉が落ちきるまで)→ end(順位発表)→ リザルト
// 競技場・電光掲示板・勝敗のポーズ・効果音・リザルトは共通部品を使う
(function () {
  const C = PO.config;
  const S = PO.stadium;
  const I = PO.input;
  const B0 = PO.BALL_TOSS; // R1 の調整値
  const B = B0;
  const SCALE = 1.5; // キャラクターの表示倍率(PO.RUN_ANIM.scale と同じ)

  // ---------- 玉・支柱・カゴの描画(競技と操作説明のデモ js/howto/ で共通に使う) ----------
  function paintBall(ctx, x, y, color, r) {
    r = r || B.BALL_R;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(y), r + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; // ツヤ
    ctx.fillRect(Math.round(x - r * 0.5), Math.round(y - r * 0.6), Math.max(2, Math.round(r * 0.5)), Math.max(2, Math.round(r * 0.4)));
  }
  // 支柱と台(x = 支柱の中心、top = 支柱の上端、baseY = 根元の地面の y)
  function paintPole(ctx, x, top, baseY) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, baseY, 34, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 6, top, 12, baseY - top);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(x - 4, top, 8, baseY - top);
    ctx.fillStyle = '#ff3a46'; // 紅白の帯
    for (let y = top + 10; y < baseY - 10; y += 40) ctx.fillRect(x - 4, y, 8, 20);
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 26, baseY - 10, 52, 12);
    ctx.fillStyle = '#6a6c74';
    ctx.fillRect(x - 24, baseY - 8, 48, 8);
  }
  // カゴ(g = { x, y: 口の高さ, hw: 口の幅の半分, rh: 縁の楕円の高さの半分, d: 網の深さ }): 奥の半分(網の奥・縁の奥)と、手前の半分(網の手前・縁の手前)に分けて描き、入る玉がカゴの中に消えて見えるようにする
  function netPath(ctx, g) {
    ctx.beginPath();
    ctx.moveTo(g.x - g.hw, g.y);
    ctx.quadraticCurveTo(g.x - g.hw + 6, g.y + g.d, g.x, g.y + g.d);
    ctx.quadraticCurveTo(g.x + g.hw - 6, g.y + g.d, g.x + g.hw, g.y);
  }
  function paintBasketBack(ctx, g) {
    ctx.fillStyle = 'rgba(30, 20, 10, 0.55)';
    netPath(ctx, g);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, g.hw, g.rh, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#c9c9c9';
    ctx.stroke();
  }
  function paintBasketFront(ctx, g) {
    // 網(手前): 白い網目
    ctx.save();
    netPath(ctx, g);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    for (let k = -6; k <= 6; k++) {
      ctx.beginPath();
      ctx.moveTo(g.x + k * 10 - 30, g.y);
      ctx.lineTo(g.x + k * 10 + 30, g.y + g.d);
      ctx.moveTo(g.x + k * 10 + 30, g.y);
      ctx.lineTo(g.x + k * 10 - 30, g.y + g.d);
      ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    netPath(ctx, g);
    ctx.stroke();
    // 縁(手前)
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, g.hw, g.rh, 0, 0, Math.PI);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffe600';
    ctx.stroke();
  }

  function create(setup) {
    // いまの ROUND の調整値(PO.difficulty。R1 は元の調整値のまま)。この中ではこれを使う
    const B = PO.difficulty.params('balltoss', B0);
    const rng = PO.rng;
    // CPU の速さ・命中率を 3 人に割り振る(速い・ふつう・遅い)。setup.cpus の並び順(強い順)のまま(2026-11-19 から固定)
    const order = [0, 1, 2];
    const ids = [setup.player].concat(setup.cpus);
    const players = ids.map((charId, i) => {
      const spot = B.SPOTS[i];
      const k = i === 0 ? -1 : order[i - 1];
      return {
        charId,
        color: PO.chars.byId(charId).color,
        isPlayer: i === 0,
        x: spot.x,
        footY: spot.y,
        side: spot.side,
        rate: k < 0 ? 0 : B.CPU_RATES[k], // CPU: 1 秒に投げる回数
        hit: k < 0 ? B.PLAYER_HIT : B.CPU_HITS[k], // カゴに入る確率
        score: 0,
        thrown: 0,
        holding: false,
        anim: null, // { kind: 'pick' | 'throw', t }
        stunT: 0, // 操作ミスで動けない残り時間
        missT: 0, // 「MISS」の表示の残り時間
        fumbles: 0,
        cpuT: 0, // CPU: 次の動作までの残り時間
      };
    });
    const player = players[0];

    const st = {
      phase: 'intro',
      t: 0,
      playT: 0, // START!! からの経過時間
      setDur: 0,
      msg: '',
      msgT: 0,
      done: false,
      countdown: B.COUNTDOWN + 1, // 次に鳴らすカウントダウンの秒(残り時間の切り上げ)
      ranked: false,
    };
    const flying = []; // 飛んでいる玉 { owner, x0, y0, vx, vy, t, hit, endY, landY }
    const ground = []; // 地面の玉 { owner, x, y, popT }

    // ---------- 地面の玉 ----------
    const A = B.GROUND_AREA;
    // 地面のランダムな位置(支柱の根元と、選手の足元のすぐそばは避ける)。
    // owner を渡すと、その選手のまわり(GROUND_NEAR)に寄せる(拾う玉が遠くで消えて見えないように。ほかの色とは混ざる)
    function randomSpot(owner) {
      const near = owner != null && rng.next() < B.GROUND_NEAR.share ? players[owner] : null;
      for (let n = 0; n < 30; n++) {
        const x = near ? Math.max(A.x0, Math.min(A.x1, near.x + rng.range(-B.GROUND_NEAR.dx, B.GROUND_NEAR.dx))) : rng.range(A.x0, A.x1);
        const y = near ? Math.max(A.y0, Math.min(A.y1, near.footY + rng.range(-B.GROUND_NEAR.dy, B.GROUND_NEAR.dy))) : rng.range(A.y0, A.y1);
        if (Math.abs(x - B.BASKET_X) < 40 && Math.abs(y - B.POLE_BASE_Y) < 24) continue;
        if (players.some((p) => Math.abs(x - p.x) < 30 && Math.abs(y - p.footY) < 10)) continue;
        return { x, y };
      }
      return { x: rng.range(A.x0, A.x1), y: rng.range(A.y0, A.y1) };
    }
    function addGround(owner, pos, popT) {
      if (ground.length >= B.GROUND_MAX) return;
      const p = pos || randomSpot(owner);
      ground.push({ owner, x: p.x, y: p.y, popT: popT || 0 });
    }
    players.forEach((p, i) => {
      for (let n = 0; n < B.GROUND_START; n++) addGround(i);
    });
    // 拾う: 足元にいちばん近い自分の色の玉を取る。自分の色が少なくなったら 1 個補充する(地面の玉はなくならない)
    function takeGround(i) {
      const p = players[i];
      const handX = p.x - p.side * 20; // 拾うコマの手は体の前(右向きなら右)
      let best = -1;
      let bd = Infinity;
      ground.forEach((g, k) => {
        if (g.owner !== i) return;
        const d = Math.hypot(g.x - handX, (g.y - p.footY) * 2);
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      if (best >= 0) ground.splice(best, 1);
      if (ground.filter((g) => g.owner === i).length < B.GROUND_MIN) addGround(i, null, 0.35);
    }

    // ---------- 動作 ----------
    function setPhase(p, msg) {
      st.phase = p;
      st.t = 0;
      if (msg !== undefined) {
        st.msg = msg;
        st.msgT = 0;
      }
    }
    function pick(i) {
      const p = players[i];
      p.holding = true;
      p.anim = { kind: 'pick', t: 0 };
      takeGround(i);
      if (p.isPlayer) PO.sound.play('pick');
    }
    // 投げる: 玉を放す位置から、カゴの口(入る玉)か口の横(外れる玉)へ FLIGHT 秒で届く放物線
    function toss(i) {
      const p = players[i];
      p.holding = false;
      p.thrown++;
      p.anim = { kind: 'throw', t: 0 };
      const r = PO.chars.throwRelease(p.charId);
      const x0 = p.x - p.side * r.dx;
      const y0 = p.footY - r.dy;
      const hit = rng.next() < p.hit;
      const half = B.BASKET_W / 2;
      // 入る玉は口の中(縁から少し内側)、外れる玉は口の外側の左右どちらか
      const tx = hit ? B.BASKET_X + rng.range(-half + 12, half - 12) : B.BASKET_X + (rng.next() < 0.5 ? -1 : 1) * rng.range(half + 4, half + 34);
      const ty = B.BASKET_Y + (hit ? 0 : rng.range(-6, 10));
      const T = B.FLIGHT * rng.range(0.92, 1.08);
      const vx = (tx - x0) / T;
      const vy = (ty - y0 - 0.5 * B.GRAVITY * T * T) / T;
      flying.push({ owner: i, x0, y0, vx, vy, t: 0, T, hit, landY: rng.range(A.y0 + 40, A.y1) });
      if (p.isPlayer) PO.sound.play('toss');
    }
    function fumble(p) {
      p.stunT = B.PENALTY;
      p.missT = 0.6;
      p.fumbles++;
      if (p.isPlayer) PO.sound.play('fumble');
    }
    // CPU の次の動作までの時間(1 回の拾う・投げるで、1 投の半分ずつ。ゆらぎあり)
    function cpuDelay(p) {
      const per = 1 / (2 * Math.min(B.CPU_RATE_CAP || Infinity, p.rate * B.CPU_SPEED_SCALE)); // 1 秒に投げる回数の上限 CPU_RATE_CAP(ROUND が進んだとき)
      return per * rng.range(1 - B.CPU_JITTER, 1 + B.CPU_JITTER);
    }

    // プレイヤーの入力: 手が空なら RUN = 拾う、玉を持っていれば ACTION = 投げる。逆のキーは操作ミス
    function playerInput() {
      let run = I.consume('run');
      let act = I.consume('action');
      if (player.stunT > 0) return; // 動けない間の入力は捨てる(ペナルティは重ねない)
      // 同じステップに両方押された場合は、いまの状態に合うほうから順に処理する
      let guard = 4;
      while ((run > 0 || act > 0) && guard-- > 0 && player.stunT <= 0) {
        if (!player.holding) {
          if (run > 0) {
            run--;
            pick(0);
          } else {
            act--;
            fumble(player);
          }
        } else if (act > 0) {
          act--;
          toss(0);
        } else {
          run--;
          fumble(player);
        }
      }
    }

    function updatePlayers(dt, active) {
      players.forEach((p, i) => {
        p.stunT = Math.max(0, p.stunT - dt);
        p.missT = Math.max(0, p.missT - dt);
        if (p.anim) {
          p.anim.t += dt;
          if (p.anim.t >= (p.anim.kind === 'pick' ? B.PICK_SHOW : B.THROW_SHOW)) p.anim = null;
        }
        if (!active || p.isPlayer) return;
        p.cpuT -= dt;
        if (p.cpuT <= 0) {
          if (p.holding) toss(i);
          else pick(i);
          p.cpuT += cpuDelay(p);
        }
      });
    }

    function updateBalls(dt) {
      for (let k = flying.length - 1; k >= 0; k--) {
        const b = flying[k];
        b.t += dt;
        if (b.hit && b.t >= b.T) {
          // カゴに入った瞬間に得点
          flying.splice(k, 1);
          const p = players[b.owner];
          p.score++;
          PO.sound.play(p.isPlayer ? 'basket' : 'basketcpu');
          basketBounce = 0.12;
          continue;
        }
        // 外れた玉: 地面まで落ちたら地面の玉になる
        if (!b.hit && b.t > b.T && ballY(b) >= b.landY) {
          flying.splice(k, 1);
          addGround(b.owner, { x: Math.max(A.x0, Math.min(A.x1, ballX(b))), y: b.landY });
        }
      }
      ground.forEach((g) => (g.popT = Math.max(0, g.popT - dt)));
    }
    const ballX = (b) => b.x0 + b.vx * b.t;
    const ballY = (b) => b.y0 + b.vy * b.t + 0.5 * B.GRAVITY * b.t * b.t;
    let basketBounce = 0; // 玉が入ったときにカゴを少し揺らす(秒)

    // 順位(同点は同じ順位)
    function rankOf(p) {
      return 1 + players.filter((q) => q.score > p.score).length;
    }

    function update(dt) {
      st.t += dt;
      st.msgT += dt;
      basketBounce = Math.max(0, basketBounce - dt);
      switch (st.phase) {
        case 'intro':
        case 'ready':
        case 'set':
          // スタート前の入力は数えない
          I.consume('action');
          I.consume('run');
          updatePlayers(dt, false);
          if (st.phase === 'intro' && st.t >= B.INTRO) {
            PO.sound.play('ready');
            setPhase('ready', 'READY');
          } else if (st.phase === 'ready' && st.t >= B.READY) {
            st.setDur = rng.range(B.SET_MIN, B.SET_MAX);
            PO.sound.play('ready');
            setPhase('set', 'SET');
          } else if (st.phase === 'set' && st.t >= st.setDur) {
            PO.sound.play('start');
            PO.sound.crowd('start');
            players.forEach((p) => (p.cpuT = rng.range(B.CPU_START[0], B.CPU_START[1])));
            setPhase('play', 'START!!');
          }
          break;
        case 'play': {
          st.playT += dt;
          playerInput();
          updatePlayers(dt, true);
          updateBalls(dt);
          const left = B.TIME_LIMIT - st.playT;
          // 残り 5 秒からカウントダウン(5・4・3・2・1)。5 秒で歓声を大きくする
          if (left > 0 && Math.ceil(left) < st.countdown && Math.ceil(left) <= B.COUNTDOWN) {
            st.countdown = Math.ceil(left);
            PO.sound.play('count');
            if (st.countdown === B.COUNTDOWN) PO.sound.crowd('up');
          }
          if (left <= 0) {
            st.playT = B.TIME_LIMIT;
            PO.sound.play('finish'); // 終了のピストル
            setPhase('settle', 'TIME UP!');
          }
          break;
        }
        case 'settle':
          // 新しい操作は受け付けない。飛んでいる玉が落ちきる(カゴに入る)まで待つ
          I.consume('action');
          I.consume('run');
          updatePlayers(dt, false);
          updateBalls(dt);
          if ((!flying.length && st.t >= 0.6) || st.t >= B.SETTLE_MAX) {
            flying.length = 0;
            st.ranked = true;
            const win = rankOf(player) === 1;
            PO.sound.play(win ? 'victory' : 'defeat');
            PO.sound.crowd('fade');
            setPhase('end', win ? 'YOU WIN!' : 'YOU LOSE...');
          }
          break;
        case 'end':
          I.consume('action');
          I.consume('run');
          updatePlayers(dt, false);
          if (st.t >= B.END_WAIT) st.done = true;
          break;
      }
    }

    // ---------- ポーズ ----------
    // 'pick' / 'hold' / 'throw' / 'idle'(待機 = 停止時の直立)/ 'goal'(1 位)/ 'lose'
    function poseOf(p) {
      if (st.ranked) return rankOf(p) === 1 ? 'goal' : 'lose';
      if (p.anim) return p.anim.kind;
      return p.holding ? 'hold' : 'idle';
    }
    const FRAME = { pick: 0, hold: 1, throw: 2 };
    function drawPlayer(ctx, p) {
      const pose = poseOf(p);
      // 操作ミスの間は小刻みに震える
      const shake = p.stunT > 0 ? Math.round(Math.sin(st.t * 80) * 3) : 0;
      const flip = p.side > 0;
      if (FRAME[pose] != null) PO.chars.drawThrow(ctx, p.charId, FRAME[pose], p.x + shake, p.footY, flip);
      else PO.chars.drawStripPoseFlip(ctx, p.charId, pose === 'idle' ? 'stop' : pose, p.x, p.footY, flip);
      if (p.missT > 0) PO.draw.text(ctx, 'MISS!', p.x, p.footY - 130 - (0.6 - p.missT) * 20, { size: 22, color: '#ff6a6a', align: 'center', italic: true });
    }

    // ---------- 描画 ----------
    const drawBall = paintBall; // 玉・支柱・カゴの描画はファイル上部(操作説明のデモでも使う)
    function drawGroundBall(ctx, g) {
      const s = g.popT > 0 ? 1 - g.popT / 0.35 : 1; // 補充された玉はふくらんで出てくる
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(Math.round(g.x - B.BALL_R), Math.round(g.y), B.BALL_R * 2, 2);
      drawBall(ctx, g.x, g.y - B.BALL_R * s, players[g.owner].color, Math.max(1, B.BALL_R * s));
    }
    function drawPole(ctx) {
      paintPole(ctx, B.BASKET_X, B.BASKET_Y + B.BASKET_DEPTH - 6, B.POLE_BASE_Y);
    }
    function basketGeom() {
      const sway = basketBounce > 0 ? Math.sin(basketBounce * 60) * 2 : 0;
      return { x: B.BASKET_X + sway, y: B.BASKET_Y, hw: B.BASKET_W / 2, rh: 8, d: B.BASKET_DEPTH };
    }
    const drawBasketBack = (ctx) => paintBasketBack(ctx, basketGeom());
    const drawBasketFront = (ctx) => paintBasketFront(ctx, basketGeom());

    function render(ctx) {
      S.draw(ctx, 0, { lines: [], text100m: null });
      // 地面の玉・選手・支柱を奥から順に(足元の y の小さい順)
      const items = ground.map((g) => ({ y: g.y, draw: () => drawGroundBall(ctx, g) }));
      players.forEach((p) => items.push({ y: p.footY, draw: () => drawPlayer(ctx, p) }));
      items.push({ y: B.POLE_BASE_Y, draw: () => drawPole(ctx) });
      items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());
      // カゴ(奥)→ 飛んでいる玉 → カゴ(手前)
      drawBasketBack(ctx);
      flying.forEach((b) => drawBall(ctx, ballX(b), ballY(b), players[b.owner].color));
      drawBasketFront(ctx);
      // 1P の印(足元の下)
      const px = player.x;
      const fy = player.footY;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(px, fy + 4);
      ctx.lineTo(px + 14, fy + 20);
      ctx.lineTo(px - 14, fy + 20);
      ctx.fill();
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.moveTo(px, fy + 8);
      ctx.lineTo(px + 9, fy + 18);
      ctx.lineTo(px - 9, fy + 18);
      ctx.fill();
      PO.draw.text(ctx, '1P', px, fy + 36, { size: 22, color: '#ffe600', align: 'center' });
      // 入場〜スタートまでは名前
      if (st.phase === 'intro' || st.phase === 'ready' || st.phase === 'set') {
        players.forEach((p) => {
          const ch = PO.chars.byId(p.charId);
          PO.draw.text(ctx, ch.name, p.x, p.footY - 122, { size: 13, color: ch.color, align: 'center' });
        });
      }
      drawHud(ctx);
      const bt = st.ranked ? st.t : 0;
      PO.scoreboard.draw(ctx, BOARD_L, boardLeft(), bt);
      PO.scoreboard.draw(ctx, BOARD_R, boardRight(), bt);
      // 操作の案内(競技中、最初の数秒)
      if (st.phase === 'play' && st.playT < 4) {
        PO.draw.text(ctx, 'SPACE: PICK  /  ENTER: THROW', C.W / 2, 430, { size: 18, color: '#fff', align: 'center' });
      }
      // 合図の文字
      const my = PO.SCOREBOARD.MSG_Y;
      const show = st.msg && !(st.msg === 'START!!' && st.msgT > 0.8);
      if (show) {
        const big = st.msg === 'START!!' ? 90 : 60;
        const pop = Math.min(1, st.msgT * 8);
        const color = st.msg === 'START!!' ? '#7dff5a' : st.msg === 'YOU LOSE...' ? '#9fd0ff' : '#ffe600';
        PO.draw.text(ctx, st.msg, C.W / 2, my, { size: Math.round(big * (0.6 + 0.4 * pop)), color, align: 'center', italic: true, shadow: '#ff2fa8', outline: '#000' });
      }
      // 残り 5 秒のカウントダウンの数字
      if (st.phase === 'play') {
        const left = B.TIME_LIMIT - st.playT;
        if (left <= B.COUNTDOWN) {
          const n = Math.ceil(left);
          const f = n - left; // 0→1(数字が変わるたびに大きく出る)
          PO.draw.text(ctx, String(n), C.W / 2, 180, { size: Math.round(90 - f * 30), color: '#ff5cc8', align: 'center', outline: '#000', shadow: '#000' });
        }
      }
    }

    // 電光掲示板(左右 2 枚。中央のカゴにかからないように小さくして両側に置く)
    // 左 = 種目名と残り時間、右 = 4 人の得点(順位発表のあとも)。順位発表のあとは 左 = WINNER と名前
    const BOARD_L = { x: 14, y: 90, w: 214, h: 160 };
    const BOARD_R = { x: C.W - 14 - 214, y: 90, w: 214, h: 160 };
    const shortName = (id) => PO.chars.byId(id).name.split(' ')[0];
    const pad3 = (n) => String(n).padStart(3, '0');
    const timeLeft = () => (st.phase === 'play' ? Math.max(0, B.TIME_LIMIT - st.playT) : st.phase === 'intro' || st.phase === 'ready' || st.phase === 'set' ? B.TIME_LIMIT : 0);
    const fmtTime = (t) => (t < 10 ? '0' : '') + t.toFixed(2);
    function winners() {
      const top = Math.max(...players.map((p) => p.score));
      return players.filter((p) => p.score === top);
    }
    function boardLeft() {
      if (st.ranked) {
        const w = winners();
        return [
          { text: 'WINNER !!', dot: 3, blink: true },
          { text: w.length > 1 ? 'DRAW' : shortName(w[0].charId), dot: 3 },
          { text: w.length > 1 ? w.length + ' PLAYERS' : '1st PLACE', dot: 2 },
        ];
      }
      return [
        { text: 'BALL TOSS', dot: 3 },
        { text: 'TIME', dot: 2 },
        { text: fmtTime(timeLeft()), dot: 5 },
      ];
    }
    // 右の掲示板: 4 人全員の得点(多い順。同点は最初の並び)。左端のランプ = 玉の色、プレイヤーは名前の前に「>」
    function boardRight() {
      const rows = players
        .map((p, i) => ({ p, i }))
        .sort((a, b) => b.p.score - a.p.score || a.i - b.i)
        .map(({ p }) => ({ left: (p.isPlayer ? '>' : ' ') + shortName(p.charId), right: pad3(p.score), dot: 2, lamp: p.color }));
      return [{ text: 'SCORE', dot: 3 }].concat(rows);
    }

    // HUD: 残り時間と 4 人の得点(玉の色・名前・得点)
    function drawHud(ctx) {
      ctx.fillStyle = '#10122e';
      ctx.fillRect(0, 0, C.W, C.HUD_H);
      ctx.fillStyle = '#ff2fa8';
      ctx.fillRect(0, C.HUD_H - 4, C.W, 4);
      const left = timeLeft();
      PO.draw.text(ctx, 'TIME', 14, 24, { size: 16, color: '#ffe600', outline: null });
      PO.draw.text(ctx, left.toFixed(1), 14, 54, { size: 30, color: left <= B.COUNTDOWN && st.phase === 'play' ? '#ff5cc8' : '#fff' });
      const best = PO.records.get('balltoss');
      PO.draw.text(ctx, 'BEST ' + (best ? best.value : '--'), 14, 72, { size: 12, color: '#aaa', outline: null });
      players.forEach((p, i) => {
        const x = 132 + i * 207;
        const ch = PO.chars.byId(p.charId);
        PO.draw.panel(ctx, x, 8, 198, 62, p.isPlayer ? '#4a3a10' : '#1d2160', p.isPlayer ? '#ffe600' : ch.color);
        drawBall(ctx, x + 22, 39, p.color, 9);
        PO.draw.text(ctx, shortName(p.charId), x + 40, 26, { size: 14, color: ch.color, outline: null });
        PO.draw.text(ctx, p.isPlayer ? 'YOU' : 'CPU', x + 40, 54, { size: 13, color: p.isPlayer ? '#ffe600' : '#aaa', outline: null });
        PO.draw.text(ctx, String(p.score), x + 188, 42, { size: 32, color: '#fff', align: 'right' });
      });
    }

    // リザルト: 得点の多い順(同点は同じ順位)。記録 = 得点
    function result() {
      const order = players.slice().sort((a, b) => b.score - a.score || (a.isPlayer ? -1 : b.isPlayer ? 1 : 0));
      return {
        entries: order.map((p) => ({ charId: p.charId, isPlayer: p.isPlayer, value: p.score, rank: rankOf(p) })),
        playerValue: player.score,
      };
    }

    function snapshot() {
      return {
        phase: st.phase,
        t: st.t,
        playT: st.playT,
        timeLeft: timeLeft(),
        msg: st.msg,
        done: st.done,
        ranked: st.ranked,
        flying: flying.length,
        ground: ground.length,
        groundByOwner: players.map((p, i) => ground.filter((g) => g.owner === i).length),
        board: { left: boardLeft().map((l) => l.text), right: boardRight().map((l) => (l.text != null ? l.text : l.left + ' ' + l.right)) },
        players: players.map((p) => ({
          charId: p.charId,
          isPlayer: p.isPlayer,
          score: p.score,
          thrown: p.thrown,
          holding: p.holding,
          stun: p.stunT > 0,
          fumbles: p.fumbles,
          rate: p.rate,
          hit: p.hit,
          pose: poseOf(p),
          rank: rankOf(p),
          x: p.x,
          footY: p.footY,
        })),
      };
    }

    return {
      update,
      render,
      result,
      snapshot,
      get done() {
        return st.done;
      },
    };
  }

  PO.events.register({ id: 'balltoss', create, paintBall, paintPole, paintBasketBack, paintBasketFront });
})();
