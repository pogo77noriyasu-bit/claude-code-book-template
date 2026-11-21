// 乱入キャラクター(パトカー・軽機関銃装備ジープ・軽武装戦車・重戦車)。追加修正②
// 流れ:
//   enter … ワープ通路の端の外から、通路のいちばん端のマスまでまっすぐ入ってくる
//   roam  … config.intruder.stay ステップのあいだ、交差点ででたらめに曲がって迷路を巡回する
//   leave … いちばん近いワープ通路の端(出口)へ向かう(出口までの距離の表を下る)
//   exit  … 出口の端から外へまっすぐ出て、見えなくなったら消える
// 攻撃(ジープ・戦車): マスの中心で、主人公が同じ行・列にいて、あいだに壁がなく、range マス以内なら止まって構える
//   (windup ステップの予備動作。構えた向きは変えないので、列・行から外れればよけられる)。そのあと撃つ。
//   弾は壁に当たると消える(砲弾はそこで爆発する)。爆風は壁の向こうには届かない。
// 当たり判定(主人公へのダメージ・撃破)は game.js が hits() を使って行う。撃破の爆発(booms)には当たり判定がない。
NP.intruders = (function () {
  const cfg = NP.config;
  const IC = cfg.intruder;
  const T = cfg.TILE;
  const M = NP.move;
  const Z = NP.maze;
  const ORDER = ['up', 'left', 'down', 'right'];
  // 車両ごとの効果音の名前(js/audio.js の SOUNDS。追加修正⑦)
  //   enter: 登場 / charge: 攻撃準備(予備動作のあいだくり返す) / fire: 発射 / impact: 砲弾の着弾(爆風)
  const SOUND = {
    patrol: { enter: 'siren' },
    jeep: { enter: 'enterJeep', charge: 'chargeJeep', fire: 'gun' },
    lightTank: { enter: 'enterLight', charge: 'chargeLight', fire: 'cannonLight', impact: 'blastSmall' },
    heavyTank: { enter: 'enterHeavy', charge: 'chargeHeavy', fire: 'cannonHeavy', impact: 'blastBig' },
  };
  // その車両の間隔・巡回の長さ(追加修正⑥。types になければ共通の値)
  const intervalOf = (type) => IC.types[type].interval || IC.interval;
  const stayOf = (def) => def.stay || IC.stay;

  // 面 stage に出てくる種類(出なければ null)
  function typeFor(stage) {
    let type = null;
    for (const row of IC.byStage) if (stage >= row.from) type = row.type;
    return type;
  }

  // 出口(ワープ通路の両端のマス)までの距離の表。迷路は変わらないので最初に 1 回だけ作る
  let exitDist = null;
  function buildExitDist() {
    const d = [];
    for (let r = 0; r < cfg.ROWS; r++) d.push(new Array(cfg.COLS).fill(Infinity));
    const q = [];
    for (const c of [0, cfg.COLS - 1]) {
      d[cfg.WARP_ROW][c] = 0;
      q.push([c, cfg.WARP_ROW]);
    }
    while (q.length) {
      const [c, r] = q.shift();
      for (const dir of ORDER) {
        const nc = c + M.DIRS[dir][0];
        const nr = r + M.DIRS[dir][1];
        if (nc < 0 || nc >= cfg.COLS || !Z.playerCan(nc, nr)) continue; // 出口の表ではワープ通路を通り抜けない
        if (d[nr][nc] <= d[r][c] + 1) continue;
        d[nr][nc] = d[r][c] + 1;
        q.push([nc, nr]);
      }
    }
    return d;
  }

  // 面の始め・ミスのあと: 乱入キャラクター・弾・爆風を消す。
  // 次の登場までの時間は、面の始め(newStage = true)だけ最初の 1 台までの時間(first)に戻し、
  // ミスのあとはそのまま引き継ぐ(追加修正⑤)
  function reset(g, newStage) {
    g.intruders = [];
    g.shots = [];
    g.blasts = [];
    if (newStage) g.intruderTimer = IC.first;
    if (!g.booms) g.booms = [];
  }

  // 種類 type の車両を出す。side: 'left' | 'right'(省略すると乱数)
  function spawn(g, type, side) {
    const def = IC.types[type];
    if (!def) return null;
    side = side || (g.rand() < 0.5 ? 'left' : 'right');
    const v = {
      type,
      def,
      x: side === 'left' ? -T : Z.W + T,
      y: Z.centerY(cfg.WARP_ROW),
      dir: side === 'left' ? 'right' : 'left',
      face: side === 'left' ? 'right' : 'left',
      state: 'enter',
      t: 0, // 迷路の中にいるステップ数
      walk: 0,
      aim: null, // 構え中 { dir, timer }
      cooldown: 60, // 入ってすぐは撃たない
      burst: 0, // 機関銃の残りの弾数
      burstTimer: 0,
      exitDir: null,
      flash: 0, // 発射炎を出している残りステップ
    };
    g.intruders.push(v);
    NP.audio.play(SOUND[type].enter);
    return v;
  }

  // 車両 v から向き dir に、主人公まで壁なしで range マス以内か
  function lineToPlayer(v, g) {
    const p = g.player;
    const vc = Z.colOf(v.x);
    const vr = Z.rowOf(v.y);
    const pc = Z.colOf(p.x);
    const pr = Z.rowOf(p.y);
    let dir = null;
    let n = 0;
    if (vr === pr && vc !== pc) {
      dir = pc < vc ? 'left' : 'right';
      n = Math.abs(pc - vc);
    } else if (vc === pc && vr !== pr) {
      dir = pr < vr ? 'up' : 'down';
      n = Math.abs(pr - vr);
    }
    if (!dir || n > v.def.range) return null;
    const [dx, dy] = M.DIRS[dir];
    for (let k = 1; k < n; k++) if (!Z.playerCan(vc + dx * k, vr + dy * k)) return null;
    return dir;
  }

  // マスの中心での向き選び(巡回: でたらめ / 退場: 出口へ近づく向き)
  function choose(v, g) {
    const col = Z.colOf(v.x);
    const row = Z.rowOf(v.y);
    let opts = ORDER.filter((d) => d !== M.OPPOSITE[v.dir] && Z.playerCan(col + M.DIRS[d][0], row + M.DIRS[d][1]));
    if (opts.length === 0 && v.dir) opts = [M.OPPOSITE[v.dir]];
    if (opts.length === 0) return null;
    if (v.state === 'leave') {
      if (!exitDist) exitDist = buildExitDist();
      const dist = (d) => {
        const nc = col + M.DIRS[d][0];
        const nr = row + M.DIRS[d][1];
        return nc < 0 || nc >= cfg.COLS ? Infinity : exitDist[nr][nc];
      };
      return opts.reduce((a, d) => (dist(d) < dist(a) ? d : a));
    }
    return opts[Math.floor(g.rand() * opts.length)];
  }

  // 撃つ
  function fire(v, g) {
    const dir = v.aim.dir;
    if (v.def.attack === 'gun') {
      v.burst = v.def.burst;
      v.burstTimer = 0;
    } else {
      g.shots.push({ kind: 'shell', x: v.x, y: v.y, dir, speed: v.def.shotSpeed, dist: 0, range: v.def.range * T, def: v.def, type: v.type });
      NP.audio.play(SOUND[v.type].fire);
      v.flash = v.type === 'heavyTank' ? 14 : 10; // 砲口の発射炎
    }
    v.cooldown = v.def.cooldown;
  }

  function updateVehicle(v, g) {
    v.walk++;
    if (v.cooldown > 0) v.cooldown--;
    if (v.flash > 0) v.flash--;
    if (v.state === 'enter') {
      const edge = v.dir === 'right' ? Z.centerX(0) : Z.centerX(cfg.COLS - 1);
      const d = edge - v.x;
      v.x += Math.sign(d) * Math.min(Math.abs(d), v.def.speed);
      if (Math.abs(edge - v.x) < 1e-6) {
        v.x = edge;
        v.state = 'roam';
      }
      return;
    }
    if (v.state === 'exit') {
      v.x += (v.exitDir === 'right' ? 1 : -1) * v.def.speed;
      return;
    }
    v.t++;
    if (v.state === 'roam' && v.t >= stayOf(v.def)) v.state = 'leave';
    // 機関銃の連射中
    if (v.burst > 0) {
      if (v.burstTimer-- <= 0) {
        g.shots.push({ kind: 'bullet', x: v.x, y: v.y, dir: v.face, speed: v.def.shotSpeed, dist: 0, range: v.def.range * T, def: v.def, type: v.type });
        NP.audio.play(SOUND[v.type].fire);
        v.flash = 4; // 銃口の発射炎(1 発ごと)
        v.burst--;
        v.burstTimer = v.def.burstGap;
      }
      return;
    }
    // 構え(予備動作)
    if (v.aim) {
      // 予備動作のあいだ、一定の間隔で攻撃準備音をくり返す(最初の 1 回は構えた瞬間に鳴らしている)
      const elapsed = v.def.windup - v.aim.timer + 1;
      if (elapsed % IC.sound.chargeEvery === 0 && v.aim.timer > 1) NP.audio.play(SOUND[v.type].charge);
      if (--v.aim.timer <= 0) {
        fire(v, g);
        v.aim = null;
      }
      return;
    }
    M.advance(v, v.def.speed, (a) => {
      // 出口の端に着いた: 外へ出る
      if (a.state === 'leave' && Z.rowOf(a.y) === cfg.WARP_ROW) {
        const col = Z.colOf(a.x);
        if (col === 0 || col === cfg.COLS - 1) {
          a.exitDir = col === 0 ? 'left' : 'right';
          a.face = a.exitDir;
          a.state = 'exit';
          a.dir = null;
          return;
        }
      }
      // 攻撃できるなら止まって構える
      if (a.def.attack !== 'none' && a.cooldown <= 0) {
        const dir = lineToPlayer(a, g);
        if (dir) {
          a.aim = { dir, timer: a.def.windup };
          a.face = dir;
          a.dir = null;
          NP.audio.play(SOUND[a.type].charge);
          return;
        }
      }
      a.dir = choose(a, g);
    });
    if (v.dir) v.face = v.dir;
  }

  // 弾・砲弾を進める。壁に当たったら弾は消え、砲弾は爆発する
  function updateShots(g) {
    const keep = [];
    for (const s of g.shots) {
      const [dx, dy] = M.DIRS[s.dir];
      const px = s.x;
      const py = s.y;
      s.x = Z.wrapX(s.x + dx * s.speed);
      s.y += dy * s.speed;
      s.dist += s.speed;
      const wall = !Z.playerCan(Math.floor(s.x / T), Z.rowOf(s.y)); // x は wrapX 済みなので、いつも迷路の中の列
      if (wall || s.dist >= s.range) {
        if (s.kind === 'shell') explode(g, wall ? px : s.x, wall ? py : s.y, s.def, s.type);
        continue;
      }
      keep.push(s);
    }
    g.shots = keep;
  }

  // 砲弾の爆風(当たり判定あり)
  function explode(g, x, y, def, type) {
    g.blasts.push({ x, y, r: def.blast, t: def.blastSteps, life: def.blastSteps, hit: def.blastHit });
    NP.audio.play(SOUND[type].impact); // 軽武装戦車は小さな爆発音、重戦車は大きな爆発音
  }

  // 爆風の中心から点 (x, y) まで、壁にさえぎられずに届くか
  function blastReaches(b, x, y) {
    const dx = Z.dx(b.x, x);
    const dy = y - b.y;
    for (let k = 1; k <= 6; k++) {
      const sx = Z.wrapX(b.x + (dx * k) / 6);
      const sy = b.y + (dy * k) / 6;
      if (!Z.playerCan(Math.floor(sx / T), Z.rowOf(sy))) return false;
    }
    return true;
  }

  // 1 ステップ進める(プレイ中だけ呼ぶ)
  function update(g) {
    // 登場のタイマー(1 台ずつ。前の車両がまだいれば待つ)
    const type = typeFor(g.stage);
    if (type) {
      if (g.intruderTimer > 0) g.intruderTimer--;
      if (g.intruderTimer <= 0 && g.intruders.length === 0) {
        spawn(g, type);
        g.intruderTimer = intervalOf(type);
      }
    }
    for (const v of g.intruders) updateVehicle(v, g);
    g.intruders = g.intruders.filter((v) => !(v.state === 'exit' && (v.x < -T * 1.5 || v.x > Z.W + T * 1.5)));
    updateShots(g);
  }

  // 主人公に当たっているもの。{ body: [車両], shot: 弾, blast: 爆風 }
  function hits(g) {
    const p = g.player;
    const near = (x, y, d) => Math.hypot(Z.dx(p.x, x), p.y - y) < d;
    const out = { body: g.intruders.filter((v) => near(v.x, v.y, IC.hitDist)), shot: null, blast: null };
    for (const s of g.shots) {
      if (!near(s.x, s.y, 6)) continue;
      if (s.kind === 'shell') {
        // 砲弾の直撃: その場で爆発して、爆風に当たったことにする
        explode(g, s.x, s.y, s.def, s.type);
        out.blast = g.blasts[g.blasts.length - 1];
      } else out.shot = s;
      s.gone = true;
    }
    g.shots = g.shots.filter((s) => !s.gone);
    for (const b of g.blasts) {
      if (out.blast) break;
      if (b.life - b.t >= b.hit) continue; // 当たり判定があるのは出始めだけ
      if (near(b.x, b.y, b.r) && blastReaches(b, p.x, p.y)) {
        out.blast = b;
        break;
      }
    }
    return out;
  }

  // 撃破: 車両を消して、派手な爆発(破片・火の玉・煙)を出す。爆発には当たり判定がない
  const DEBRIS = {
    patrol: ['#ffffff', '#141414', '#ff2a2a', '#3a8cff'],
    jeep: ['#5a6a2a', '#3a4a1a', '#141414', '#8a8a8a'],
    lightTank: ['#5a6a2a', '#2a2a20', '#3a4a1a', '#8a8a8a'],
    heavyTank: ['#3c443a', '#202420', '#5a6458', '#8a8a8a'],
  };
  function destroy(g, v) {
    g.intruders = g.intruders.filter((o) => o !== v);
    const s = v.def.boom;
    const parts = [];
    const n = Math.round(14 * s);
    for (let i = 0; i < n; i++) {
      const a = g.rand() * Math.PI * 2;
      const sp = (0.8 + g.rand() * 1.8) * (0.8 + s * 0.3);
      const colors = DEBRIS[v.type];
      parts.push({ x: v.x, y: v.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: colors[i % colors.length], size: 2 + Math.floor(g.rand() * (1 + s)), spin: g.rand() < 0.5 });
    }
    const fires = [];
    for (let i = 0; i < Math.round(4 + 3 * s); i++) {
      fires.push({ dx: (g.rand() - 0.5) * 18 * s, dy: (g.rand() - 0.5) * 14 * s, delay: Math.floor(g.rand() * 10 * s), r: 5 + g.rand() * 4 * s });
    }
    const life = Math.round(50 + 20 * s);
    g.booms.push({ x: v.x, y: v.y, t: life, life, parts, fires, scale: s });
    g.shake = Math.round(8 * s);
    g.popups.push({ x: v.x, y: v.y, text: String(v.def.score), t: 90, life: 90, big: true });
    NP.audio.play(v.type === 'lightTank' || v.type === 'heavyTank' ? 'explodeBig' : 'explode');
  }

  // 爆発の演出を進める(どの状態でも動かす)
  function updateEffects(g) {
    if (!g.booms) return;
    for (const b of g.booms) {
      b.t--;
      for (const p of b.parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
      }
    }
    g.booms = g.booms.filter((b) => b.t > 0);
    if (g.shake > 0) g.shake--;
    // 砲弾の爆風の時間もここで進める(ミスの演出中も消えていく)
    if (g.blasts) {
      for (const b of g.blasts) b.t--;
      g.blasts = g.blasts.filter((b) => b.t > 0);
    }
  }

  return { SOUND, intervalOf, stayOf, typeFor, reset, spawn, update, hits, destroy, updateEffects, lineToPlayer, blastReaches };
})();
