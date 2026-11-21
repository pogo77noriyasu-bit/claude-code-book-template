// テスト補助(URL に ?test があるときだけ window.__pq を公開する。通常プレイには影響しない)
(function () {
  if (!/[?&]test\b/.test(location.search)) return;
  const g = PQ.game.data;
  const crowdInfo = (c) => ({
    cx: c.cx,
    cy: c.cy,
    members: c.members.map((m) => ({ x: m.x, y: m.y, scale: m.scale, kind: m.kind })),
  });
  window.__pq = {
    setManual(on) {
      PQ.loop.manual = !!on;
    },
    step(n) {
      for (let i = 0; i < (n || 1); i++) PQ.game.update();
    },
    // 群衆を止める・動かす(地形のテストで使う)
    freezeCrowd(on) {
      g.crowdFrozen = !!on;
    },
    snapshot() {
      const p = g.player;
      return {
        state: g.state,
        score: g.score,
        hiScore: g.hiScore,
        dev: { mode: !!g.devMode, invincible: !!g.devInvincible }, // DEV モード(?dev)の状態
        lives: g.lives,
        nextExtend: g.nextExtend, // 次に 1UP する得点
        oneUpTimer: g.oneUpTimer, // 「1UP」を出している残りステップ
        stage: g.stage,
        percent: PQ.game.percent(),
        player: p && { x: p.x, y: p.y, drawing: p.drawing, trail: p.trail.length, face: p.face },
        playerFrame: PQ.renderer.lastPlayerFrame(), // 最後に描いた主人公の絵 { name, flip }
        crowd: g.crowd && crowdInfo(g.crowd), // 1 つ目の群衆(1〜8 面は群衆がこれだけ)
        crowds: g.crowds && g.crowds.map(crowdInfo), // すべての群衆(9 面以降は 2 つ)
        colorIndex: g.field && g.field.colorIndex,
        sounds: PQ.audio.log.slice(),
        music: { wanted: PQ.audio.musicWanted(), playing: PQ.audio.musicPlaying(), soundOn: PQ.audio.isOn() },
      };
    },
    cell(x, y) {
      return PQ.field.get(g.field, x, y);
    },
    cellColor(x, y) {
      return g.field.color[y * g.field.cols + x];
    },
    // 群衆を (px, py) に集める。k は何番目の群衆か(省略すると 1 つ目)
    placeCrowd(px, py, k) {
      const c = g.crowds[k || 0];
      c.cx = px;
      c.cy = py;
      for (const m of c.members) {
        m.x = px;
        m.y = py;
      }
    },
    placePlayer(x, y) {
      g.player.x = x;
      g.player.y = y;
    },
    // 獲得率を上げる: 指定の行より下の EMPTY をすべて獲得済みにする
    fillBelow(row) {
      const f = g.field;
      for (let y = row; y < f.rows - 1; y++) {
        for (let x = 1; x < f.cols - 1; x++) {
          const i = y * f.cols + x;
          if (f.cells[i] === PQ.field.EMPTY) {
            f.cells[i] = PQ.field.FILLED;
            f.color[i] = 0;
            f.claimed++;
          }
        }
      }
      f.version++;
    },
    // 折れ線(マスの座標の配列。最初と最後は境界線のマス)に沿って線を引いたことにして、陣地を確定する。
    // 途中の点は縦か横にそろえること。キー操作なしで地形を作るため(群衆のテスト用)
    capturePath(points) {
      const p = g.player;
      const f = g.field;
      const trail = [];
      for (let k = 0; k < points.length - 1; k++) {
        let [x, y] = points[k];
        const [x1, y1] = points[k + 1];
        while (x !== x1 || y !== y1) {
          x += Math.sign(x1 - x);
          y += Math.sign(y1 - y);
          const last = k === points.length - 2 && x === x1 && y === y1;
          if (!last && PQ.field.get(f, x, y) === PQ.field.EMPTY) {
            PQ.field.set(f, x, y, PQ.field.TRAIL);
            trail.push({ x, y });
          }
        }
      }
      p.drawing = true;
      p.trail = trail;
      const end = points[points.length - 1];
      p.x = end[0];
      p.y = end[1];
      PQ.game.closeArea();
      return trail.length;
    },
    // 描画を 1 回だけ行う(requestAnimationFrame を待たずに画面を確かめるため)
    render() {
      PQ.renderer.draw(g);
    },
    // 主人公の上下左右の隣に、歩けるマス(境界線か橋)がいくつあるか(動けなくなっていないかの確認)
    playerExits() {
      const p = g.player;
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (PQ.field.isWalkable(g.field, p.x + dx, p.y + dy)) n++;
      return n;
    },
    // 歩けるマス(境界線と橋)の検査: 主人公がその上にいるか、すべて上下左右につながっているか(どこへでも歩いて行けるか)
    edgeCheck() {
      const f = g.field;
      const F = PQ.field;
      const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let total = 0;
      let start = -1;
      for (let y = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++) {
          if (F.isWalkable(f, x, y)) {
            total++;
            if (start < 0) start = y * f.cols + x;
          }
        }
      }
      let reached = 0;
      if (start >= 0) {
        const seen = new Uint8Array(f.cols * f.rows);
        const st = [start];
        seen[start] = 1;
        while (st.length) {
          const i = st.pop();
          reached++;
          const x = i % f.cols;
          const y = (i / f.cols) | 0;
          for (const [dx, dy] of D) {
            const j = (y + dy) * f.cols + x + dx;
            if (F.isWalkable(f, x + dx, y + dy) && !seen[j]) {
              seen[j] = 1;
              st.push(j);
            }
          }
        }
      }
      return { onEdge: F.isWalkable(f, g.player.x, g.player.y), total, reached };
    },
    // 隊員ごとの「目標の位置」(列の形から決まる位置)
    crowdTargets(k) {
      const c = g.crowds[k || 0];
      return c.members.map((m) => PQ.crowd.target(c, m));
    },
  };
})();
