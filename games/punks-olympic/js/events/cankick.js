// 種目: 缶蹴り(CAN KICK)。プレイヤー 1 人 + CPU 3 人が 1 人ずつ順番に、空き缶を蹴って飛距離を競う
// - 試技の順番は最初にランダムで決め、3 回とも同じ順番。1 人 3 回、合計 12 回。3 回のうちいちばん遠い飛距離で順位
// - 操作: RUN(SPACE)連打で助走 → キックラインの手前で ACTION(ENTER / KICK)を押すと助走が終わる →
//   押している間だけ蹴り上げる角度が上がる → 離した瞬間に蹴る。キックラインを越えてから押すと FOUL
// - 飛距離 = 助走の速さ・ラインまでの近さ・角度で決まる(式は config.js の PO.CAN_KICK)。
//   キックラインから、缶が最初に地面に着いた位置まで。そのあとのバウンド・転がりは演出だけ
// - 3 回とも FOUL なら記録なし
// 流れ: intro → (ready → run → aim → kick → flight → show | foul)× 12 → end(順位発表)→ リザルト
// 競技場・電光掲示板・ポーズ・効果音・リザルトは共通部品を使う。缶・目盛りはプログラムで描く
(function () {
  const C = PO.config;
  const S = PO.stadium;
  const I = PO.input;
  const K0 = PO.CAN_KICK; // R1 の調整値
  const K = K0;
  const pxm = C.PX_PER_M;
  const LANE = 3; // 試技はいちばん手前のレーン
  const round2 = (v) => Math.round(v * 100) / 100;
  const DEG = Math.PI / 180;

  // 飛距離の式(テストからも使う)。v: 助走の速さ(m/s)、gap: キックラインまでの距離(m)、angle: 度
  function distanceOf(v, gap, angle) {
    const lineF = Math.max(K.LINE_MIN, 1 - Math.max(0, gap) / K.LINE_FALLOFF);
    return Math.max(0, K.DIST_K * v * v * Math.sin(2 * angle * DEG) * lineF);
  }

  // 缶(赤と銀)を中心 (x, y)・回転 rot で描く。競技と操作説明のデモ(js/howto/)で共通に使う
  function paintCan(ctx, x, y, rot) {
    const w = K.CAN_W;
    const h = K.CAN_H;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(rot);
    ctx.fillStyle = '#000';
    ctx.fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
    ctx.fillStyle = '#d8dde4'; // 銀色のふた・底
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#e8202e'; // 赤い胴
    ctx.fillRect(-w / 2, -h / 2 + 3, w, h - 6);
    ctx.fillStyle = '#fff'; // 白い帯と光
    ctx.fillRect(-w / 2, -1, w, 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(-w / 2 + 2, -h / 2 + 3, 2, h - 6);
    ctx.restore();
  }
  // 角度のメーター: 4 分の 1 の円に 45 度の目安(緑)と、角度 angle(度)の針、数字。(x, y) は円の中心。
  // 競技と操作説明のデモ(js/howto/)で共通に使う
  function paintAngleGauge(ctx, x, y, angle) {
    const R = 54;
    ctx.fillStyle = 'rgba(10, 12, 40, 0.75)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, R + 6, -Math.PI / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3affb0';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x, y, R - 4, -50 * DEG, -40 * DEG);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, R, -Math.PI / 2, 0);
    ctx.stroke();
    const an = angle * DEG;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(an) * R, y - Math.sin(an) * R);
    ctx.stroke();
    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 3;
    ctx.stroke();
    PO.draw.text(ctx, Math.round(angle) + '°', x + 8, y + 18, { size: 22, color: '#ffe600' });
  }

  function create(setup) {
    // いまの ROUND の調整値(PO.difficulty。R1 は元の調整値のまま)。この中ではこれを使う
    const K = PO.difficulty.params('cankick', K0);
    const rng = PO.rng;
    const levels = [0, 1, 2]; // CPU の強さ(0 = 強い)を 3 人に割り振る。setup.cpus の並び順(強い順)のまま(2026-11-19 から固定)
    const athletes = [setup.player].concat(setup.cpus).map((charId, i) => {
      const lv = i === 0 ? -1 : levels[i - 1];
      const band = lv >= 0 ? K.CPU_SPEEDS[lv] : null;
      return {
        charId,
        isPlayer: i === 0,
        level: lv,
        speed: band ? Math.min(K.CPU_SPEED_CAP || Infinity, rng.range(band[0], band[1]) * K.CPU_SPEED_SCALE) : 0, // CPU の助走の速さ(上限 CPU_SPEED_CAP)
        tries: [], // 試技ごとの飛距離(m)。FOUL は null
        best: null,
      };
    });
    const player = athletes[0];
    const order = rng.shuffle(athletes.slice()); // 試技の順番(3 回とも同じ)

    const st = {
      phase: 'intro',
      t: 0,
      turn: -1, // 何回目の試技か(0〜11)
      msg: '',
      msgT: 0,
      done: false,
      cam: 0,
      // いまの試技
      dist: 0, // 助走の距離(スタートから m)
      v: 0,
      anim: 0,
      runT: 0,
      started: false, // 助走を始めたか(CPU は反応時間のあと)
      pressD: 0, // ACTION を押した位置
      pressV: 0, // ACTION を押したときの速さ
      angle: 0,
      holdT: 0,
      maxT: 0, // 角度が最大になってからの時間
      kickD: null, // 今回の飛距離
      foulWhy: '',
      cpuPlan: null,
      newBest: false, // 今回の飛距離が全員の中で一番(歓声)
      leaderBefore: null,
      cheerT: 0, // 大きい歓声を元に戻すまでの時間
    };
    const can = { x: 0, y: 0, rot: 0, path: null, t: 0, landed: false, rest: true };

    const cur = () => order[st.turn % order.length];
    const tryNo = () => Math.floor(st.turn / order.length) + 1; // 1〜3
    // ワールド座標の x(レーン 3)。距離はスタートからの m
    const wx = (d) => S.laneLineX(C.START_X, LANE) + d * pxm;
    const lineX0 = C.START_X + K.RUNUP * pxm; // キックライン(レーン 0 の x。斜めの白線の位置)
    const canHome = () => K.RUNUP + K.CAN_OFFSET;
    const footY = S.laneFootY(LANE);

    function setPhase(p, msg) {
      st.phase = p;
      st.t = 0;
      if (msg !== undefined) {
        st.msg = msg;
        st.msgT = 0;
      }
    }

    // 次の試技の準備
    function nextTurn() {
      st.turn++;
      if (st.turn >= order.length * K.TRIES) return finishAll();
      const a = cur();
      st.dist = 0;
      st.v = 0;
      st.anim = 0;
      st.runT = 0;
      st.started = false;
      st.angle = K.ANGLE_MIN;
      st.holdT = 0;
      st.maxT = 0;
      st.kickD = null;
      st.newBest = false;
      st.cam = 0;
      can.path = null;
      can.landed = false;
      can.rest = true;
      can.rot = 0;
      can.x = wx(canHome());
      can.y = 0;
      // CPU の今回の作戦: 走り出すまでの時間・ACTION を押す位置(FOUL の回はラインの先)・角度
      if (!a.isPlayer) {
        const lv = a.level;
        const foul = rng.next() < K.CPU_FOUL[lv];
        st.cpuPlan = {
          react: rng.range(K.CPU_REACT[0], K.CPU_REACT[1]),
          pressAt: foul ? K.RUNUP + rng.range(0.1, 0.5) : K.RUNUP - rng.range(K.CPU_GAP[lv][0], K.CPU_GAP[lv][1]),
          angle: Math.max(K.ANGLE_MIN + 2, Math.min(K.ANGLE_MAX - 2, 45 + rng.range(-K.CPU_ANGLE_ERR[lv], K.CPU_ANGLE_ERR[lv]))),
          ph: rng.range(0, Math.PI * 2),
        };
      } else st.cpuPlan = null;
      PO.sound.play('ready');
      setPhase('ready', PO.chars.byId(a.charId).name + '  ' + tryNo() + '/' + K.TRIES);
    }

    function foul(why) {
      st.foulWhy = why;
      cur().tries.push(null);
      PO.sound.play('foul');
      setPhase('foul', 'FOUL!');
    }

    // 蹴る: 飛距離を決め、缶の飛ぶ道すじ(最初の着地 → バウンド → 転がり)を作る
    function kick() {
      const a = cur();
      const gap = K.RUNUP - st.pressD;
      const d = round2(distanceOf(st.pressV, gap, st.angle));
      st.kickD = d;
      const T = K.FLIGHT_BASE + K.FLIGHT_K * Math.sin(st.angle * DEG) * Math.min(1, d / 30);
      const peak = Math.min(K.HEIGHT_MAX, ((d * Math.tan(st.angle * DEG)) / 4) * pxm * K.HEIGHT_K);
      // 区間: [開始の距離, 終わりの距離, 時間, 高さ]。最初の区間の終わり = 飛距離(キックラインから)
      const segs = [];
      const start = canHome();
      const land = K.RUNUP + d;
      segs.push({ d0: start, d1: Math.max(start, land), T, h: peak, first: true });
      let pos = Math.max(start, land);
      K.BOUNCES.forEach(([hr, dr]) => {
        const len = Math.max(K.BOUNCE_MIN, d * dr);
        const h = peak * hr;
        segs.push({ d0: pos, d1: pos + len, T: Math.max(0.12, Math.sqrt(h / 1200) * 2), h });
        pos += len;
      });
      can.path = { segs, i: 0, t: 0, roll: { d0: pos, d1: pos + K.ROLL, T: K.ROLL_T } };
      can.rest = false;
      PO.sound.play('cankick');
      setPhase('kick');
    }

    function updateCan(dt) {
      const P = can.path;
      if (!P || can.rest) return;
      P.t += dt;
      if (P.i < P.segs.length) {
        const g = P.segs[P.i];
        const u = Math.min(1, P.t / g.T);
        can.x = wx(g.d0 + (g.d1 - g.d0) * u);
        can.y = 4 * g.h * u * (1 - u);
        can.rot += K.SPIN * dt * (g.first ? 1 : 0.7);
        if (u >= 1) {
          if (g.first) {
            // 最初の着地: ここで飛距離が決まる(記録に入れるのもここ。飛んでいる間は表示に出さない)
            can.landed = true;
            const a = cur();
            const d = st.kickD;
            st.leaderBefore = Math.max(0, ...athletes.map(bestKey)); // これまでの全員の最高記録
            st.newBest = d > 0 && d > st.leaderBefore;
            a.tries.push(d);
            if (a.best == null || d > a.best) a.best = d;
            PO.sound.play('canland');
            if (st.newBest) {
              // 全員の中でいちばん遠くへ飛んだ: 歓声を一段大きく(しばらくしたら元へ)
              PO.sound.crowd('up');
              st.cheerT = 1.8;
            }
          } else PO.sound.play('canbounce');
          P.i++;
          P.t = 0;
          if (P.i === P.segs.length) PO.sound.play('canroll');
        }
      } else {
        const r = P.roll;
        const u = Math.min(1, P.t / r.T);
        const e = 1 - (1 - u) * (1 - u); // だんだん遅く
        can.x = wx(r.d0 + (r.d1 - r.d0) * e);
        can.y = 0;
        can.rot += K.SPIN * 0.5 * dt * (1 - u);
        if (u >= 1) {
          can.rest = true;
          can.rot = Math.PI / 2; // 横倒しで止まる
        }
      }
    }

    // プレイヤー・CPU の助走(速さの計算と走りのコマ・足音)
    function runStep(dt, a) {
      if (a.isPlayer) {
        const taps = I.consume('run');
        if (taps > 0) st.started = true;
        st.v = Math.min(K.VMAX, st.v + taps * K.TAP_BOOST);
        st.v -= (K.DRAG * st.v + K.FRICTION) * dt;
      } else {
        I.consume('run');
        if (st.runT >= st.cpuPlan.react) {
          st.started = true;
          const target = a.speed * (1 + 0.02 * Math.sin(st.runT * 2.3 + st.cpuPlan.ph));
          st.v += Math.max(-4, Math.min(K.CPU_ACCEL_MAX, (target - st.v) * K.CPU_ACCEL_K * 2)) * dt;
        }
      }
      st.v = Math.max(0, st.v);
      st.dist += st.v * dt;
      animRun(dt, st.v);
    }
    function animRun(dt, v) {
      const a = cur();
      const strip = PO.chars.runStrip(a.charId);
      if (v <= 0.15 || !strip) return;
      const before = Math.floor(st.anim);
      st.anim += dt * strip.frames * PO.chars.stripCycles(strip, v, 0);
      const after = Math.floor(st.anim);
      // 助走中のブーツの足音(試技は 1 人ずつなので、CPU の助走でも鳴らす)
      if (after !== before && strip.stepFrames.includes(after % strip.frames)) PO.sound.play('step');
    }

    function finishAll() {
      st.cam = 0;
      PO.sound.crowd('fade');
      const top = rankOf(player) === 1 && player.best != null;
      PO.sound.play(top ? 'victory' : 'defeat');
      setPhase('end', top ? 'YOU WIN!' : 'YOU LOSE...');
    }

    // 順位: いちばん遠い飛距離の順(同じ距離は同じ順位)。記録なしは最後
    const bestKey = (a) => (a.best == null ? -1 : a.best);
    function rankOf(a) {
      return 1 + athletes.filter((o) => bestKey(o) > bestKey(a)).length;
    }

    function update(dt) {
      st.t += dt;
      st.msgT += dt;
      if (st.cheerT > 0) {
        st.cheerT -= dt;
        if (st.cheerT <= 0) PO.sound.crowd('start'); // 大きい歓声から元の大きさへ
      }
      const a = st.turn >= 0 && st.turn < order.length * K.TRIES ? cur() : null;
      switch (st.phase) {
        case 'intro':
          I.consume('run');
          I.consume('action');
          if (st.t >= K.INTRO) {
            PO.sound.crowd('start');
            nextTurn();
          }
          break;
        case 'ready':
          // 準備の間の入力は数えない
          I.consume('run');
          I.consume('action');
          if (st.t >= (a.isPlayer ? K.READY_PLAYER : K.READY_CPU)) setPhase('run', a.isPlayer ? 'RUN!' : '');
          break;
        case 'run': {
          st.runT += dt;
          // ACTION は、押したときにいた位置で判定する(このステップで進む前)
          const press = a.isPlayer ? I.consume('action') > 0 : st.dist >= st.cpuPlan.pressAt;
          if (!a.isPlayer) I.consume('action');
          if (!press) runStep(dt, a);
          if (press) {
            if (st.dist > K.RUNUP) foul('LINE');
            else {
              st.pressD = st.dist;
              st.pressV = st.v;
              st.angle = K.ANGLE_MIN;
              st.holdT = 0;
              setPhase('aim', '');
            }
          } else if (st.dist > K.RUNUP + K.CAN_OFFSET) foul('LINE'); // 蹴らずにキックラインを越えた
          else if (st.runT >= K.RUN_TIMEOUT) foul('TIME');
          break;
        }
        case 'aim': {
          // 助走を止める(キックラインは越えない)
          st.v = Math.max(0, st.v - K.AIM_DECEL * dt);
          st.dist = Math.min(K.RUNUP, st.dist + st.v * dt);
          I.consume('run');
          I.consume('action');
          st.holdT += dt;
          st.angle = Math.min(K.ANGLE_MAX, K.ANGLE_MIN + K.ANGLE_SPEED * st.holdT);
          if (st.angle >= K.ANGLE_MAX) st.maxT += dt;
          const holding = a.isPlayer ? I.isDown('action') : st.angle < st.cpuPlan.angle;
          if (!holding || st.maxT >= K.AUTO_KICK) kick();
          break;
        }
        case 'kick':
        case 'flight': {
          I.consume('run');
          I.consume('action');
          st.v = Math.max(0, st.v - K.AIM_DECEL * dt);
          updateCan(dt);
          if (st.phase === 'kick' && st.t >= K.KICK_SHOW) setPhase('flight');
          // 缶を追いかけるカメラ
          const target = Math.max(0, can.x - C.W * 0.45);
          st.cam += (target - st.cam) * Math.min(1, dt * 5);
          if (can.landed && st.phase === 'flight' && st.msg === '') {
            st.msg = st.kickD.toFixed(2) + 'm';
            st.msgT = 0;
          }
          if (can.rest && st.msgT >= (a.isPlayer ? K.SHOW_PLAYER : K.SHOW_CPU) && st.msg) nextTurn();
          break;
        }
        case 'foul':
          I.consume('run');
          I.consume('action');
          st.v = Math.max(0, st.v - K.AIM_DECEL * dt);
          st.dist += st.v * dt;
          if (st.t >= K.FOUL_SHOW) nextTurn();
          break;
        case 'end':
          I.consume('run');
          I.consume('action');
          if (st.t >= K.END_WAIT) st.done = true;
          break;
      }
      // 助走中のカメラ(100m 走と同じく選手を画面の左寄りに置いてスクロール)
      if (st.phase === 'ready' || st.phase === 'run' || st.phase === 'aim' || st.phase === 'foul') {
        st.cam = Math.max(0, wx(st.dist) - C.CAMERA_PLAYER_X);
      }
    }

    // ---------- ポーズ ----------
    // 試技者: 'stop' 直立 / 'run' 走り / 'aim' 角度を決める(ジャンプの踏み切りのコマ)/ 'kick' 蹴る(ジャンプの空中のコマ)/ 'lose'(FOUL)
    function poseOf() {
      switch (st.phase) {
        case 'run':
          return st.v > 0.15 ? 'run' : 'stop';
        case 'aim':
          return 'aim';
        case 'kick':
          return 'kick';
        case 'foul':
          return st.v > 0.15 ? 'run' : 'lose';
        default:
          return 'stop';
      }
    }
    function drawAthlete(ctx, a, pose, x, fy) {
      if (pose === 'run') PO.chars.drawRunStrip(ctx, a.charId, Math.floor(st.anim), x, fy);
      else if (pose === 'aim') PO.chars.drawJump(ctx, a.charId, 0, x, fy);
      else if (pose === 'kick') PO.chars.drawJump(ctx, a.charId, 1, x, fy);
      else PO.chars.drawStripPose(ctx, a.charId, pose, x, fy);
    }

    // ---------- 描画 ----------
    const drawCan = paintCan; // 缶の描画はファイル上部(操作説明のデモでも使う)

    function render(ctx) {
      const cam = st.cam;
      const a = st.turn >= 0 && st.turn < order.length * K.TRIES ? cur() : null;
      S.draw(ctx, cam, { lines: [lineX0], text100m: null });
      drawMarkers(ctx, cam);
      if (st.phase === 'end') return renderEnd(ctx);
      // 試技を待つ 3 人: 奥のレーンのスタートの後ろに立つ
      const waiting = order.filter((o) => o !== a);
      waiting.forEach((o, i) => PO.chars.drawStripPose(ctx, o.charId, 'stop', S.laneLineX(C.START_X, i) - 50 - cam, S.laneFootY(i)));
      // 試技者のレーンを明るく
      const pr = S.laneRect(LANE);
      ctx.fillStyle = 'rgba(255, 255, 160, 0.12)';
      ctx.fillRect(0, pr.y, C.W, pr.h);
      // 缶(試技者より奥に置かれているので先に描く。飛んでいる間は手前に描く)
      const canY = footY - 2 - K.CAN_H / 2 - can.y;
      const canBack = can.rest && !can.path;
      if (canBack) drawCan(ctx, can.x - cam, canY, 0);
      if (a) {
        const x = wx(st.dist) - cam;
        drawAthlete(ctx, a, poseOf(), x, footY);
        if (a.isPlayer) drawPlayerMark(ctx, x);
        if (st.phase === 'ready') {
          const ch = PO.chars.byId(a.charId);
          PO.draw.text(ctx, ch.name, x, footY - 128, { size: 16, color: ch.color, align: 'center' });
        }
        if (st.phase === 'aim' || st.phase === 'kick' || (st.phase === 'flight' && st.t < 0.6)) drawAngleGauge(ctx, wx(st.dist) - cam + 70, footY - 70);
      }
      if (!canBack) {
        // 影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(Math.round(can.x - cam - 8), footY - 2, 16, 3);
        drawCan(ctx, can.x - cam, canY, can.rot);
      }
      drawHud(ctx);
      PO.scoreboard.draw(ctx, PO.SCOREBOARD, boardLines(), st.msgT);
      // 合図・飛距離の大きな表示(電光掲示板の下)
      const my = PO.SCOREBOARD.MSG_Y;
      if (st.msg && !(st.msg === 'RUN!' && st.msgT > 0.8)) {
        const isDist = /m$/.test(st.msg) && st.phase === 'flight';
        const big = isDist ? 96 : st.msg === 'FOUL!' ? 90 : 54;
        const pop = Math.min(1, st.msgT * 8);
        const color = st.msg === 'FOUL!' ? '#ff4a4a' : isDist ? '#ffe600' : st.msg === 'RUN!' ? '#7dff5a' : '#ffffff';
        PO.draw.text(ctx, st.msg, C.W / 2, my, { size: Math.round(big * (0.6 + 0.4 * pop)), color, align: 'center', italic: true, shadow: '#ff2fa8', outline: '#000' });
        if (isDist && st.newBest) PO.draw.text(ctx, 'TOP RECORD!', C.W / 2, my + 60, { size: 30, color: '#ff5cc8', align: 'center', italic: true, outline: '#000' });
        if (st.msg === 'FOUL!') PO.draw.text(ctx, st.foulWhy === 'TIME' ? '時間切れ' : 'キックラインを越えた', C.W / 2, my + 56, { size: 24, align: 'center' });
      }
    }

    // 距離の目盛り: キックラインから 5m ごとに、レーン 3 の下の縁に白い目盛りと、手前の芝に距離の数字
    function drawMarkers(ctx, cam) {
      const r = S.laneRect(LANE);
      const y = r.y + r.h;
      for (let m = 5; m <= 80; m += 5) {
        const x = Math.round(wx(K.RUNUP + m) - cam);
        if (x < -40 || x > C.W + 40) continue;
        const big = m % 10 === 0;
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 2, y - (big ? 18 : 10) - 1, 5, big ? 20 : 12);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 1, y - (big ? 18 : 10), 3, big ? 18 : 10);
        if (big) PO.draw.text(ctx, m + 'm', x, y + 16, { size: 18, color: '#fff', align: 'center' });
      }
      // いまの試技者の最高記録の位置(キャラクターの色の旗)と、今回の着地の位置
      const a = st.turn >= 0 && st.turn < order.length * K.TRIES ? cur() : null;
      const flag = (d, color, label) => {
        const x = Math.round(wx(K.RUNUP + d) - cam);
        if (x < -40 || x > C.W + 40) return;
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 2, y - 46, 4, 46);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x + 2, y - 46);
        ctx.lineTo(x + 26, y - 39);
        ctx.lineTo(x + 2, y - 32);
        ctx.fill();
        if (label) PO.draw.text(ctx, label, x + 4, y - 56, { size: 13, color, align: 'center' });
      };
      if (a && a.best != null && !(st.phase === 'flight' && can.landed && a.best === st.kickD)) flag(a.best, PO.chars.byId(a.charId).color, 'BEST');
      if (can.landed && st.kickD != null) flag(st.kickD, '#ffe600', null);
    }

    function drawPlayerMark(ctx, x) {
      const fy = footY;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(x, fy + 4);
      ctx.lineTo(x + 14, fy + 20);
      ctx.lineTo(x - 14, fy + 20);
      ctx.fill();
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.moveTo(x, fy + 8);
      ctx.lineTo(x + 9, fy + 18);
      ctx.lineTo(x - 9, fy + 18);
      ctx.fill();
      PO.draw.text(ctx, '1P', x, fy + 36, { size: 22, color: '#ffe600', align: 'center' });
    }

    // 角度のメーター(描画はファイル上部の paintAngleGauge。操作説明のデモでも使う)
    function drawAngleGauge(ctx, x, y) {
      paintAngleGauge(ctx, x, y, st.angle);
    }

    // 順位発表: 4 人が奥から手前のレーンに並び、1 位はガッツポーズ・ほかは敗北のポーズ
    function renderEnd(ctx) {
      athletes
        .slice()
        .sort((p, q) => rankOf(p) - rankOf(q))
        .forEach((o, i) => {
          const lane = i; // 1 位がいちばん奥
          const x = 240;
          const fy = S.laneFootY(lane);
          PO.chars.drawStripPose(ctx, o.charId, rankOf(o) === 1 && o.best != null ? 'goal' : 'lose', x, fy);
          const ch = PO.chars.byId(o.charId);
          PO.draw.text(ctx, PO.draw.ordinal(rankOf(o)) + '  ' + ch.name + '  ' + (o.best == null ? 'NO MARK' : o.best.toFixed(2) + 'm'), x + 70, fy - 30, { size: 20, color: ch.color });
          if (o.isPlayer) drawPlayerMarkAt(ctx, x, fy);
        });
      drawHud(ctx);
      PO.scoreboard.draw(ctx, PO.SCOREBOARD, boardLines(), st.t);
      PO.draw.text(ctx, st.msg, C.W / 2, PO.SCOREBOARD.MSG_Y, { size: 60, color: st.msg === 'YOU WIN!' ? '#ffe600' : '#9fd0ff', align: 'center', italic: true, shadow: '#ff2fa8', outline: '#000' });
    }
    function drawPlayerMarkAt(ctx, x, fy) {
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.moveTo(x - 50, fy - 40);
      ctx.lineTo(x - 36, fy - 32);
      ctx.lineTo(x - 50, fy - 24);
      ctx.fill();
    }

    // 電光掲示板: 試技者と回数・助走の速さ・角度・今回の飛距離(FOUL)・その人の最高記録。順位発表では WINNER
    const shortName = (id) => PO.chars.byId(id).name.split(' ')[0];
    const fmtM = (d) => (d == null ? '--.--m' : d.toFixed(2) + 'm');
    function boardLines() {
      if (st.phase === 'end') {
        const w = athletes.filter((o) => rankOf(o) === 1 && o.best != null);
        return [
          { text: 'WINNER !!', dot: 5, blink: true },
          { text: w.length ? PO.chars.byId(w[0].charId).name : 'NO WINNER', dot: 4 },
          { text: w.length ? fmtM(w[0].best) : '--.--m', dot: 8 },
          { text: w.length > 1 ? 'DRAW' : '1st PLACE', dot: 4 },
        ];
      }
      const a = st.turn >= 0 ? cur() : null;
      if (!a) return [{ text: 'CAN KICK', dot: 6 }, { text: 'GET READY', dot: 4 }];
      const speed = st.phase === 'run' ? st.v : st.phase === 'ready' ? 0 : st.pressV;
      const showAngle = st.phase === 'aim' || st.phase === 'kick' || st.phase === 'flight';
      const isFoul = st.phase === 'foul';
      return [
        { left: shortName(a.charId), right: 'TRY ' + tryNo() + '/' + K.TRIES, dot: 4 },
        { left: 'SPEED', right: speed.toFixed(1) + 'm/s', dot: 3 },
        { left: 'ANGLE', right: showAngle ? Math.round(st.angle) + ' DEG' : '-- DEG', dot: 3 },
        isFoul ? { left: 'DIST', right: 'FOUL', dot: 4, blink: true } : { left: 'DIST', right: can.landed ? fmtM(st.kickD) : '--.--m', dot: 4 },
        { left: 'BEST', right: fmtM(a.best), dot: 3 },
      ];
    }

    // HUD: 試技の回数と、4 人それぞれの 3 回の結果と最高記録(試技の順番に並べる。いまの試技者を明るく)
    function drawHud(ctx) {
      ctx.fillStyle = '#10122e';
      ctx.fillRect(0, 0, C.W, C.HUD_H);
      ctx.fillStyle = '#ff2fa8';
      ctx.fillRect(0, C.HUD_H - 4, C.W, 4);
      PO.draw.text(ctx, 'TRY', 14, 22, { size: 16, color: '#ffe600', outline: null });
      PO.draw.text(ctx, (st.turn < 0 ? 1 : Math.min(K.TRIES, tryNo())) + '/' + K.TRIES, 14, 50, { size: 28, color: '#fff' });
      const rec = PO.records.get('cankick');
      PO.draw.text(ctx, 'BEST ' + (rec ? rec.value.toFixed(2) + 'm' : '--'), 14, 72, { size: 12, color: '#aaa', outline: null });
      const a = st.turn >= 0 && st.phase !== 'end' ? cur() : null;
      order.forEach((o, i) => {
        const x = 122 + i * 209;
        const ch = PO.chars.byId(o.charId);
        const now = o === a;
        PO.draw.panel(ctx, x, 6, 202, 66, now ? '#5a2a6a' : o.isPlayer ? '#4a3a10' : '#1d2160', now ? '#ffffff' : o.isPlayer ? '#ffe600' : ch.color);
        PO.draw.text(ctx, (o.isPlayer ? '1P ' : '') + shortName(o.charId), x + 10, 22, { size: 14, color: ch.color, outline: null });
        PO.draw.text(ctx, o.best == null ? '--' : o.best.toFixed(2), x + 192, 24, { size: 22, color: '#fff', align: 'right' });
        for (let k = 0; k < K.TRIES; k++) {
          const v = o.tries[k];
          const s = k >= o.tries.length ? '--' : v == null ? 'F' : v.toFixed(1);
          PO.draw.text(ctx, s, x + 34 + k * 62, 52, { size: 15, color: v === null && k < o.tries.length ? '#ff6a6a' : '#ccc', align: 'center', outline: null });
        }
      });
    }

    // リザルト: 最高飛距離の順(同じ距離は同じ順位)。3 回とも FOUL は NO MARK
    function result() {
      const sorted = athletes.slice().sort((p, q) => bestKey(q) - bestKey(p) || (p.isPlayer ? -1 : q.isPlayer ? 1 : 0));
      return {
        entries: sorted.map((o) => ({ charId: o.charId, isPlayer: o.isPlayer, value: o.best, label: o.best == null ? 'NO MARK' : null, rank: rankOf(o) })),
        playerValue: player.best,
      };
    }

    function snapshot() {
      const a = st.turn >= 0 && st.turn < order.length * K.TRIES ? cur() : null;
      return {
        phase: st.phase,
        t: st.t,
        turn: st.turn,
        tryNo: st.turn >= 0 ? tryNo() : 0,
        current: a ? a.charId : null,
        currentIsPlayer: a ? a.isPlayer : false,
        dist: st.dist,
        v: st.v,
        pressD: st.pressD,
        pressV: st.pressV,
        angle: st.angle,
        kickD: st.kickD,
        foulWhy: st.foulWhy,
        msg: st.msg,
        done: st.done,
        cam: st.cam,
        can: { x: can.x, y: can.y, landed: can.landed, rest: can.rest, flying: !!can.path && !can.rest },
        pose: poseOf(),
        order: order.map((o) => o.charId),
        board: boardLines().map((l) => (l.text != null ? l.text : l.left + ' ' + l.right)),
        athletes: athletes.map((o) => ({ charId: o.charId, isPlayer: o.isPlayer, level: o.level, speed: o.speed, tries: o.tries.slice(), best: o.best, rank: rankOf(o) })),
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

  PO.events.register({ id: 'cankick', create, distanceOf, paintCan, paintAngleGauge });
})();
