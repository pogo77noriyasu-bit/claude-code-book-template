// メインの敵: 機動隊の群衆
// 原作ジャンルの「複数の線が不規則に回転・伸縮・変形する敵」を、隊員の列で表す。
// 中心(core)を通る列が lines 本あり、列ごとに角度・長さ・折れ曲がり・波打ちが時間で変わる。
// 各隊員は「列の形から決まる目標の位置」へ動くが、獲得済みのエリアには入れない(壁で止まる)。
PQ.crowd = (function () {
  // 0〜1 の乱数(シード付き。テストで同じ動きを再現できるように)
  function rand(c) {
    c.seed = (c.seed * 1664525 + 1013904223) >>> 0;
    return c.seed / 4294967296;
  }

  // ステージごとの表(1 面から順)から stage の値を取り出す。表より先の面は最後の値のまま
  function stageValue(table, stage) {
    const i = Math.min(Math.max(1, stage | 0), table.length) - 1;
    return table[i];
  }
  // ステージ stage(1 から)の速さの倍率
  function speedMul(stage) {
    return stageValue(PQ.config.crowd.stageSpeed, stage);
  }
  // ステージ stage の群衆の数
  function groupsFor(stage) {
    return stageValue(PQ.config.crowd.stageGroups, stage);
  }
  // ステージ stage の群衆の大きさ { count: 人数, spread: 広がりの倍率 }(1 群衆あたり)
  function sizeFor(stage) {
    const cfg = PQ.config.crowd;
    return { count: stageValue(cfg.stageCount, stage), spread: stageValue(cfg.stageSpread, stage) };
  }

  // 中心の隊長を除いた count - 1 人を、列の片側(lines 本 × 両側)ごとの人数に分ける。
  // 割り切れないときは、前の列の片側から 1 人ずつ多くする(例: 29 人 → 5,5,5,5,5,4)。返り値: [列][0 = 左側, 1 = 右側]
  function armCounts(count, lines) {
    const halves = lines * 2;
    const rest = Math.max(0, count - 1);
    const base = Math.floor(rest / halves);
    const extra = rest % halves;
    const out = [];
    for (let k = 0; k < lines; k++) out.push([0, 1].map((h) => base + (k * 2 + h < extra ? 1 : 0)));
    return out;
  }

  // 群衆を 1 つ作る。index はその面の何番目の群衆か(0 から)、groups はその面の群衆の数。
  // 群衆ごとに中心・乱数・進む向き・回転・伸縮・波打ちを別々に持つ(独立して動く)。
  // 1 つだけの面(1〜8 面)は、index = 0・groups = 1 で以前とまったく同じ群衆になる
  function create(field, stage, seed, index, groups) {
    const cfg = PQ.config.crowd;
    const C = PQ.config.CELL;
    index = index || 0;
    groups = groups || 1;
    const starts = cfg.groupStarts[groups] || cfg.groupStarts[1];
    const start = starts[index % starts.length];
    const c = {
      index, // 何番目の群衆か
      seed: seed >>> 0 || 1,
      cx: field.cols * C * start[0], // 中心(px、フィールド内)
      cy: field.rows * C * start[1],
      vx: 0,
      vy: 0,
      t: index * cfg.groupPhase.t, // 形(伸縮・折れ曲がり・波打ち)の時間。2 つ目以降はずらす
      rot: index * cfg.groupPhase.rot,
      rotDir: index % 2 ? -1 : 1, // 2 つ目は逆回りから
      turnTimer: 0,
      mul: speedMul(stage), // ステージごとの速さの倍率(config.crowd.stageSpeed)
      spread: sizeFor(stage).spread, // ステージごとの広がりの倍率(config.crowd.stageSpread)
      members: [],
      hit: false, // このステップで描画中の線に触れたか
      dist: new Int32Array(field.cols * field.rows), // 中心からの距離マップ(マス数。-1 = 届かない)
    };
    // 先頭は中心の隊長(いちばん大きい)。そのあと列ごとに、中心に近い順に片側ずつ並べる。
    // 列の上の位置 s は、片側の人数に関係なく先端が ±1 になるように割り振る(中心ほど大きく先端ほど小さい表現を保つ)
    const arms = armCounts(sizeFor(stage).count, cfg.lines);
    c.members.push(makeMember(c, 0, 0, 0));
    let n = 1;
    for (let k = 0; k < cfg.lines; k++) {
      const most = Math.max(arms[k][0], arms[k][1]);
      for (let j = 1; j <= most; j++) {
        [-1, 1].forEach((side, h) => {
          const per = arms[k][h];
          if (j <= per) c.members.push(makeMember(c, n++, k, (side * j) / per));
        });
      }
    }
    newHeading(c);
    return c;
  }

  // 隊員 1 人。s は列の上の位置(-1〜1、0 が中心)
  function makeMember(c, index, line, s) {
    const cfg = PQ.config.crowd;
    const a = Math.abs(s);
    const scale = cfg.scaleCenter + (cfg.scaleEdge - cfg.scaleCenter) * a; // 中心ほど大きい
    return {
      index,
      line,
      s,
      scale,
      kind: index % cfg.copEvery === cfg.copEvery - 1 ? 'cop' : 'riot', // ところどころ通常の警察官
      x: c.cx,
      y: c.cy,
      dir: 1,
      walk: index * 7, // 歩くアニメの位相をずらす
      nav: false, // 壁に引っかかって、中心へ回り込んでいる途中か
    };
  }

  // 進行方向を不規則に変える
  function newHeading(c) {
    const cfg = PQ.config.crowd;
    const ang = rand(c) * Math.PI * 2;
    const sp = cfg.speed * c.mul * (0.7 + rand(c) * 0.6);
    c.vx = Math.cos(ang) * sp;
    c.vy = Math.sin(ang) * sp;
    c.turnTimer = cfg.turnMin + Math.floor(rand(c) * (cfg.turnMax - cfg.turnMin));
    if (rand(c) < 0.35) c.rotDir = -c.rotDir; // ときどき回る向きも逆に
  }

  // ピクセル位置のマスの状態(フィールドの外は獲得済み扱い)
  function cellState(field, px, py) {
    const m = PQ.field.cellAt(px, py);
    return PQ.field.get(field, m.x, m.y);
  }

  // (x0,y0) から (x1,y1) へ 2px 刻みで進み、獲得済みのマスの手前で止まる。線に触れたら hit
  function sweep(field, x0, y0, x1, y1) {
    const F = PQ.field;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2));
    let x = x0;
    let y = y0;
    let hit = false;
    for (let i = 1; i <= n; i++) {
      const nx = x0 + (dx * i) / n;
      const ny = y0 + (dy * i) / n;
      const st = cellState(field, nx, ny);
      if (st === F.FILLED) break;
      if (st === F.TRAIL) hit = true;
      x = nx;
      y = ny;
    }
    return { x, y, hit };
  }

  // 半径 r(px)の範囲に描画中の線があるか
  function touchesTrail(field, px, py, r) {
    const F = PQ.field;
    const C = PQ.config.CELL;
    const x0 = Math.floor((px - r) / C);
    const x1 = Math.floor((px + r) / C);
    const y0 = Math.floor((py - r) / C);
    const y1 = Math.floor((py + r) / C);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (F.get(field, x, y) === F.TRAIL) return true;
      }
    }
    return false;
  }

  // 中心のマスから、未獲得のマス(EMPTY)だけを通る距離マップを作る(4 方向の BFS)。
  // 描画中の線(TRAIL)は通らない(回り込みで線に突っ込まないように)
  function buildDist(c, field) {
    const F = PQ.field;
    const { cols, rows, cells } = field;
    const dist = c.dist;
    dist.fill(-1);
    const s = F.cellAt(c.cx, c.cy);
    if (!F.inBounds(field, s.x, s.y) || cells[s.y * cols + s.x] !== F.EMPTY) return;
    const queue = new Int32Array(cols * rows);
    let head = 0;
    let tail = 0;
    const start = s.y * cols + s.x;
    dist[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++];
      const x = i % cols;
      const d = dist[i] + 1;
      if (x > 0 && dist[i - 1] < 0 && cells[i - 1] === F.EMPTY) { dist[i - 1] = d; queue[tail++] = i - 1; }
      if (x < cols - 1 && dist[i + 1] < 0 && cells[i + 1] === F.EMPTY) { dist[i + 1] = d; queue[tail++] = i + 1; }
      if (i >= cols && dist[i - cols] < 0 && cells[i - cols] === F.EMPTY) { dist[i - cols] = d; queue[tail++] = i - cols; }
      if (i < cols * (rows - 1) && dist[i + cols] < 0 && cells[i + cols] === F.EMPTY) { dist[i + cols] = d; queue[tail++] = i + cols; }
    }
  }

  // ピクセル位置のマスの距離(フィールドの外・届かないマスは -1)
  function distAt(c, field, px, py) {
    const m = PQ.field.cellAt(px, py);
    if (!PQ.field.inBounds(field, m.x, m.y)) return -1;
    return c.dist[m.y * field.cols + m.x];
  }

  // 距離マップを下って、中心へ 1 ステップ分近づく。返り値: 進んだ先 {x, y, hit}(進めなければ null)
  function stepTowardCore(c, field, m) {
    const F = PQ.field;
    const C = PQ.config.CELL;
    const cols = field.cols;
    const here = F.cellAt(m.x, m.y);
    const d0 = distAt(c, field, m.x, m.y);
    if (d0 < 0) return null;
    let goal = null;
    if (d0 === 0) {
      goal = { x: c.cx, y: c.cy }; // 中心のマスに着いたら中心の点へ
    } else {
      let best = d0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = here.x + dx;
          const ny = here.y + dy;
          if (!F.inBounds(field, nx, ny)) continue;
          const d = c.dist[ny * cols + nx];
          if (d < 0 || d >= best) continue;
          // 斜めは、角の両側のマスが空いているときだけ(壁の角をすり抜けない)
          if (dx && dy && (c.dist[here.y * cols + nx] < 0 || c.dist[ny * cols + here.x] < 0)) continue;
          best = d;
          goal = { x: nx * C + C / 2, y: ny * C + C / 2 };
        }
      }
      if (!goal) return null;
    }
    const sp = PQ.config.crowd.returnSpeed * c.mul;
    const dx = goal.x - m.x;
    const dy = goal.y - m.y;
    const len = Math.hypot(dx, dy);
    const k = len > sp ? sp / len : 1;
    return sweep(field, m.x, m.y, m.x + dx * k, m.y + dy * k);
  }

  // 隊員 1 人を目標の位置へ動かす。返り値: {x, y, hit}
  //  1. まっすぐ進めれば、そのまま目標へ(回り込みは終わり)
  //  2. 回り込みの途中なら、距離マップをたどって中心へ
  //  3. 壁に当たったら、横・縦に分けて壁に沿って滑る
  //  4. 滑っても目標へ近づけず、目標が空いたマス(中心から届く場所)にあるなら、回り込みを始める
  //     (目標が獲得済みの中にあるときは、壁ぎわで待つ。目標が戻ってくればすぐ追いかける)
  function moveMember(c, field, m, tg) {
    const direct = sweep(field, m.x, m.y, tg.x, tg.y);
    if (direct.x === tg.x && direct.y === tg.y) {
      m.nav = false;
      return direct;
    }
    if (m.nav) {
      const r = stepTowardCore(c, field, m);
      if (r) return r;
      m.nav = false;
    }
    const sx = sweep(field, m.x, m.y, tg.x, m.y);
    const sy = sweep(field, sx.x, sx.y, sx.x, tg.y);
    const slide = { x: sy.x, y: sy.y, hit: sx.hit || sy.hit };
    const before = Math.hypot(tg.x - m.x, tg.y - m.y);
    const afterDirect = Math.hypot(tg.x - direct.x, tg.y - direct.y);
    const afterSlide = Math.hypot(tg.x - slide.x, tg.y - slide.y);
    const best = afterSlide < afterDirect ? slide : direct;
    const progress = before - Math.min(afterDirect, afterSlide);
    if (progress < 0.5 && distAt(c, field, tg.x, tg.y) >= 0) {
      const r = stepTowardCore(c, field, m);
      if (r) {
        m.nav = true;
        return r;
      }
    }
    return best;
  }

  // 列の形から、隊員 m の目標の位置を出す
  function target(c, m) {
    const cfg = PQ.config.crowd;
    if (m.s === 0) return { x: c.cx, y: c.cy };
    const t = c.t;
    const k = m.line;
    const theta = c.rot + (k * Math.PI) / cfg.lines; // 列ごとに角度をずらして重ねる
    // 伸び縮み(列ごとに位相が違う)
    // 長さと波打つ幅には、ステージごとの広がりの倍率をかける(動き方は同じで、範囲だけ広がる)
    const len = (cfg.lenMin + (cfg.lenMax - cfg.lenMin) * (0.5 + 0.5 * Math.sin(t * 0.021 + k * 2.1))) * c.spread;
    // 折れ曲がり(V 字)とねじれ(S 字)
    const bend = cfg.bendMax * Math.sin(t * 0.013 + k * 1.7);
    const twist = 0.6 * Math.sin(t * 0.017 + k * 0.9);
    const a = theta + bend * Math.abs(m.s) + twist * m.s;
    const d = m.s * len;
    // 波打ち(列に沿って進む波)
    const wave = cfg.waveAmp * c.spread * Math.sin(t * 0.09 + m.s * 4 + k);
    return {
      x: c.cx + Math.cos(a) * d - Math.sin(theta) * wave,
      y: c.cy + Math.sin(a) * d + Math.cos(theta) * wave,
    };
  }

  // 1 ステップ進める。描画中の線に触れたら c.hit = true
  function update(c, field) {
    const cfg = PQ.config.crowd;
    const F = PQ.field;
    c.t++;
    c.hit = false;
    c.rot += cfg.rotSpeed * c.mul * c.rotDir;
    if (--c.turnTimer <= 0) newHeading(c);

    // 中心を動かす。獲得済みのマスに当たったら跳ね返る
    const nx = c.cx + c.vx;
    const ny = c.cy + c.vy;
    if (cellState(field, nx, c.cy) === F.FILLED) c.vx = -c.vx;
    else c.cx = nx;
    if (cellState(field, c.cx, ny) === F.FILLED) c.vy = -c.vy;
    else c.cy = ny;
    if (cellState(field, c.cx, c.cy) === F.TRAIL) c.hit = true;
    buildDist(c, field);

    // 隊員を目標の位置へ(獲得済みのマスには入らない。引っかかったら回り込む)
    for (const m of c.members) {
      const tg = target(c, m);
      const r = moveMember(c, field, m, tg);
      if (r.x !== m.x) m.dir = r.x > m.x ? 1 : -1;
      if (r.x !== m.x || r.y !== m.y) m.walk++;
      m.x = r.x;
      m.y = r.y;
      const rad = Math.max(2, m.scale * cfg.hitPerScale);
      if (r.hit || touchesTrail(field, m.x, m.y, rad)) c.hit = true;
    }
  }

  // 陣地が確定したあと、取り残された隊員を中心へ戻す。
  //   - 獲得済みのマスにいる隊員
  //   - 未獲得のマスにいても、中心から届かない領域(線で分断された別の領域)にいる隊員(群衆が 2 つの面で起きる)
  // 中心のマス自体が未獲得でなくなっていたら(描画中の線の上にいたまま確定したときなど)、
  // Flood Fill の起点になった隊員の位置(残った領域の中)へ中心を移してから戻す
  function evacuate(c, field) {
    const F = PQ.field;
    if (cellState(field, c.cx, c.cy) !== F.EMPTY) {
      const keep = c.members.find((m) => cellState(field, m.x, m.y) === F.EMPTY);
      const to = keep ? { x: keep.x, y: keep.y } : nearestEmpty(field, c.cx, c.cy);
      if (to) {
        c.cx = to.x;
        c.cy = to.y;
      }
    }
    buildDist(c, field);
    for (const m of c.members) {
      if (cellState(field, m.x, m.y) !== F.EMPTY || distAt(c, field, m.x, m.y) < 0) {
        m.x = c.cx;
        m.y = c.cy;
      }
    }
  }

  // (px, py) からいちばん近い未獲得のマスの中心(px)。なければ null
  function nearestEmpty(field, px, py) {
    const F = PQ.field;
    const C = PQ.config.CELL;
    const s = F.cellAt(px, py);
    let best = null;
    let bestD = Infinity;
    for (let y = 0; y < field.rows; y++) {
      for (let x = 0; x < field.cols; x++) {
        if (field.cells[y * field.cols + x] !== F.EMPTY) continue;
        const d = (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y);
        if (d < bestD) {
          bestD = d;
          best = { x: x * C + C / 2, y: y * C + C / 2 };
        }
      }
    }
    return best;
  }

  // Flood Fill の起点(中心のマス、次に各隊員のマス)
  function seeds(c) {
    const out = [PQ.field.cellAt(c.cx, c.cy)];
    for (const m of c.members) out.push(PQ.field.cellAt(m.x, m.y));
    return out;
  }

  // 主人公(px)とぶつかっているか
  function touchesPoint(c, px, py, r) {
    const cfg = PQ.config.crowd;
    for (const m of c.members) {
      const rad = Math.max(2, m.scale * cfg.hitPerScale) + r;
      // 絵の足元ではなく体の中心で判定する
      if (Math.hypot(m.x - px, m.y - py) < rad) return true;
    }
    return false;
  }

  return { create, update, evacuate, seeds, touchesPoint, target, buildDist, speedMul, sizeFor, groupsFor, armCounts };
})();
