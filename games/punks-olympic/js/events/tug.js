// 種目: 綱引き(TUG OF WAR)。2 対 2(左 = プレイヤー + 味方 CPU、右 = 敵 CPU 2 人)
// 連打ではなくタイミング: 往復するゲージのカーソルが中央に来たときに ACTION(PC は ENTER)を押すと綱を引く。
//   判定は PERFECT / GREAT / GOOD / MISS の 4 種類で、引く力が違う。左→右・右→左の片道ごとに 1 回だけ押せる(端で折り返すと解除。連打しても得をしない)
// CPU も 1 往復に 1 回、確率で判定が決まって引く。綱の中央の目印が勝敗判定ラインを越えたら決着。
// 時間切れは目印の位置で判定し、ちょうど中央なら延長戦。カメラは固定
// 流れ: intro → ready(READY)→ set(SET)→ pull(PULL!!)→ end(決着)→ リザルト
// 競技場・電光掲示板・勝敗のポーズ・効果音・リザルトは共通部品を使う
(function () {
  const C = PO.config;
  const S = PO.stadium;
  const I = PO.input;
  const P0 = PO.TUG; // R1 の調整値(ゲージ・判定の範囲・力は ROUND で変えない)
  const P = P0;
  const CX = C.W / 2; // 綱の目印の中央(勝敗判定の基準)。カメラは固定
  const round2 = (t) => Math.round(t * 100) / 100;
  const JUDGES = ['PERFECT', 'GREAT', 'GOOD', 'MISS'];

  // ゲージのカーソルの位置(0〜1)。1 往復 GAUGE_PERIOD 秒の三角波
  function gaugePos(t) {
    const u = (t / P.GAUGE_PERIOD) % 1;
    return u < 0.5 ? u * 2 : 2 - u * 2;
  }
  // カーソルの片道の番号(0 = 最初の左→右、1 = 右→左、2 = 左→右 …)。端で折り返した瞬間に次の番号になる。
  // プレイヤーは片道ごとに 1 回だけ押せる(同じ向きに動いている間の 2 回目以降は無視 = 連打は無効)
  function strokeOf(t) {
    return Math.floor(t / (P.GAUGE_PERIOD / 2));
  }
  // カーソルの位置から判定
  function judgeAt(pos) {
    const d = Math.abs(pos - 0.5);
    if (d <= P.ZONES.PERFECT) return 'PERFECT';
    if (d <= P.ZONES.GREAT) return 'GREAT';
    if (d <= P.ZONES.GOOD) return 'GOOD';
    return 'MISS';
  }
  // CPU の判定を確率表から引く(残りは MISS)
  function rollJudge(table) {
    let r = PO.rng.next();
    for (const j of ['PERFECT', 'GREAT', 'GOOD']) {
      if (r < table[j]) return j;
      r -= table[j];
    }
    return 'MISS';
  }

  // タイミングゲージの描画: 中央ほど強い(緑 = PERFECT・黄緑 = GREAT・黄 = GOOD・赤 = MISS)。押したあと、折り返すまでは暗くなる
  //   G: { x, y, w, h }(ゲージの位置)、o.pos: カーソルの位置(0〜1)、o.locked: 押したあと折り返すまで(押せない間)、
  //   o.judge: { name, t } 判定の表示(t = 表示してからの秒。0.7 秒まで)、o.hint: 判定がないときに上に出す文字(null なら出さない)
  //   競技(drawGauge)と操作説明のデモ(js/howto/)で共通に使う
  function paintGauge(ctx, G, o) {
    const locked = !!o.locked;
    PO.draw.panel(ctx, G.x - 10, G.y - 10, G.w + 20, G.h + 20, '#10122e', '#ffe600');
    const zone = (half, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(G.x + (0.5 - half) * G.w), G.y, Math.round(half * 2 * G.w), G.h);
    };
    zone(0.5, '#a3202a');
    zone(P.ZONES.GOOD, '#e8c62a');
    zone(P.ZONES.GREAT, '#9be83a');
    zone(P.ZONES.PERFECT, '#3affb0');
    if (locked) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(G.x, G.y, G.w, G.h);
    }
    // カーソル
    const cx = G.x + o.pos * G.w;
    ctx.fillStyle = '#000';
    ctx.fillRect(Math.round(cx) - 4, G.y - 8, 8, G.h + 16);
    ctx.fillStyle = locked ? '#888' : '#fff';
    ctx.fillRect(Math.round(cx) - 2, G.y - 6, 4, G.h + 12);
    // 判定の表示
    const j = o.judge;
    if (j && j.t < 0.7) {
      const colors = { PERFECT: '#3affb0', GREAT: '#9be83a', GOOD: '#e8c62a', MISS: '#ff6a6a' };
      const pop = Math.min(1, j.t * 10);
      PO.draw.text(ctx, j.name + (j.name === 'MISS' ? '...' : '!'), G.x + G.w / 2, G.y - 30 - j.t * 12, {
        size: Math.round(34 * (0.7 + 0.3 * pop)),
        color: colors[j.name],
        align: 'center',
        italic: true,
      });
    } else if (o.hint) {
      PO.draw.text(ctx, o.hint, G.x + G.w / 2, G.y - 26, { size: 16, color: locked ? '#888' : '#fff', align: 'center' });
    }
  }

  function create(setup) {
    // いまの ROUND の調整値(PO.difficulty。R1 は元の調整値のまま)。この中ではこれを使う
    const P = PO.difficulty.params('tug', P0);
    const footY = S.laneFootY(3); // 4 人ともいちばん手前のレーンに立つ
    // side: -1 = 左チーム(左へ引く)、+1 = 右チーム。slot: 0 = 前(中央寄り)、1 = 後ろ
    const member = (charId, side, slot, isPlayer, table) => ({
      charId,
      side,
      slot,
      isPlayer,
      table, // CPU の判定の確率表
      pullT: 0, // 「引く」のコマを見せる残り時間
      cpuAt: 0, // CPU: この往復の中で引く時刻(往復の始まりからの秒)
      cpuCycle: -1, // CPU: 最後に引いた往復の番号
      judges: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 },
    });
    const team = [
      member(setup.player, -1, 0, true, null),
      member(setup.cpus[0], -1, 1, false, P.CPU_ALLY),
      member(setup.cpus[1], 1, 0, false, P.CPU_ENEMY),
      member(setup.cpus[2], 1, 1, false, P.CPU_ENEMY),
    ];
    const player = team[0];
    const st = {
      phase: 'intro',
      t: 0, // いまの段階の経過時間
      pullT: 0, // PULL!! からの経過時間(ゲージ・タイム)
      limit: P.TIME_LIMIT, // 制限時間(延長で伸びる)
      overtimes: 0,
      setDur: 0,
      p: 0, // 綱の目印の位置(中央からの px、右が +)
      u: 0, // 綱の速さ(px/秒)
      lockedStroke: -1, // プレイヤーが押した片道の番号(同じ片道ではもう押せない。端で折り返すと解除)
      judge: null, // 直前のプレイヤーの判定 { name, t }
      winner: 0, // 勝ったチーム(-1 左 / +1 右)
      endTime: null, // 決着の時刻(PULL!! から。0.01 秒単位)
      timeUp: false,
      msg: '',
      msgT: 0,
      done: false,
      strainSoundT: 0,
    };

    function setPhase(p, msg) {
      st.phase = p;
      st.t = 0;
      if (msg !== undefined) {
        st.msg = msg;
        st.msgT = 0;
      }
    }

    // 1 回引く(判定 → 力)。side の向きへ綱の速さを足す
    function pull(m, judge) {
      m.judges[judge]++;
      const f = P.FORCE[judge];
      if (f > 0) {
        st.u += m.side * f * P.PULL_IMPULSE;
        m.pullT = P.PULL_SHOW;
      }
      if (m.isPlayer) {
        st.judge = { name: judge, t: 0 };
        if (judge === 'MISS') PO.sound.play('tugmiss');
        else {
          PO.sound.play('tugpull');
          PO.sound.play('stomp');
          if (judge === 'PERFECT') PO.sound.play('perfect');
        }
      }
    }

    function decide(side) {
      st.winner = side;
      st.endTime = round2(Math.min(st.pullT, st.limit));
      setPhase('end', side === player.side ? 'YOU WIN!' : 'YOU LOSE...');
      PO.sound.play('finish'); // 決着のピストル
      PO.sound.play(side === player.side ? 'victory' : 'defeat');
      PO.sound.crowd('up');
    }

    function update(dt) {
      st.t += dt;
      st.msgT += dt;
      if (st.judge) st.judge.t += dt;
      team.forEach((m) => (m.pullT = Math.max(0, m.pullT - dt)));
      switch (st.phase) {
        case 'intro':
        case 'ready':
        case 'set':
          // スタート前の入力は数えない(フライングはなし)
          I.consume('action');
          I.consume('run');
          if (st.phase === 'intro' && st.t >= P.INTRO) {
            PO.sound.play('ready');
            setPhase('ready', 'READY');
          } else if (st.phase === 'ready' && st.t >= P.READY) {
            st.setDur = PO.rng.range(P.SET_MIN, P.SET_MAX);
            PO.sound.play('ready');
            setPhase('set', 'SET');
          } else if (st.phase === 'set' && st.t >= st.setDur) {
            PO.sound.play('start');
            PO.sound.crowd('start');
            team.forEach((m) => (m.cpuAt = PO.rng.range(0.15, P.GAUGE_PERIOD - 0.15)));
            setPhase('pull', 'PULL!!');
          }
          break;
        case 'pull': {
          I.consume('run');
          st.pullT += dt;
          const cycle = Math.floor(st.pullT / P.GAUGE_PERIOD);
          // プレイヤー: 片道(左→右・右→左)ごとに 1 回だけ。同じ片道の 2 回目以降は無視
          const stroke = strokeOf(st.pullT);
          if (I.consume('action') > 0 && stroke !== st.lockedStroke) {
            st.lockedStroke = stroke;
            pull(player, judgeAt(gaugePos(st.pullT)));
          }
          // CPU: 各往復の決まった時刻に 1 回(プレイヤーの片道ごとの変更とは別。CPU の強さは変えない)
          const inCycle = st.pullT - cycle * P.GAUGE_PERIOD;
          team.forEach((m) => {
            if (m.isPlayer || m.cpuCycle === cycle || inCycle < m.cpuAt) return;
            m.cpuCycle = cycle;
            pull(m, rollJudge(m.table));
            m.cpuAt = PO.rng.range(0.15, P.GAUGE_PERIOD - 0.15); // 次の往復で引く時刻
          });
          // 綱を動かす
          st.u *= Math.exp(-P.DAMP * dt);
          st.p += st.u * dt;
          // プレイヤーのチームが押し戻されている間は、ときどき踏ん張る音
          st.strainSoundT -= dt;
          if (st.u * player.side < -P.STRAIN_V * 2 && st.strainSoundT <= 0) {
            PO.sound.play('stomp');
            st.strainSoundT = 0.7;
          }
          // 決着: 目印が勝敗判定ラインを越えた
          if (Math.abs(st.p) >= P.WIN_PX) {
            st.p = Math.sign(st.p) * P.WIN_PX;
            decide(Math.sign(st.p));
          } else if (st.pullT >= st.limit) {
            // 時間切れ: 目印の位置で判定。ちょうど中央なら延長
            if (Math.abs(st.p) <= P.TIE_PX) {
              st.limit += P.OVERTIME;
              st.overtimes++;
              st.msg = 'OVERTIME!';
              st.msgT = 0;
            } else {
              st.timeUp = true;
              decide(Math.sign(st.p));
            }
          }
          break;
        }
        case 'end':
          I.consume('action');
          I.consume('run');
          st.u = 0;
          if (st.t >= 1.2 && st.t - dt < 1.2) PO.sound.crowd('fade');
          if (st.t >= P.END_WAIT) st.done = true;
          break;
      }
    }

    // ---------- 位置とポーズ ----------
    // 選手の手(綱を持つところ)の x
    const handX = (m) => CX + st.p + m.side * (P.FRONT_GAP + m.slot * P.MEMBER_GAP);
    // 綱引きのコマ: 0 構え・1 引く・2 踏ん張り
    function frameOf(m) {
      if (st.phase !== 'pull') return 0;
      if (m.pullT > 0) return 1;
      if (st.u * m.side < -P.STRAIN_V) return 2;
      return 0;
    }
    // 選手の足元の中央の x(綱の端が手の位置に来るように置く)
    function bodyX(m, f) {
      const r = PO.chars.pullRope(m.charId, f);
      // 左チームは右向き(綱の端は体の右)、右チームは左右反転(綱の端は体の左)
      return handX(m) + m.side * r.dx;
    }
    const ropeY = (m, f) => footY - PO.chars.pullRope(m.charId, f).dy;

    // ---------- 描画 ----------
    function render(ctx) {
      S.draw(ctx, 0, { lines: [], text100m: null });
      drawGroundLines(ctx);
      const ended = st.phase === 'end';
      drawRope(ctx, ended);
      // 選手(後ろの人から)
      team
        .slice()
        .sort((a, b) => b.slot - a.slot)
        .forEach((m) => {
          const flip = m.side > 0;
          if (ended) {
            const x = handX(m) + m.side * 24;
            PO.chars.drawStripPoseFlip(ctx, m.charId, m.side === st.winner ? 'goal' : 'lose', x, footY, flip);
          } else {
            const f = frameOf(m);
            PO.chars.drawPull(ctx, m.charId, f, bodyX(m, f), footY, flip);
          }
        });
      drawMark(ctx, ended);
      // 1P の印(足元の下)
      const px = ended ? handX(player) - 24 : bodyX(player, frameOf(player));
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(px, footY + 4);
      ctx.lineTo(px + 14, footY + 20);
      ctx.lineTo(px - 14, footY + 20);
      ctx.fill();
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.moveTo(px, footY + 8);
      ctx.lineTo(px + 9, footY + 18);
      ctx.lineTo(px - 9, footY + 18);
      ctx.fill();
      PO.draw.text(ctx, '1P', px, footY + 36, { size: 22, color: '#ffe600', align: 'center' });
      // 入場〜スタートまでは名前
      if (st.phase === 'intro' || st.phase === 'ready' || st.phase === 'set') {
        team.forEach((m) => {
          const ch = PO.chars.byId(m.charId);
          PO.draw.text(ctx, ch.name, bodyX(m, 0), footY - 120 - m.slot * 16, { size: 13, color: ch.color, align: 'center' });
        });
      }
      drawHud(ctx);
      PO.scoreboard.draw(ctx, PO.SCOREBOARD, boardLines(), st.winner ? st.t : 0);
      if (st.phase === 'pull' || st.phase === 'set' || st.phase === 'ready') drawGauge(ctx);
      // 合図の文字(電光掲示板の下)
      const my = PO.SCOREBOARD.MSG_Y;
      const show = st.msg && !(st.msg === 'PULL!!' && st.msgT > 0.8) && !(st.msg === 'OVERTIME!' && st.msgT > 1.5);
      if (show) {
        const big = st.msg === 'PULL!!' ? 100 : 60;
        const pop = Math.min(1, st.msgT * 8);
        const color = st.msg === 'PULL!!' ? '#7dff5a' : st.msg === 'YOU LOSE...' ? '#9fd0ff' : '#ffe600';
        PO.draw.text(ctx, st.msg, C.W / 2, my, { size: Math.round(big * (0.6 + 0.4 * pop)), color, align: 'center', italic: true, shadow: '#ff2fa8', outline: '#000' });
      }
    }

    // 地面: 中央線(白)と、左右の勝敗判定ライン(赤)
    function drawGroundLines(ctx) {
      const top = S.laneRect(2).y;
      const r3 = S.laneRect(3);
      const bottom = r3.y + r3.h;
      const line = (x, color, w) => {
        ctx.fillStyle = '#000';
        ctx.fillRect(Math.round(x - w / 2) - 2, top, w + 4, bottom - top);
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x - w / 2), top, w, bottom - top);
      };
      line(CX, '#ffffff', 4);
      line(CX - P.WIN_PX, '#ff3a46', 6);
      line(CX + P.WIN_PX, '#ff3a46', 6);
      PO.draw.text(ctx, 'WIN', CX - P.WIN_PX, top - 12, { size: 16, color: '#ff3a46', align: 'center' });
      PO.draw.text(ctx, 'WIN', CX + P.WIN_PX, top - 12, { size: 16, color: '#ff3a46', align: 'center' });
    }

    // 綱: 各選手の手(綱の端)を通る線。選手より奥に描くので、手に持った綱の絵とつながって見える
    function ropePoints(ended) {
      if (ended) {
        // 決着後は綱を地面に落とす
        const y = footY - 3;
        return [
          [CX + st.p - 300, y],
          [CX + st.p + 300, y],
        ];
      }
      const pts = [];
      const left = team.filter((m) => m.side < 0).sort((a, b) => b.slot - a.slot);
      const right = team.filter((m) => m.side > 0).sort((a, b) => a.slot - b.slot);
      const lb = left[0];
      const rb = right[right.length - 1];
      // 綱の余り: 後ろの人の手から体の後ろへ水平に通し(体に隠れる)、背中の後ろで地面へ垂らす
      const tail = (m) => {
        const f = frameOf(m);
        const back = PO.chars.pullRope(m.charId, f).dx + 34; // 綱の端から背中の後ろまで
        const y = ropeY(m, f);
        return [
          [handX(m) + m.side * (back + 46), footY - 5],
          [handX(m) + m.side * back, y + 2],
        ];
      };
      pts.push(...tail(lb));
      left.forEach((m) => pts.push([handX(m), ropeY(m, frameOf(m))]));
      right.forEach((m) => pts.push([handX(m), ropeY(m, frameOf(m))]));
      pts.push(...tail(rb).reverse());
      return pts;
    }
    function drawRope(ctx, ended) {
      const pts = ropePoints(ended);
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      };
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#3a2410'; // 縁
      ctx.lineWidth = 8;
      path();
      ctx.stroke();
      ctx.strokeStyle = '#e0ae5a'; // 麻の色(手に持った綱の絵に合わせる)
      ctx.lineWidth = 5;
      path();
      ctx.stroke();
      ctx.strokeStyle = '#9a6a28'; // より目の斜線(点線で表す)
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 5]);
      ctx.lineDashOffset = -st.p; // 綱と一緒に動く
      path();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 綱の中央の赤い目印
    function drawMark(ctx, ended) {
      const x = CX + st.p;
      // 目印の高さ: 前の 2 人の手を結ぶ線の上
      let y = footY - 3;
      if (!ended) {
        const a = team.find((m) => m.side < 0 && m.slot === 0);
        const b = team.find((m) => m.side > 0 && m.slot === 0);
        const ya = ropeY(a, frameOf(a));
        const yb = ropeY(b, frameOf(b));
        const xa = handX(a);
        const xb = handX(b);
        y = ya + ((yb - ya) * (x - xa)) / (xb - xa);
      }
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(x) - 6, Math.round(y) - 4, 12, 26);
      ctx.fillStyle = '#ff2030';
      ctx.fillRect(Math.round(x) - 4, Math.round(y) - 2, 8, 22);
      ctx.fillStyle = '#ff8a8a';
      ctx.fillRect(Math.round(x) - 4, Math.round(y) - 2, 3, 22);
    }

    // タイミングゲージ(描画はファイル上部の paintGauge。操作説明のデモでも同じものを使う)
    function drawGauge(ctx) {
      const active = st.phase === 'pull';
      const locked = active && strokeOf(st.pullT) === st.lockedStroke; // 押せない間だけ暗くする(片道ごと。折り返しで元に戻る)
      paintGauge(ctx, P.GAUGE, {
        pos: active ? gaugePos(st.pullT) : 0,
        locked,
        judge: st.judge,
        hint: active ? (locked ? 'WAIT...' : 'ENTER / ACTION') : null,
      });
    }

    // 電光掲示板: 競技中 = 種目名・スコア・残り時間・目印の位置、決着 = 勝ったチームの 2 人
    const fmtTime = (t) => (t < 10 ? '0' : '') + Math.max(0, t).toFixed(2);
    function boardLines() {
      if (st.winner) {
        const w = team.filter((m) => m.side === st.winner).sort((a, b) => a.slot - b.slot);
        return [
          { text: 'WINNER !!', dot: 5, blink: true },
          { text: PO.chars.byId(w[0].charId).name, dot: 4 },
          { text: PO.chars.byId(w[1].charId).name, dot: 4 },
          { text: st.winner < 0 ? 'LEFT TEAM' : 'RIGHT TEAM', dot: 3 },
        ];
      }
      const started = st.phase === 'pull';
      const m = Math.abs(st.p) / C.PX_PER_M;
      const mark = Math.abs(st.p) < 0.5 ? 'CENTER' : (st.p < 0 ? 'LEFT ' : 'RIGHT ') + m.toFixed(1) + 'm';
      return [
        { text: 'TUG OF WAR', dot: 4 },
        { left: 'SCORE', right: PO.score.text(PO.score.current), dot: 3 }, // 累積スコア(1UP。競技の点はリザルトで加える)
        { text: st.overtimes ? 'OVERTIME' : 'TIME', dot: 3 },
        { text: fmtTime(started ? st.limit - st.pullT : st.limit), dot: 9 },
        { text: 'MARK  ' + mark, dot: 4 },
      ];
    }

    // HUD: 残り時間・自己ベスト・目印の位置のメーター
    function drawHud(ctx) {
      ctx.fillStyle = '#10122e';
      ctx.fillRect(0, 0, C.W, C.HUD_H);
      ctx.fillStyle = '#ff2fa8';
      ctx.fillRect(0, C.HUD_H - 4, C.W, 4);
      const best = PO.records.get('tug');
      const left = st.phase === 'pull' ? st.limit - st.pullT : st.phase === 'end' ? st.limit - (st.endTime || 0) : st.limit;
      PO.draw.text(ctx, 'TIME', 16, 26, { size: 18, color: '#ffe600', outline: null });
      PO.draw.text(ctx, Math.max(0, left).toFixed(2), 88, 26, { size: 30, color: '#fff' });
      PO.draw.text(ctx, 'BEST', 256, 26, { size: 18, color: '#ffe600', outline: null });
      PO.draw.text(ctx, best ? best.value.toFixed(2) : '--.--', 328, 26, { size: 30, color: '#fff' });
      PO.draw.text(ctx, 'YOU: LEFT TEAM', C.W - 16, 26, { size: 22, color: '#ffe600', align: 'right' });
      // 目印のメーター(左右の端が勝敗判定ライン)
      const bx = 16;
      const bw = C.W - 32;
      ctx.fillStyle = '#3a3d6e';
      ctx.fillRect(bx, 56, bw, 6);
      ctx.fillStyle = '#ff3a46';
      ctx.fillRect(bx, 50, 4, 18);
      ctx.fillRect(bx + bw - 4, 50, 4, 18);
      ctx.fillStyle = '#fff';
      ctx.fillRect(bx + bw / 2 - 1, 50, 3, 18);
      const mx = bx + bw / 2 + (st.p / P.WIN_PX) * (bw / 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(mx - 8, 51, 16, 16);
      ctx.fillStyle = '#ff2030';
      ctx.fillRect(mx - 6, 53, 12, 12);
    }

    // リザルト: 勝ったチーム = 1 位(記録 = 決着までの時間)、負けたチーム = 2 位(LOSE)
    function result() {
      const order = team.slice().sort((a, b) => (a.side === st.winner ? 0 : 1) - (b.side === st.winner ? 0 : 1) || a.slot - b.slot);
      return {
        entries: order.map((m) => {
          const win = m.side === st.winner;
          return { charId: m.charId, isPlayer: m.isPlayer, value: win ? st.endTime : null, label: win ? null : 'LOSE', rank: win ? 1 : 2 };
        }),
        playerValue: player.side === st.winner ? st.endTime : null,
      };
    }

    function snapshot() {
      const cycle = Math.floor(st.pullT / P.GAUGE_PERIOD);
      return {
        phase: st.phase,
        t: st.t,
        pullT: st.pullT,
        limit: st.limit,
        overtimes: st.overtimes,
        p: st.p,
        u: st.u,
        gauge: { pos: st.phase === 'pull' ? gaugePos(st.pullT) : 0, cycle, stroke: strokeOf(st.pullT), dir: strokeOf(st.pullT) % 2 === 0 ? 1 : -1, locked: st.phase === 'pull' && strokeOf(st.pullT) === st.lockedStroke },
        judge: st.judge ? st.judge.name : null,
        winner: st.winner,
        endTime: st.endTime,
        timeUp: st.timeUp,
        msg: st.msg,
        done: st.done,
        board: { mode: st.winner ? 'winner' : 'race', lines: boardLines().map((l) => (l.text != null ? l.text : l.left + ' ' + l.right)) },
        team: team.map((m) => ({
          charId: m.charId,
          side: m.side,
          slot: m.slot,
          isPlayer: m.isPlayer,
          judges: Object.assign({}, m.judges),
          frame: st.phase === 'end' ? 'pose_' + (m.side === st.winner ? 'goal' : 'lose') : 'pull' + frameOf(m),
          handX: handX(m),
          ropeY: ropeY(m, frameOf(m)),
        })),
      };
    }

    // テスト用: ゲージのカーソルが中央に来るまでの秒(押すタイミングの計算に使う)
    function untilCenter() {
      const u = (st.pullT / P.GAUGE_PERIOD) % 1;
      const targets = [0.25, 0.75];
      let best = Infinity;
      targets.forEach((tg) => {
        let d = tg - u;
        if (d < 0) d += 1;
        best = Math.min(best, d * P.GAUGE_PERIOD);
      });
      return best;
    }

    return {
      update,
      render,
      result,
      snapshot,
      untilCenter,
      get done() {
        return st.done;
      },
    };
  }

  PO.events.register({ id: 'tug', create, judgeAt, gaugePos, strokeOf, paintGauge });
})();
