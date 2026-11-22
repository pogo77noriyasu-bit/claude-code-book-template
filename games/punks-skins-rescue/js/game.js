// PUNKS & SKINS RESCUE: ゲームの進行(状態と規則だけ。描画・音・キー入力は持たない)
// 落ちてくる人の種類と味方・敵ごとの判定は js/characters.js(PSR.characters・PSR.SIDES)。ここでは判定の結果(bounce / miss / safe)だけを扱う
// 状態: 'title' | 'playing' | 'stageclear' | 'club' | 'gameover'(GAME OVER は GAMEOVER_T のあと自動で 'title' へ)
window.PSR = window.PSR || {};

PSR.game = (function () {
  const C = PSR.config;

  // 種(seed)つき乱数(テストで同じ流れを再現できるように)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const laneX = (i) => C.LANE_X0 + i * C.LANE_DX;

  // 受け止める地点の並び(最初の地点から BOUNCE_STEP ずつ右へ、LANES の中に収まるまで)
  function targetsFrom(first) {
    const list = [];
    for (let l = first; l < C.LANES; l += C.BOUNCE_STEP) list.push(l);
    return list;
  }

  function create(seed) {
    return {
      state: 'title',
      score: 0,
      miss: 0,
      frame: 0,
      rescued: 0, // ゲーム全体の救助人数
      stage: 1,
      stageRescued: 0, // このステージで救助した味方の人数(stageNeed(stage) 人でステージクリア)
      clearT: 0, // STAGE CLEAR! の残り時間
      clubT: 0, // キャバクラ演出の残り時間
      overT: 0, // GAME OVER の残り時間(0 になったらタイトルへ)
      titleLock: 0, // タイトルに戻った直後、ENTER を受け付けない残り時間
      high: null, // GAME OVER のときのハイスコアの記録結果 { best, rank, isNew }(js/highscore.js)
      rand: rng(seed == null ? Date.now() : seed),
      hostess: newHostess(),
      jumpers: [],
      nextId: 1,
      spawnTimer: C.T.firstDelay,
      effects: [], // 表示だけの演出(+100 など)
      events: [], // このステップで起きたこと(音を鳴らすため。main.js が読んで消す)
    };
  }

  function newHostess() {
    return { lane: C.START_LANE, x: laneX(C.START_LANE), dir: 1, walkT: 0, poseT: 0, dipT: 0 };
  }

  // 新しいゲームを始める(タイトルから。GAME OVER からは直接始めない)
  function start(g) {
    if (g.state !== 'title' || g.titleLock > 0) return false;
    g.state = 'playing';
    g.score = 0;
    g.miss = 0;
    g.rescued = 0;
    g.stage = 1;
    g.stageRescued = 0;
    g.clearT = 0;
    g.clubT = 0;
    g.hostess = newHostess();
    g.jumpers = [];
    g.effects = [];
    g.spawnTimer = C.T.firstDelay;
    g.overT = 0;
    g.high = null;
    g.events.push('start');
    return true;
  }

  // GAME OVER にする。ハイスコアはここで 1 回だけ記録する(同じゲームで 2 回呼ばれても記録しない)
  function gameOver(g) {
    if (g.state === 'gameover') return;
    g.state = 'gameover';
    g.overT = C.GAMEOVER_T;
    g.high = PSR.highscore ? PSR.highscore.submit({ score: g.score, stage: g.stage, rescued: g.rescued }) : null;
    g.events.push('gameover');
  }

  // GAME OVER のあと、タイトル画面へ戻る(得点などは次の start で初期化する)
  function toTitle(g) {
    g.state = 'title';
    g.overT = 0;
    g.jumpers = [];
    g.effects = [];
    g.titleLock = C.TITLE_LOCK;
    g.events.push('title');
  }

  // ---- 難易度(ステージと、そのステージでの救助人数から計算する。数値は config.js の STAGES) ----
  const lerp = (a, b, u) => a + (b - a) * u;
  // ステージ n の同時人数 [開始時, 終盤](STAGE_MAX。表より先は STAGE_MAX_AFTER で増やす。上限 MAX_JUMPERS)
  function stageMax(n) {
    if (n <= C.STAGE_MAX.length) return C.STAGE_MAX[n - 1].map((v) => Math.min(C.MAX_JUMPERS, v));
    const last = C.STAGE_MAX[C.STAGE_MAX.length - 1];
    const k = n - C.STAGE_MAX.length;
    const A = C.STAGE_MAX_AFTER;
    return [Math.min(C.MAX_JUMPERS, last[0] + k * A.startPlus), Math.min(C.MAX_JUMPERS, last[1] + k * A.endPlus)];
  }
  // ステージ n の設定(出現の間隔・落下の速さは STAGES。5 以降はステージ 4 から少しずつ厳しくする)
  function stageTable(n) {
    const max = stageMax(n);
    if (n <= C.STAGES.length) return { ...C.STAGES[n - 1], max };
    const last = C.STAGES[C.STAGES.length - 1];
    const k = n - C.STAGES.length;
    const A = C.STAGE_AFTER;
    return {
      max,
      interval: last.interval.map((v) => Math.max(A.intervalMin, v - k * A.intervalMinus)),
      speed: last.speed.map((v) => Math.min(A.speedMax, v + k * A.speedPlus)),
    };
  }
  // ステージ n のクリアに必要な救助人数(config.js の STAGE_NEED。15 / 20 / 21, 22, … / 上限 50)
  function stageNeed(n) {
    const N = C.STAGE_NEED;
    if (!N) return C.STAGE_RESCUE;
    let need = N.STEPS[0][1];
    for (const [from, v] of N.STEPS) if (n >= from) need = v;
    if (n > N.PER_STAGE_FROM) need += (n - N.PER_STAGE_FROM) * N.PER_STAGE;
    return Math.min(N.MAX, need);
  }

  // 今の難易度: { max(同時に出せる人数), interval(出現の間隔), speed(落下の速さの倍率), progress(0〜1) }
  //   ステージの中の上がり方は、クリア人数ではなく基準の STAGE_RESCUE(15 人)で決める(クリア人数が増えても難易度の計算は前と同じ)
  function difficulty(g) {
    const t = stageTable(g.stage);
    const u = Math.max(0, Math.min(1, g.stageRescued / Math.max(1, C.STAGE_RESCUE - 1)));
    return {
      max: Math.min(C.MAX_JUMPERS, Math.round(lerp(t.max[0], t.max[1], u))), // 段階的(整数)
      interval: Math.round(lerp(t.interval[0], t.interval[1], u)), // 滑らか
      speed: lerp(t.speed[0], t.speed[1], u), // 滑らか
      progress: u,
    };
  }
  // 放物線の時間を、その人の落下の速さで縮める(最低 20 ステップ)。速さは出てきたときに決めて変えない
  // (途中で難易度が上がっても、その人の到着の時刻が変わらないように。到着の予定 catchEvents が狂わない)
  const arcTimeFor = (j, T) => Math.max(20, Math.round(T / j.speed));

  // ステージクリア: 落ちている途中の人は片づけ(MISS にも救助にもしない)、STAGE CLEAR! を出す
  function stageClear(g) {
    g.state = 'stageclear';
    g.clearT = isClubStage(g.stage) ? C.CLUB.CLEAR_T : C.T.stageClear; // キャバクラ演出があるステージは短く
    g.clubT = 0;
    g.jumpers = [];
    g.events.push('stageclear');
  }
  // キャバクラ演出(js/club.js)を出すステージか: 3 ステージクリアごと(STAGE 3・6・9…)。設定は config.js の CLUB
  const isClubStage = (stage) => !!(C.CLUB && C.CLUB.ENABLED && stage % C.CLUB.EVERY === 0);
  // 次のステージへ(得点・MISS・救助人数の合計は引き継ぐ)
  function nextStage(g) {
    g.stage++;
    g.stageRescued = 0;
    g.state = 'playing';
    g.jumpers = [];
    g.spawnTimer = C.T.firstDelay;
    g.overT = 0;
    g.high = null;
    g.events.push('start');
    return true;
  }

  // GAME OVER にする。ハイスコアはここで 1 回だけ記録する(同じゲームで 2 回呼ばれても記録しない)
  function gameOver(g) {
    if (g.state === 'gameover') return;
    g.state = 'gameover';
    g.overT = C.GAMEOVER_T;
    g.high = PSR.highscore ? PSR.highscore.submit({ score: g.score, stage: g.stage, rescued: g.rescued }) : null;
    g.events.push('gameover');
  }

  // GAME OVER のあと、タイトル画面へ戻る(得点などは次の start で初期化する)
  function toTitle(g) {
    g.state = 'title';
    g.overT = 0;
    g.jumpers = [];
    g.effects = [];
    g.titleLock = C.TITLE_LOCK;
    g.events.push('title');
  }

  // 1 地点動く(dir = -1 / +1)。端ではそれ以上動かない
  function move(g, dir) {
    if (g.state !== 'playing') return false;
    const h = g.hostess;
    const lane = Math.max(0, Math.min(C.LANES - 1, h.lane + dir));
    h.dir = dir;
    if (lane === h.lane) return false;
    h.lane = lane;
    g.events.push('move');
    return true;
  }

  // 窓から人を出す。opts(テスト用): { kind, first, window }
  // 窓に出ている(まだ飛び降りていない)人がいない窓の番号
  const freeWindows = (g) => C.WINDOWS.map((_, i) => i).filter((i) => !g.jumpers.some((o) => o.phase === 'appear' && o.wi === i));

  // 窓から人を出す(そのまま出す。テストで状況を作るときにも使う)。opts: { kind, first, window, appear }
  function spawn(g, opts) {
    opts = opts || {};
    const kind = opts.kind || C.KINDS[Math.floor(g.rand() * C.KINDS.length)];
    const first = opts.first != null ? opts.first : C.FIRST_LANES[Math.floor(g.rand() * C.FIRST_LANES.length)];
    // 窓: 窓に出ている(まだ飛び降りていない)人がいる窓は使わない(重ならないように)
    let wi = opts.window;
    if (wi == null) {
      const free = freeWindows(g);
      if (!free.length) return null; // どの窓もふさがっている → あとで出す
      wi = free[Math.floor(g.rand() * free.length)];
    }
    const j = makeJumper(g, kind, first, wi, opts.appear || C.T.appear);
    g.nextId++;
    g.jumpers.push(j);
    g.events.push('appear');
    return j;
  }

  // 落ちてくる人を 1 人作る(まだ画面には入れない)。appearT = 窓に出ている時間(ステップ)
  function makeJumper(g, kind, first, wi, appearT) {
    const side = PSR.characters.get(kind).side; // ally(味方)/ enemy(敵)
    const w = C.WINDOWS[wi];
    return {
      id: g.nextId, // 番号は画面に入れるときに進める(spawn / spawnPlanned)
      kind,
      side,
      phase: 'appear', // appear → arc(担架へ / 救急車へ)→ done、受け止めそこねたら fall → lie → done(敵を受け止めたら lie → done)
      t: 0,
      wi, // 出てきた窓の番号
      x: w.x,
      y: w.y,
      targets: targetsFrom(first),
      idx: 0, // 次に受け止める targets の番号
      catches: 0,
      arc: null,
      appearT, // 窓に出ている時間(到着の時刻をずらすため、人ごとに変えられる)
      speed: difficulty(g).speed, // 落下の速さの倍率(出てきたときの難易度で決めて変えない)
    };
  }

  // ---- 救助できる落下の組み合わせだけを出す(2026-11-22) ----
  // それぞれの人が担架の高さに着く予定(時刻 = g.frame で数えたステップ、地点)。
  // 味方は残りの受け止め地点すべて(全部受け止めると仮定)、敵は次の 1 回だけ(受け止めたらそこで終わり)
  function catchEvents(g, j) {
    const T1 = arcTimeFor(j, C.T.firstFall);
    const Tb = arcTimeFor(j, C.T.bounce);
    let t;
    let k;
    if (j.phase === 'appear') {
      t = g.frame + (j.appearT - j.t) + T1;
      k = 0;
    } else if (j.phase === 'arc' && j.arc.kind === 'catch') {
      t = g.frame + (j.arc.T - j.arc.t);
      k = j.idx;
    } else return []; // 救急車へ向かっている・落ちた・倒れている人は、もう担架の予定がない
    const last = j.side === 'enemy' ? k : j.targets.length - 1;
    const out = [];
    for (let i = k; i <= last; i++) {
      out.push({ t, lane: j.targets[i], side: j.side, id: j.id });
      t += Tb;
    }
    return out;
  }

  // この人たちの予定で、プレイヤーが正しく動けば味方を全員受け止められ、敵を避けられるか
  //   - 味方の受け止めを時刻の順にたどり、1 地点動くのに PLAN.STEPS_PER_LANE ステップ + 動き出すまでの PLAN.REACTION ステップで間に合うか
  //   - 同じ時刻に違う地点の味方がいたら無理
  //   - 敵: 同じ地点で、味方の受け止めと PLAN.ENEMY_GAP ステップ以内に重なったら無理(味方を受け止めると敵も受け止めてしまう)。
  //     同じ地点の味方の受け止めの間に敵が来るときは、いったん離れて戻る時間が要る。通り道の地点に敵が着くときは、待ってよける時間が要る
  //   - 最初の位置は今の担架の位置。relaxed = true のときだけ、最初の予定の地点から数える
  //     (すでにプレイヤーが遅れていて今の位置からは間に合わないとき、新しい人で「さらに」無理にならないかを見るため)
  function plannable(g, list, relaxed) {
    const P = C.PLAN;
    const events = list.flatMap((j) => catchEvents(g, j));
    const allies = events.filter((e) => e.side === 'ally').sort((a, b) => a.t - b.t);
    const enemies = events.filter((e) => e.side === 'enemy');
    const need = (from, to) => (from === to ? 0 : Math.abs(to - from) * P.STEPS_PER_LANE + P.REACTION);
    // 2 つの受け止めの間に、通り道の地点へ敵が着くなら、待ってよけるだけの余裕(ENEMY_GAP)も要る
    const crossesEnemy = (fromLane, fromT, toLane, toT) =>
      enemies.some((en) => en.t > fromT && en.t < toT && en.lane > Math.min(fromLane, toLane) && en.lane < Math.max(fromLane, toLane));
    const chain = (pos, t, i0) => {
      for (let i = i0; i < allies.length; i++) {
        const e = allies[i];
        let n = need(pos, e.lane);
        if (crossesEnemy(pos, t, e.lane, e.t)) n += P.ENEMY_GAP;
        if (e.t - t < n) return false;
        pos = e.lane;
        t = e.t;
      }
      return true;
    };
    for (const en of enemies) {
      for (const a of allies) if (a.lane === en.lane && Math.abs(a.t - en.t) < P.ENEMY_GAP) return false;
      for (let i = 1; i < allies.length; i++) {
        const a = allies[i - 1];
        const b = allies[i];
        if (a.lane === en.lane && b.lane === en.lane && a.t < en.t && en.t < b.t && b.t - a.t < 2 * (P.STEPS_PER_LANE + P.REACTION)) return false;
      }
    }
    if (!allies.length) return true;
    return relaxed ? chain(allies[0].lane, allies[0].t, 1) : chain(g.hostess.lane, g.frame, 0);
  }

  // 自動の出現: 救助できる組み合わせになるよう、最初の地点と窓に出ている時間(到着の時刻)を選んで出す。
  // どの組み合わせでも無理なら出さない(null。少し待ってからもう一度)
  function spawnPlanned(g) {
    const free = freeWindows(g);
    if (!free.length) return null;
    const kind = C.KINDS[Math.floor(g.rand() * C.KINDS.length)];
    const wi = free[Math.floor(g.rand() * free.length)];
    // 最初の地点を試す順番(乱数で並べる)
    const lanes = C.FIRST_LANES.slice();
    for (let i = lanes.length - 1; i > 0; i--) {
      const k = Math.floor(g.rand() * (i + 1));
      [lanes[i], lanes[k]] = [lanes[k], lanes[i]];
    }
    const P = C.PLAN;
    const baseOk = plannable(g, g.jumpers);
    for (let extra = 0; extra <= P.MAX_EXTRA_WAIT; extra += P.WAIT_STEP) {
      for (const first of lanes) {
        const cand = makeJumper(g, kind, first, wi, C.T.appear + extra);
        // 今の担架の位置から全員に間に合うか。今の状態がすでに無理(プレイヤーが遅れている)なら、
        // 最初の予定の地点から数えて、新しい人で「さらに」無理にならないことを見る
        const list = g.jumpers.concat([cand]);
        if (baseOk ? plannable(g, list) : plannable(g, list, true)) {
          g.nextId++;
          g.jumpers.push(cand);
          g.events.push('appear');
          return cand;
        }
      }
    }
    return null;
  }

  // 放物線(x は等速、y は直線 + 山なり)。u = 0〜1
  function startArc(j, x1, y1, T, H, kind) {
    j.arc = { x0: j.x, y0: j.y, x1, y1, T, H, kind, t: 0 };
    j.phase = 'arc';
  }
  function arcPos(a, u) {
    return {
      x: a.x0 + (a.x1 - a.x0) * u,
      y: a.y0 + (a.y1 - a.y0) * u - 4 * a.H * u * (1 - u),
    };
  }

  // 倒れて(伸びて)止まる。result: 'miss'(lie のあと MISS +1)/ 'safe'(何も起きない)
  function lieDown(g, j, y, result) {
    j.y = y;
    j.phase = 'lie';
    j.t = 0;
    j.result = result;
    g.effects.push({ type: result, x: j.x, y: y - 80, t: 0, life: C.T.lie });
    g.events.push(result); // 'miss' / 'safe' の音
  }

  function stepJumper(g, j) {
    j.t++;
    if (j.phase === 'appear') {
      if (j.t >= j.appearT) {
        startArc(j, laneX(j.targets[0]), C.CATCH_Y, arcTimeFor(j, C.T.firstFall), C.T.firstHop, 'catch');
        g.events.push('jump');
      }
      return;
    }
    if (j.phase === 'arc') {
      const a = j.arc;
      a.t++;
      const p = arcPos(a, Math.min(1, a.t / a.T));
      j.x = p.x;
      j.y = p.y;
      if (a.t < a.T) return;
      if (a.kind === 'final') {
        // 救急車に到着 → 救助成功
        j.phase = 'done';
        g.score += C.SCORE_RESCUE;
        g.rescued++;
        g.stageRescued++;
        g.effects.push({ type: 'rescued', x: C.AMBULANCE.x, y: C.AMBULANCE.y - 70, t: 0, life: C.T.rescuedShow });
        g.events.push('rescue');
        return;
      }
      // 担架の高さに来た: キャバ嬢がその地点にいれば受け止める(その結果は味方・敵の判定 PSR.SIDES で決まる)
      const lane = j.targets[j.idx];
      const rule = PSR.SIDES[j.side];
      if (g.hostess.lane === lane) {
        j.catches++;
        j.idx++;
        g.hostess.poseT = C.T.rescuePose;
        g.hostess.dipT = 8;
        if (rule.catch === 'bounce') {
          // 味方: 跳ね返して次の地点へ。最後は救急車へ
          g.events.push('catch');
          if (j.idx < j.targets.length) {
            startArc(j, laneX(j.targets[j.idx]), C.CATCH_Y, arcTimeFor(j, C.T.bounce), C.T.bounceH, 'catch');
          } else {
            startArc(j, C.AMBULANCE.x, C.AMBULANCE.y, arcTimeFor(j, C.T.final), C.T.finalH, 'final');
          }
        } else {
          // 敵を受け止めてしまった: 担架の上で伸びて、lie のあと MISS
          lieDown(g, j, C.CATCH_Y, rule.catch);
        }
      } else {
        // 受け止めそこねた → そのまま地面へ落ちる(地面に着いたときの結果は rule.drop)
        j.phase = 'fall';
        j.vy = 6;
        j.missLane = lane;
      }
      return;
    }
    if (j.phase === 'fall') {
      j.vy += C.T.fallGravity;
      j.y += j.vy;
      if (j.y >= C.GROUND_Y) lieDown(g, j, C.GROUND_Y, PSR.SIDES[j.side].drop);
      return;
    }
    if (j.phase === 'lie') {
      if (j.t >= C.T.lie) {
        j.phase = 'done';
        if (j.result === 'miss') {
          g.miss++; // MISS は味方・敵で共通のカウンター
          if (g.miss >= C.MAX_MISS) gameOver(g);
        }
      }
    }
  }

  // 1 ステップ進める
  function step(g) {
    g.frame++;
    const h = g.hostess;
    // 見た目の位置を論理上の地点へ近づける(判定は地点 h.lane で行う)
    const tx = laneX(h.lane);
    const sp = C.LANE_DX / C.T.slide;
    if (Math.abs(tx - h.x) <= sp) h.x = tx;
    else h.x += Math.sign(tx - h.x) * sp;
    h.walkT = h.x !== tx ? h.walkT + 1 : 0;
    if (h.poseT > 0) h.poseT--;
    if (h.dipT > 0) h.dipT--;

    for (const e of g.effects) e.t++;
    g.effects = g.effects.filter((e) => e.t < e.life);

    if (g.titleLock > 0) g.titleLock--;
    // GAME OVER の表示中: 時間が来たらタイトル画面へ(入力では再開しない)
    if (g.state === 'gameover') {
      if (--g.overT <= 0) toTitle(g);
      return;
    }
    // STAGE CLEAR! の表示中: 時間が来たら次のステージへ
    if (g.state === 'stageclear') {
      if (--g.clearT <= 0) {
        // 3 ステージごとは、STAGE CLEAR! のあとキャバクラ演出(state 'club')をはさむ。ほかはすぐ次のステージへ
        if (isClubStage(g.stage)) {
          g.state = 'club';
          g.clubT = C.CLUB.T;
          g.events.push('club');
        } else nextStage(g);
      }
      return;
    }
    // キャバクラ演出の表示中: 時間が来たら次のステージへ(操作は不要。得点・MISS は変えない)
    if (g.state === 'club') {
      if (--g.clubT <= 0) nextStage(g);
      return;
    }
    if (g.state !== 'playing') return;

    // 落ちている人は 1 人ずつ独立に動かす(出現の時刻・位置・状態はそれぞれが持つ)
    for (const j of g.jumpers) {
      stepJumper(g, j);
      if (g.state !== 'playing') break; // GAME OVER
    }
    if (g.state !== 'playing') return;
    const before = g.jumpers.length;
    g.jumpers = g.jumpers.filter((j) => j.phase !== 'done');
    // 画面から誰もいなくなったら、少し間をあける
    if (g.jumpers.length < before && g.jumpers.length === 0) g.spawnTimer = Math.max(g.spawnTimer, C.T.nextDelay);
    // このステップで救助して、ステージクリアの人数に届いた
    if (g.stageRescued >= stageNeed(g.stage)) {
      stageClear(g);
      return;
    }

    // 次の人を出す: 出現の間隔ごとに 1 人。画面にいる人数が今の上限(max)に届いていたら待つ
    if (g.spawnTimer > 0) g.spawnTimer--;
    if (g.spawnTimer <= 0 && g.jumpers.length < difficulty(g).max) {
      g.spawnTimer = (C.PLAN.ENABLED ? spawnPlanned(g) : spawn(g)) ? difficulty(g).interval : C.T.spawnRetry;
    }
  }

  return { create, start, gameOver, toTitle, stageNeed, move, spawn, spawnPlanned, step, laneX, targetsFrom, arcPos, difficulty, stageTable, stageClear, nextStage, isClubStage, catchEvents, plannable };
})();
