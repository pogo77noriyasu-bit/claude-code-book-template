// フィールド(陣取りのグリッド)
// 1 マスの状態は EMPTY(未獲得)/ FILLED(獲得済み・外周)/ TRAIL(描画中の線)の 3 つ。
// 境界線は「FILLED のうち、8 近傍に EMPTY か TRAIL があるマス」(4 方向につながった 1 マス幅の線になる)。
// 陣地の確定は Flood Fill: 群衆の中心から EMPTY を塗り広げ、届かなかった EMPTY をすべて獲得する。
// こうすると、どんなに複雑な形に分かれても「群衆がいない側」をまとめて獲得できる。
// 群衆が 2 つの面(9 面以降)は、両方の群衆から塗り広げ、どちらからも届かない EMPTY だけを獲得する
// (群衆が線で別々の領域に分かれたら、両方の領域が未獲得のまま残る)。
PQ.field = (function () {
  const EMPTY = 0;
  const FILLED = 1;
  const TRAIL = 2;

  // 新しいフィールドを作る。外周の 1 マスだけ獲得済み
  function create() {
    const { COLS, ROWS } = PQ.config;
    const f = {
      cols: COLS,
      rows: ROWS,
      cells: new Uint8Array(COLS * ROWS),
      color: new Int8Array(COLS * ROWS).fill(-1), // 獲得したときの色の番号(-1 = 外周・線)
      colorIndex: 0, // 次に獲得するときの色の番号
      interior: (COLS - 2) * (ROWS - 2), // 獲得率の分母(外周を除いたマス数)
      claimed: 0, // 外周を除いた獲得済みのマス数
      // 橋: 境界線ではないが歩ける白い線のマス(1 = 橋)。群衆が別々の領域に分かれて境界線が 2 つ以上に
      // 離れたときだけ、境界線どうしを白い線(外周・昔の線)でつなぐ(computeBridges)。1 群衆の面では常に空
      bridge: new Uint8Array(COLS * ROWS),
      version: 0, // 描画のキャッシュを作り直す目印(変わるたびに +1)
    };
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) f.cells[y * COLS + x] = FILLED;
      }
    }
    return f;
  }

  function inBounds(f, x, y) {
    return x >= 0 && y >= 0 && x < f.cols && y < f.rows;
  }

  function get(f, x, y) {
    return inBounds(f, x, y) ? f.cells[y * f.cols + x] : FILLED;
  }

  function set(f, x, y, v) {
    f.cells[y * f.cols + x] = v;
    f.version++;
  }

  // 境界線のマスか(主人公が歩ける場所)
  function isEdge(f, x, y) {
    if (get(f, x, y) !== FILLED || !inBounds(f, x, y)) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!inBounds(f, x + dx, y + dy)) continue;
        if (get(f, x + dx, y + dy) !== FILLED) return true;
      }
    }
    return false;
  }

  // 主人公が(線を引いていないときに)歩けるマスか: 境界線か橋
  function isWalkable(f, x, y) {
    if (!inBounds(f, x, y)) return false;
    return isEdge(f, x, y) || f.bridge[y * f.cols + x] === 1;
  }

  // 線を引き終えたときの確定処理。trail は線のマスの一覧。
  // seedGroups は群衆ごとの起点のマスの一覧(各群衆の [中心, 隊員…])。群衆が 1 つなら起点の一覧そのものでもよい。
  // 返り値: 新しく獲得したマス数(線のマスを含む)
  function close(f, trail, seedGroups) {
    // 起点の一覧を 1 つだけ渡されたとき(以前の形)は、群衆 1 つとして扱う
    const groups = seedGroups.length && !Array.isArray(seedGroups[0]) ? [seedGroups] : seedGroups;
    const { cols, rows, cells } = f;
    // 線は獲得済み(境界線)になる
    for (const t of trail) cells[t.y * cols + t.x] = FILLED;
    let gained = trail.length;

    // 群衆ごとに、中心から EMPTY を塗る(中心のマスが空でなければ、その群衆のほかの隊員のマスを使う)
    const reach = new Uint8Array(cols * rows);
    const stack = [];
    for (const seeds of groups) {
      for (const s of seeds) {
        const i = s.y * cols + s.x;
        if (inBounds(f, s.x, s.y) && cells[i] === EMPTY) {
          if (!reach[i]) {
            stack.push(i);
            reach[i] = 1;
          }
          break;
        }
      }
    }
    while (stack.length) {
      const i = stack.pop();
      const x = i % cols;
      const y = (i / cols) | 0;
      // 4 近傍(斜めは線のすき間を抜けないように数えない)
      if (x > 0) visit(i - 1);
      if (x < cols - 1) visit(i + 1);
      if (y > 0) visit(i - cols);
      if (y < rows - 1) visit(i + cols);
    }
    function visit(j) {
      if (!reach[j] && cells[j] === EMPTY) {
        reach[j] = 1;
        stack.push(j);
      }
    }

    // 届かなかった EMPTY を獲得する
    const ci = f.colorIndex;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === EMPTY && !reach[i]) {
        cells[i] = FILLED;
        f.color[i] = ci;
        gained++;
      }
    }
    f.claimed += gained;
    f.colorIndex = (ci + 1) % PQ.config.CAPTURE_COLORS.length;
    computeBridges(f);
    f.version++;
    return gained;
  }

  // 境界線が 2 つ以上に離れていたら(群衆が別々の領域に分かれたあと、片方の領域だけを削っていくと起きる)、
  // 白い線のマス(外周・昔の線 = color が -1 の FILLED)をたどる最短の道で境界線どうしをつなぎ、その道を「橋」にする。
  // 橋がないと、主人公はもう一方の領域へ行けず、その領域を削れないまま 75% に届かなくなることがある。
  // 境界線が 1 つにつながっているとき(1 群衆の面では常に)は、橋はない。
  function computeBridges(f) {
    const { cols, rows } = f;
    const n = cols * rows;
    f.bridge.fill(0);
    // 境界線のマスを、上下左右のつながりごとに番号をつける
    const comp = new Int32Array(n).fill(-1);
    const edges = [];
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (comp[i] >= 0 || !isEdge(f, i % cols, (i / cols) | 0)) continue;
      const st = [i];
      comp[i] = count;
      while (st.length) {
        const j = st.pop();
        edges.push(j);
        for (const k of neighbors4(f, j)) {
          if (comp[k] < 0 && isEdge(f, k % cols, (k / cols) | 0)) {
            comp[k] = count;
            st.push(k);
          }
        }
      }
      count++;
    }
    if (count <= 1) return;
    // つながった側(最初は番号 0)から幅優先で広げ、まだつながっていない境界線に着いたら、その道を橋にする
    const joined = new Uint8Array(count);
    joined[0] = 1;
    const passable = (i) => f.cells[i] === FILLED && (f.color[i] < 0 || comp[i] >= 0 || f.bridge[i]);
    for (let left = count - 1; left > 0; left--) {
      const prev = new Int32Array(n).fill(-1);
      const seen = new Uint8Array(n);
      const queue = [];
      for (const i of edges) {
        if (joined[comp[i]] || f.bridge[i]) {
          seen[i] = 1;
          queue.push(i);
        }
      }
      for (let i = 0; i < n; i++) {
        if (f.bridge[i] && !seen[i]) {
          seen[i] = 1;
          queue.push(i);
        }
      }
      let found = -1;
      for (let q = 0; q < queue.length && found < 0; q++) {
        const i = queue[q];
        for (const k of neighbors4(f, i)) {
          if (seen[k] || !passable(k)) continue;
          seen[k] = 1;
          prev[k] = i;
          if (comp[k] >= 0 && !joined[comp[k]]) {
            found = k;
            break;
          }
          queue.push(k);
        }
      }
      if (found < 0) return; // 白い線でつなげない(起きないはず)
      joined[comp[found]] = 1;
      for (let i = prev[found]; i >= 0 && comp[i] < 0; i = prev[i]) f.bridge[i] = 1;
    }
  }

  // 上下左右の隣のマスの番号
  function neighbors4(f, i) {
    const x = i % f.cols;
    const out = [];
    if (x > 0) out.push(i - 1);
    if (x < f.cols - 1) out.push(i + 1);
    if (i >= f.cols) out.push(i - f.cols);
    if (i < f.cols * (f.rows - 1)) out.push(i + f.cols);
    return out;
  }

  // (x, y) からいちばん近い境界線のマス。見つからなければ null。
  // まず白い線のマス(外周・昔の線。color が -1 の FILLED)だけをたどって探し(線に沿って移った位置になる)、
  // 線だけで届かなければ獲得済みのマス全体をたどる。どちらも 4 方向の幅優先探索。
  function nearestEdge(f, x, y) {
    const lineOnly = (i) => f.cells[i] === FILLED && f.color[i] < 0;
    const anyFilled = (i) => f.cells[i] === FILLED;
    return searchEdge(f, x, y, lineOnly) || searchEdge(f, x, y, anyFilled);
  }
  function searchEdge(f, x, y, passable) {
    if (!inBounds(f, x, y)) return null;
    const { cols, rows } = f;
    const seen = new Uint8Array(cols * rows);
    const queue = [y * cols + x];
    seen[queue[0]] = 1;
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      const cx = i % cols;
      const cy = (i / cols) | 0;
      if (isEdge(f, cx, cy)) return { x: cx, y: cy };
      const next = [];
      if (cx > 0) next.push(i - 1);
      if (cx < cols - 1) next.push(i + 1);
      if (cy > 0) next.push(i - cols);
      if (cy < rows - 1) next.push(i + cols);
      for (const j of next) {
        if (seen[j]) continue;
        seen[j] = 1;
        // 境界線のマスは、通れるマスでなくても行き先にはなる(取り出したところで見つかったことになる)
        if (passable(j) || isEdge(f, j % cols, (j / cols) | 0)) queue.push(j);
      }
    }
    return null;
  }

  // 描画中の線を消す(ミスのとき)
  function clearTrail(f, trail) {
    for (const t of trail) f.cells[t.y * f.cols + t.x] = EMPTY;
    f.version++;
  }

  // 獲得率(%)
  function percent(f) {
    return (f.claimed / f.interior) * 100;
  }

  // ピクセル座標(フィールドの左上が原点)→ マス
  function cellAt(px, py) {
    const c = PQ.config.CELL;
    return { x: Math.floor(px / c), y: Math.floor(py / c) };
  }

  return { EMPTY, FILLED, TRAIL, create, get, set, isEdge, isWalkable, nearestEdge, close, computeBridges, clearTrail, percent, cellAt, inBounds };
})();
