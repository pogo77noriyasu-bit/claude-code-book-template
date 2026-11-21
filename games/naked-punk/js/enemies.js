// 敵(警察官 2 人・機動隊員 2 人)の動き
// 状態:
//   home    … 交番の中で待つ(上下に小さく揺れる)。timer が 0 になったら出る
//   leaving … 交番の出入口のまん中へ横に動き、そこから上の出口のマスへ出る
//   active  … 迷路を歩く。マスの中心に着くたびに次の向きを決める(来た道を引き返すのは行き止まりのときだけ)
// 向きの決め方(config.enemies の ai):
//   chase  … 主人公のいるマスを狙う
//   ambush … 主人公の進む向きの ahead マス先を狙う(先回り)
//   patrol … 交差点ででたらめに曲がる(不規則に巡回)
//   shy    … 主人公から near マスより遠ければ追いかけ、近づくと自分の持ち場(corner)へ離れていく
//   狙いどおりの向きを選ぶのは chase の割合だけ(残りはでたらめ)。これが追跡の頻度になる
// ビール中(fright)は主人公から遠ざかる向きを選び、遅くなる。倒されたら交番へ戻って respawn ステップ後に出る。
NP.enemies = (function () {
  const cfg = NP.config;
  const T = cfg.TILE;
  const M = NP.move;
  const Z = NP.maze;
  const ORDER = ['up', 'left', 'down', 'right']; // 同じ距離のときの優先順

  // シード付きの乱数(テストで再現できるように)
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
  }

  function create() {
    return cfg.enemies.map((def, i) => ({ i, def, x: 0, y: 0, dir: null, face: 'left', state: 'home', timer: 0, fright: false, walk: 0 }));
  }

  // 開始位置へ戻す(ゲーム開始・ミスのあと)
  function reset(list) {
    for (const e of list) {
      e.x = Z.centerX(e.def.start.col);
      e.y = Z.centerY(e.def.start.row);
      e.fright = false;
      e.walk = 0;
      const outside = Z.enemyCan(e.def.start.col, e.def.start.row);
      e.state = outside ? 'active' : 'home';
      e.dir = outside ? 'left' : null;
      e.face = 'left';
      e.timer = e.def.release;
    }
  }

  // 倒された: 交番の中へ戻して、しばらく待ってから出る
  function arrest(e) {
    e.state = 'home';
    e.x = Z.centerX(cfg.BASE_DOOR.col);
    e.y = Z.centerY(cfg.BASE_DOOR.row + 1);
    e.dir = null;
    e.fright = false;
    e.timer = cfg.enemy.respawn;
  }

  // 敵 e の狙うマス
  function target(e, g) {
    const p = g.player;
    const pc = Z.colOf(p.x);
    const pr = Z.rowOf(p.y);
    const ai = e.def.ai;
    if (ai === 'ambush') {
      const d = M.DIRS[p.dir || p.face] || [0, 0];
      return { col: pc + d[0] * e.def.ahead, row: pr + d[1] * e.def.ahead };
    }
    if (ai === 'shy') {
      const dist = Math.hypot(Z.dx(e.x, p.x), p.y - e.y) / T;
      return dist > e.def.near ? { col: pc, row: pr } : e.def.corner;
    }
    return { col: pc, row: pr };
  }

  // マスの中心で次の向きを決める
  function choose(e, g) {
    const col = Z.colOf(e.x);
    const row = Z.rowOf(e.y);
    let opts = ORDER.filter((d) => d !== M.OPPOSITE[e.dir] && Z.enemyCan(col + M.DIRS[d][0], row + M.DIRS[d][1]));
    if (opts.length === 0) opts = [M.OPPOSITE[e.dir]].filter(Boolean); // 行き止まり(この迷路にはない)
    if (opts.length === 0) return null;
    if (opts.length === 1) return opts[0];
    const r = g.rand();
    const random = () => opts[Math.floor(g.rand() * opts.length)];
    const p = g.player;
    // 向き d へ 1 マス進んだときの、点 (tx, ty)(px)までの距離の 2 乗
    const distAfter = (d, tx, ty) => {
      const nx = e.x + M.DIRS[d][0] * T;
      const ny = e.y + M.DIRS[d][1] * T;
      const ddx = Z.dx(nx, tx);
      return ddx * ddx + (ty - ny) * (ty - ny);
    };
    if (e.fright) {
      if (r < 0.25) return random();
      return opts.reduce((a, d) => (distAfter(d, p.x, p.y) > distAfter(a, p.x, p.y) ? d : a));
    }
    if (e.def.ai === 'patrol' || r >= e.def.chase) return random();
    const t = target(e, g);
    const tx = Z.centerX(t.col);
    const ty = Z.centerY(t.row);
    return opts.reduce((a, d) => (distAfter(d, tx, ty) < distAfter(a, tx, ty) ? d : a));
  }

  // その敵のいまの速さ(px / ステップ)
  function speedOf(e, g) {
    if (e.state !== 'active') return cfg.enemy.homeSpeed;
    const row = Z.rowOf(e.y);
    const col = Z.colOf(e.x);
    if (row === cfg.WARP_ROW && (col <= 5 || col >= cfg.COLS - 6)) return cfg.enemy.warpSpeed;
    if (e.fright) return cfg.enemy.frightSpeed;
    return cfg.enemy.speed * cfg.enemy.speedScale * g.diff.enemySpeed;
  }

  function update(e, g) {
    const sp = speedOf(e, g);
    if (e.state === 'home') {
      e.walk++;
      if (e.timer > 0) e.timer--;
      else e.state = 'leaving';
      return;
    }
    if (e.state === 'leaving') {
      e.walk++;
      const doorX = Z.centerX(cfg.BASE_DOOR.col);
      const exitY = Z.centerY(cfg.BASE_EXIT.row);
      if (Math.abs(e.x - doorX) > 1e-6) {
        const d = doorX - e.x;
        e.x += Math.sign(d) * Math.min(Math.abs(d), sp);
        e.face = d < 0 ? 'left' : 'right';
      } else if (e.y > exitY) {
        e.y = Math.max(exitY, e.y - sp);
      } else {
        e.state = 'active';
        e.dir = g.rand() < 0.5 ? 'left' : 'right';
      }
      return;
    }
    const x0 = e.x;
    M.advance(e, sp, (a) => {
      a.dir = choose(a, g);
    });
    if (e.x !== x0 && e.dir) e.face = e.dir === 'left' || e.dir === 'right' ? e.dir : e.face;
    e.walk++;
  }

  // ビールを飲まれた: 外にいる敵は向きを反転して逃げ始める。交番の中の敵も怯える
  function frighten(list) {
    for (const e of list) {
      e.fright = true;
      if (e.state === 'active' && e.dir) e.dir = M.OPPOSITE[e.dir];
    }
  }

  return { create, reset, arrest, update, target, choose, frighten, rng, speedOf };
})();
