// トラックを走る種目の共通部品(100m 走・あんパン食い競争)。RUN の連打で加速する
// 流れ: intro(入場)→ marks(ON YOUR MARKS)→ set(GET SET)→ race(GO!!)→ finish(全員ゴール)→ リザルト
// marks / set の間に連打するとフライング(foul)で、intro からやり直す
//
// PO.trackRace.create(setup, def)
//   def.id: 種目の id(自己ベストの読み出しに使う) / def.title: 電光掲示板の種目名 / def.P: 調整値(PO.DASH100 と同じ形)
//   def.hooks(任意。種目ごとの追加の動き。100m 走は使わない):
//     init(api)                 作成直後。api = { runners, player, st, P, worldX, rankOf, laneFootY }
//     raceStep(dt, actions)     race / finish の 1 ステップの最初(actions = この間の ACTION の回数)
//     afterMove(r, d0, dt)      選手が進んだあと(d0 = 進む前の距離)
//     airborne(r)               true の間は走りのコマを進めず、足音も鳴らさない
//     drawLane(ctx, lane, camX) そのレーンの選手を描く直前(レーンの小道具)
//     drawRunner(ctx, r, x, footY)  true を返したら、その選手はふつうの描き方をしない
//     drawFront(ctx, camX)      選手をすべて描いたあと(選手より手前の小道具)
//     frameOf(r)                テスト用のコマの名前(null ならふつう)
//     cpuDist(r)                CPU の終盤の失速に使う距離(リレーは区間の中の距離。なければ r.dist)
//     boardLines()              電光掲示板の中身を種目ごとに変える(なければ共通の表示)
//   def.lines(任意): 斜めの白線を置く位置(レーン 0 の x の配列。なければスタートとゴール)/ def.noText100m: true で 100m の文字を置かない
//     runnerSnapshot(r) / snapshot()  テスト用の追加の状態
PO.trackRace = (function () {
  const C = PO.config;
  const S = PO.stadium;
  const I = PO.input;
  const PLAYER_LANE = 3; // プレイヤーはいちばん手前のレーン
  const round2 = (t) => Math.round(t * 100) / 100;

  function create(setup, def) {
    const P = def.P;
    const H = def.hooks || {};
    const pxm = C.PX_PER_M;
    const goalLineX = C.START_X + P.DIST * pxm; // レーン 0 のゴールラインの x
    // CPU 3 人に速い・ふつう・遅いを割り振る(巡航速度は CPU_SPEED_SCALE 倍)。setup.cpus の並び順(強い順)のまま
    // (2026-11-19 から固定。全種目・全 ROUND で強さの序列を保つ)。上限 CPU_SPEED_CAP(ROUND が進んで速くなったとき)
    const cap = P.CPU_SPEED_CAP || Infinity;
    const bands = P.CPU_SPEEDS.map((b) => b.map((v) => Math.min(cap, v * P.CPU_SPEED_SCALE)));
    const lanes = PO.rng.shuffle([0, 1, 2]);

    function makeRunner(charId, lane, isPlayer, band) {
      return {
        charId,
        lane,
        isPlayer,
        dist: 0, // スタートラインからの距離(m)
        v: 0, // 速さ(m/s)
        finished: false,
        time: null, // ゴールのタイム(秒、0.01 秒単位)。null = 記録なし
        anim: 0, // 走りのコマの進み(コマ数)
        tapRate: 0, // 直近の連打ペース(回/秒、平滑化)。走りのアニメーションの演出だけに使う
        stopT: 0, // ゴール後に止まってからの時間(勝利ポーズ用)
        // CPU の性格
        base: band ? PO.rng.range(band[0], band[1]) : 0,
        react: PO.rng.range(P.CPU_REACT[0], P.CPU_REACT[1]),
        ph1: PO.rng.range(0, Math.PI * 2),
        ph2: PO.rng.range(0, Math.PI * 2),
        fade: band ? PO.rng.range(0, 0.04) : 0, // 終盤の失速の度合い
      };
    }
    const runners = setup.cpus.map((id, i) => makeRunner(id, lanes[i], false, bands[i]));
    // CPU ごとに走りのコマの開始位相をずらす(プレイヤーは 0)
    runners.forEach((r, i) => (r.anim = r.phase0 = PO.CPU_ANIM_PHASE[i] || 0));
    const player = makeRunner(setup.player, PLAYER_LANE, true, null);
    runners.push(player);
    runners.sort((a, b) => a.lane - b.lane); // 奥のレーンから描く

    // winner: 1 位の走者がゴールした瞬間の成績(電光掲示板の WINNER 表示。以後は固定)
    const st = { winner: null, phase: 'intro', t: 0, raceT: 0, setDur: 0, fouls: 0, msg: '', msgT: 0, timeUp: false, done: false };

    function setPhase(p, msg) {
      st.phase = p;
      st.t = 0;
      if (msg !== undefined) {
        st.msg = msg;
        st.msgT = 0;
      }
    }

    function resetRunners() {
      runners.forEach((r) => {
        r.dist = 0;
        r.v = 0;
        r.anim = r.phase0 || 0;
      });
    }

    function foul() {
      st.fouls++;
      PO.sound.play('foul');
      setPhase('foul', 'FALSE START!');
    }

    const worldX = (r) => S.laneLineX(C.START_X, r.lane) + r.dist * pxm;

    // 順位の比べ方: ゴール済み(タイム順)→ 走っている(距離順)→ 記録なし
    function rankKey(r) {
      if (r.finished) return r.time == null ? 1e9 : r.time - 1e6;
      return -r.dist;
    }
    function rankOf(r) {
      return 1 + runners.filter((o) => o !== r && rankKey(o) < rankKey(r)).length;
    }
    if (H.init) H.init({ runners, player, st, P, worldX, rankOf, laneFootY: S.laneFootY });

    function updateRunner(r, dt, taps) {
      const strip = PO.chars.runStrip(r.charId);
      if (r.isPlayer && strip && strip.tapTau) {
        // 連打ペースを指数平滑化(見た目の演出用。速さの計算には使わない)
        r.tapRate += (taps / dt - r.tapRate) * (1 - Math.exp(-dt / strip.tapTau));
      }
      if (r.finished) {
        r.v -= (P.RUNOUT_DECEL * r.v + P.FRICTION) * dt; // ゴール後は自然に止まる
      } else if (r.isPlayer) {
        // 連打 1 回ごとに加速し、速さに比例する減速と一定の減速で、連打をやめるとだんだん止まる
        r.v = Math.min(P.VMAX, r.v + taps * P.TAP_BOOST);
        r.v -= (P.DRAG * r.v + P.FRICTION) * dt;
      } else if (st.raceT >= r.react) {
        // CPU: 巡航速度にゆらぎを足した目標へ、加速度の上限つきでなめらかに近づく
        const late = Math.max(0, ((H.cpuDist ? H.cpuDist(r) : r.dist) - 60) / 40);
        const target = Math.min(P.VMAX, r.base * (1 + 0.025 * Math.sin(st.raceT * 2.1 + r.ph1) + 0.015 * Math.sin(st.raceT * 3.7 + r.ph2) - r.fade * late)); // ゆらいでもプレイヤーの最高速度まで
        const acc = Math.max(-4, Math.min(P.CPU_ACCEL_MAX, (target - r.v) * P.CPU_ACCEL_K * 2));
        r.v += acc * dt;
      }
      r.v = Math.max(0, r.v);
      const d0 = r.dist;
      r.dist += r.v * dt;
      if (H.afterMove) H.afterMove(r, d0, dt);
      if (!r.finished && r.dist >= P.DIST) {
        // ステップの途中でラインを越えた時刻を補間して、0.01 秒単位のタイムにする
        r.finished = true;
        r.time = round2(st.raceT - dt + ((P.DIST - d0) / (r.dist - d0)) * dt);
        // 1 位の走者(プレイヤー・CPU を問わない)がゴールした瞬間だけ、ピストルと歓声を一段大きく。2〜4 位は音なし
        if (runners.filter((o) => o.finished && o.time != null).length === 1) {
          st.winner = { charId: r.charId, name: PO.chars.byId(r.charId).name, time: r.time, at: st.raceT }; // at: 点滅の起点(全員ゴールで 0 に戻る st.t ではなく、競技の経過時間)
          PO.sound.play('finish');
          PO.sound.crowd('up');
        }
      }
      // 走りのコマは速さに合わせて進める(速いほど足が速く回る)。空中ではコマも足音も止める
      if (H.airborne && H.airborne(r)) {
        r.stopT = 0;
      } else if (r.v > 0.15 && strip) {
        // 走りの連番画像: 1 周(frames コマ)の速さを走る速さに比例させ、着地のコマで足音
        const before = Math.floor(r.anim);
        r.anim += dt * strip.frames * PO.chars.stripCycles(strip, r.v, r.finished ? 0 : r.tapRate);
        const after = Math.floor(r.anim);
        if (r.isPlayer && after !== before && strip.stepFrames.includes(after % strip.frames)) PO.sound.play('step');
        r.stopT = 0;
      } else if (r.v > 0.15) {
        const before = Math.floor(r.anim);
        r.anim += dt * (3 + r.v * 1.1);
        const after = Math.floor(r.anim);
        if (r.isPlayer && after !== before && after % 2 === 0) PO.sound.play('step');
        r.stopT = 0;
      } else if (r.finished) r.stopT += dt;
    }

    function update(dt) {
      st.t += dt;
      st.msgT += dt;
      switch (st.phase) {
        case 'intro':
          I.consume('run');
          I.consume('action');
          if (st.t >= P.INTRO) {
            PO.sound.play('ready');
            setPhase('marks', 'ON YOUR MARKS');
          }
          break;
        case 'marks':
        case 'set': {
          // GO!! の前に押したらフライング
          const n = I.consume('run') + I.consume('action');
          if (n > 0) foul();
          else if (st.phase === 'marks' && st.t >= P.MARKS) {
            st.setDur = PO.rng.range(P.SET_MIN, P.SET_MAX);
            PO.sound.play('ready');
            setPhase('set', 'GET SET');
          } else if (st.phase === 'set' && st.t >= st.setDur) {
            st.raceT = 0;
            PO.sound.play('start');
            PO.sound.crowd('start'); // スタートと同時に観客の歓声
            setPhase('race', 'GO!!');
          }
          break;
        }
        case 'foul':
          I.consume('run');
          I.consume('action');
          if (st.t >= P.FOUL_SHOW) {
            resetRunners();
            setPhase('intro', '');
            st.t = P.INTRO * 0.5; // やり直しの入場は短く
          }
          break;
        case 'race':
        case 'finish': {
          st.raceT += dt;
          const taps = I.consume('run');
          const actions = I.consume('action');
          if (H.raceStep) H.raceStep(dt, actions);
          runners.forEach((r) => updateRunner(r, dt, taps));
          if (st.phase === 'race') {
            if (st.raceT >= P.TIME_LIMIT && !player.finished) {
              // 時間切れ: まだゴールしていない選手は記録なし
              runners.forEach((r) => {
                if (!r.finished) r.finished = true;
              });
              st.timeUp = true;
              PO.sound.play('timeup');
              st.msg = 'TIME UP';
              st.msgT = 0;
            }
            if (runners.every((r) => r.finished)) {
              setPhase('finish');
              PO.sound.crowd('fade'); // 全員ゴール(時間切れを含む)で歓声をだんだん小さく
            }
          } else if (st.t >= P.FINISH_WAIT) st.done = true;
          break;
        }
      }
    }

    // 選手のポーズとコマ
    function poseOf(r) {
      switch (st.phase) {
        case 'marks':
          return { pose: 'marks', t: 0 };
        case 'set':
          return { pose: 'set', t: 0 };
        case 'race':
        case 'finish':
          if (r.v > 0.15) return { pose: 'run', t: r.anim };
          if (r.finished && r.time != null && rankOf(r) === 1) return { pose: 'win', t: r.stopT };
          return { pose: 'idle', t: 0 };
        default:
          return { pose: 'idle', t: 0 };
      }
    }

    // ポーズ画像(start / stop / goal)を持つキャラクター(赤モヒカン)で、競技中に使うポーズ画像の名前。null = 従来の描き方
    //   スタートの構え(marks / set)= start、ゴール後に止まったら 1 位は goal(ガッツポーズ)・2〜4 位は lose(敗北)、
    //   それ以外で止まっているとき = stop。ゴールしていない走者は走り続ける(run のまま)
    function stripPoseOf(r, p) {
      if (!PO.chars.hasStripPoses(r.charId)) return null;
      if (p.pose === 'marks' || p.pose === 'set') return 'start';
      if (p.pose === 'win' || (p.pose === 'idle' && r.finished && r.time != null)) return rankOf(r) === 1 ? 'goal' : 'lose';
      if (p.pose === 'idle') return 'stop';
      return null;
    }

    function camX() {
      return Math.max(0, worldX(player) - C.CAMERA_PLAYER_X);
    }

    function displayTime() {
      if (st.phase !== 'race' && st.phase !== 'finish') return '0.00';
      if (player.finished) return player.time == null ? '--.--' : player.time.toFixed(2);
      return st.raceT.toFixed(2);
    }

    // ---------- 描画 ----------
    function render(ctx) {
      const cx = camX();
      S.draw(ctx, cx, { lines: def.lines || [C.START_X, goalLineX], text100m: def.noText100m ? null : S.laneLineX(goalLineX, 3) - 40 });

      // プレイヤーのレーンを明るくして、左端にレーン番号(プレイヤーは YOU)
      const pr = S.laneRect(player.lane);
      ctx.fillStyle = 'rgba(255, 255, 160, 0.16)';
      ctx.fillRect(0, pr.y, C.W, pr.h);
      for (let lane = 0; lane < 4; lane++) {
        const r = S.laneRect(lane);
        const isP = lane === player.lane;
        const w = isP ? 64 : 30;
        ctx.fillStyle = '#000';
        ctx.fillRect(4, r.y + r.h / 2 - 13, w, 26);
        ctx.fillStyle = isP ? '#ffe600' : '#ffffff';
        ctx.fillRect(6, r.y + r.h / 2 - 11, w - 4, 22);
        PO.draw.text(ctx, isP ? lane + 1 + ' YOU' : String(lane + 1), 4 + w / 2, r.y + r.h / 2 + 1, { size: 15, color: '#000', align: 'center', outline: null });
      }

      // 選手(奥のレーンから。レーンの小道具はそのレーンの選手の直前に描く)
      runners.forEach((r) => {
        if (H.drawLane) H.drawLane(ctx, r.lane, cx);
        if (H.drawRunner && H.drawRunner(ctx, r, worldX(r) - cx, S.laneFootY(r.lane))) return;
        const p = poseOf(r);
        const frame = PO.chars.frameName(r.charId, p.pose, p.t);
        const hop = p.pose === 'win' ? PO.chars.winHop(r.charId, p.t) : 0;
        const sp = stripPoseOf(r, p);
        if (p.pose === 'run' && PO.chars.runStrip(r.charId)) PO.chars.drawRunStrip(ctx, r.charId, Math.floor(p.t), worldX(r) - cx, S.laneFootY(r.lane));
        else if (sp) PO.chars.drawStripPose(ctx, r.charId, sp, worldX(r) - cx, S.laneFootY(r.lane));
        else PO.chars.draw(ctx, r.charId, frame, worldX(r) - cx, S.laneFootY(r.lane) - hop, 1);
      });

      if (H.drawFront) H.drawFront(ctx, cx);

      // 入場〜スタートまでは名前、プレイヤーの頭の上には 1P の印
      runners.forEach((r) => {
        const x = worldX(r) - cx;
        const y = S.laneFootY(r.lane) - 118;
        const ch = PO.chars.byId(r.charId);
        if (r.isPlayer) {
          // 1P の印は足元の下(手前の芝)に、上向きの矢印で出す(奥のレーンの選手と重ならない)
          const fy = S.laneFootY(r.lane);
          const bob = Math.round(Math.sin(st.t * 8) * 2);
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.moveTo(x, fy + 4 + bob);
          ctx.lineTo(x + 14, fy + 20 + bob);
          ctx.lineTo(x - 14, fy + 20 + bob);
          ctx.fill();
          ctx.fillStyle = '#ffe600';
          ctx.beginPath();
          ctx.moveTo(x, fy + 8 + bob);
          ctx.lineTo(x + 9, fy + 18 + bob);
          ctx.lineTo(x - 9, fy + 18 + bob);
          ctx.fill();
          PO.draw.text(ctx, '1P', x, fy + 36 + bob, { size: 22, color: '#ffe600', align: 'center' });
        } else if (st.phase === 'intro' || st.phase === 'marks' || st.phase === 'set' || st.phase === 'foul') {
          PO.draw.text(ctx, ch.name, x, y - 8, { size: 13, color: ch.color, align: 'center' });
        }
      });

      drawHud(ctx);
      PO.scoreboard.draw(ctx, PO.SCOREBOARD, H.boardLines ? H.boardLines() : boardLines(), st.winner ? st.raceT - st.winner.at : 0);

      // 合図の文字(電光掲示板の下に出す)
      const my = PO.SCOREBOARD.MSG_Y;
      if (st.msg && !(st.msg === 'GO!!' && st.msgT > P.GO_SHOW) && !(st.msg === 'TIME UP' && st.msgT > 2)) {
        const big = st.msg === 'GO!!' ? 110 : 64;
        const pop = Math.min(1, st.msgT * 8);
        const color = st.msg === 'FALSE START!' ? '#ff4a4a' : st.msg === 'GO!!' ? '#7dff5a' : '#ffe600';
        PO.draw.text(ctx, st.msg, C.W / 2, my, { size: Math.round(big * (0.6 + 0.4 * pop)), color, align: 'center', italic: true, shadow: '#ff2fa8', outline: '#000' });
        if (st.msg === 'FALSE START!') PO.draw.text(ctx, 'GO!! のあとで連打しよう', C.W / 2, my + 52, { size: 24, align: 'center' });
      }
      if (st.phase === 'finish' && player.time != null && st.t > 0.3) {
        PO.draw.text(ctx, 'FINISH!', C.W / 2, my, { size: 72, color: '#ffe600', align: 'center', italic: true, shadow: '#ff2fa8' });
      }
    }

    // 電光掲示板の中身。競技中 = 種目名・スコア・経過タイム・プレイヤーの距離、
    // 1 位の走者がゴールしたら(プレイヤー・CPU を問わない)WINNER 表示に切り替えて、そのまま固定
    const fmtTime = (t) => (t < 10 ? '0' : '') + t.toFixed(2); // 08.52
    function boardLines() {
      if (st.winner) {
        return [
          { text: 'WINNER !!', dot: 5, blink: true },
          { text: st.winner.name, dot: 4 },
          { text: fmtTime(st.winner.time), dot: 9 },
          { text: '1st PLACE', dot: 4 },
        ];
      }
      const racing = st.phase === 'race' || st.phase === 'finish';
      return [
        { text: def.title, dot: 4 },
        { left: 'SCORE', right: PO.score.text(PO.score.current), dot: 3 }, // 累積スコア(1UP。競技の点はリザルトで加える)
        { text: 'TIME', dot: 3 },
        { text: fmtTime(racing ? Math.min(st.raceT, P.TIME_LIMIT) : 0), dot: 9 },
        { text: 'DISTANCE  ' + Math.floor(Math.min(P.DIST, player.dist)) + 'm', dot: 4 },
      ];
    }

    function drawHud(ctx) {
      ctx.fillStyle = '#10122e';
      ctx.fillRect(0, 0, C.W, C.HUD_H);
      ctx.fillStyle = '#ff2fa8';
      ctx.fillRect(0, C.HUD_H - 4, C.W, 4);
      const best = PO.records.get(def.id);
      const rank = rankOf(player);
      const items = [
        ['TIME', displayTime(), 16],
        ['BEST', best ? best.value.toFixed(2) : '--.--', 256],
        ['DIST', Math.min(P.DIST, player.dist).toFixed(1) + 'm', 486],
        ['RANK', player.finished && player.time == null ? '---' : PO.draw.ordinal(rank), 736],
      ];
      items.forEach(([label, value, x]) => {
        PO.draw.text(ctx, label, x, 26, { size: 18, color: '#ffe600', outline: null });
        PO.draw.text(ctx, value, x + 72, 26, { size: 30, color: '#fff' });
      });
      // 4 人の位置がいつでもわかる進み具合のバー
      const bx = 16;
      const bw = C.W - 32;
      ctx.fillStyle = '#3a3d6e';
      ctx.fillRect(bx, 56, bw, 6);
      ctx.fillStyle = '#fff';
      ctx.fillRect(bx + bw - 3, 50, 3, 18);
      runners.forEach((r) => {
        const x = bx + (Math.min(P.DIST, r.dist) / P.DIST) * (bw - 6);
        const ch = PO.chars.byId(r.charId);
        const s = r.isPlayer ? 9 : 6;
        ctx.fillStyle = '#000';
        ctx.fillRect(x - s - 2, 59 - s - 2, s * 2 + 4, s * 2 + 4);
        ctx.fillStyle = ch.color;
        ctx.fillRect(x - s, 59 - s, s * 2, s * 2);
        if (r.isPlayer) PO.draw.text(ctx, 'P', x, 60, { size: 12, color: '#000', align: 'center', outline: null });
      });
    }

    function result() {
      const order = runners.slice().sort((a, b) => rankKey(a) - rankKey(b));
      return {
        entries: order.map((r, i) => ({ charId: r.charId, isPlayer: r.isPlayer, value: r.time, rank: i + 1, lane: r.lane })),
        playerValue: player.time,
      };
    }

    function snapshot() {
      return {
        phase: st.phase,
        t: st.t,
        raceT: st.raceT,
        setDur: st.setDur,
        fouls: st.fouls,
        msg: st.msg,
        timeUp: st.timeUp,
        done: st.done,
        camX: camX(),
        displayTime: displayTime(),
        playerRank: rankOf(player),
        board: { mode: st.winner ? 'winner' : 'race', lines: (H.boardLines ? H.boardLines() : boardLines()).map((l) => (l.text != null ? l.text : l.left + ' ' + l.right)) },
        winner: st.winner,
        ...(H.snapshot ? H.snapshot() : {}),
        runners: runners.map((r) => {
          const p = poseOf(r);
          const hf = H.frameOf ? H.frameOf(r) : null;
          return {
            ...(H.runnerSnapshot ? H.runnerSnapshot(r) : {}),
            charId: r.charId,
            lane: r.lane,
            isPlayer: r.isPlayer,
            dist: r.dist,
            v: r.v,
            rank: rankOf(r),
            tapRate: r.tapRate,
            finished: r.finished,
            time: r.time,
            pose: p.pose,
            frame: hf
              ? hf
              : stripPoseOf(r, p)
              ? 'pose_' + stripPoseOf(r, p)
              : p.pose === 'run' && PO.chars.runStrip(r.charId)
                ? 'strip' + (Math.floor(p.t) % PO.chars.runStrip(r.charId).frames)
                : PO.chars.frameName(r.charId, p.pose, p.t),
            screenX: worldX(r) - camX(),
            footY: S.laneFootY(r.lane),
            base: r.base,
          };
        }),
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

  return { create };
})();
