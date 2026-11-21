// 迷路(config.MAZE)の読み取りと、通れるマスの判定・アイテムの配置
// 座標の決まり:
//   - マス (col, row)。迷路の左上が (0, 0)
//   - キャラクターの位置 (x, y) は迷路の左上を原点とする px。マスの中心は (col * T + T/2, row * T + T/2)
//   - 左右のワープ通路は、x が迷路の幅を超えたら反対側へ回す(wrapX)
NP.maze = (function () {
  const cfg = NP.config;
  const T = cfg.TILE;
  const W = cfg.COLS * T; // 迷路の幅(px)

  const at = (col, row) => {
    if (row < 0 || row >= cfg.ROWS) return '#';
    const c = ((col % cfg.COLS) + cfg.COLS) % cfg.COLS; // ワープ通路は左右がつながっている
    return cfg.MAZE[row][c];
  };
  const isWallChar = (ch) => ch === '#' || ch === 'L';

  // 主人公が入れるマスか(壁・交番の中・出入口には入れない)
  function playerCan(col, row) {
    if ((col < 0 || col >= cfg.COLS) && row !== cfg.WARP_ROW) return false;
    const ch = at(col, row);
    return !isWallChar(ch) && ch !== 'B' && ch !== '=';
  }
  // 交番の外を歩く敵が入れるマス(主人公と同じ。交番へは決まった手順でしか出入りしない)
  const enemyCan = playerCan;

  const centerX = (col) => col * T + T / 2;
  const centerY = (row) => row * T + T / 2;
  const colOf = (x) => Math.floor(wrapX(x) / T);
  const rowOf = (y) => Math.floor(y / T);
  function wrapX(x) {
    if (x < 0) return x + W;
    if (x >= W) return x - W;
    return x;
  }
  // 2 点の横の距離(ワープ通路をまたぐ近道も考える)
  function dx(x1, x2) {
    let d = x2 - x1;
    if (d > W / 2) d -= W;
    if (d < -W / 2) d += W;
    return d;
  }

  // 迷路のアイテムの初期配置。items[row][col] = 'badge' | 'beer' | 'clothes:<名前>' | null
  function createItems() {
    const items = [];
    let badges = 0;
    let start = null;
    for (let r = 0; r < cfg.ROWS; r++) {
      const line = [];
      for (let c = 0; c < cfg.COLS; c++) {
        const ch = cfg.MAZE[r][c];
        let it = null;
        if (ch === '.') {
          it = 'badge';
          badges++;
        } else if (ch === 'o') it = 'beer';
        else if (ch >= '1' && ch <= '5') it = 'clothes:' + cfg.CLOTHES[Number(ch) - 1];
        else if (ch === 'P') start = { col: c, row: r };
        line.push(it);
      }
      items.push(line);
    }
    return { items, badges, start };
  }

  // 通れるマスの数(テスト・確認用)
  function countWalkable() {
    let n = 0;
    for (let r = 0; r < cfg.ROWS; r++) for (let c = 0; c < cfg.COLS; c++) if (playerCan(c, r)) n++;
    return n;
  }

  return { at, isWallChar, playerCan, enemyCan, centerX, centerY, colOf, rowOf, wrapX, dx, createItems, countWalkable, W };
})();

// マスの上を動くキャラクター(主人公・敵)に共通の移動処理
// 向き dir の方向へ dist px 進む。マスの中心を通るたびに onCenter(a) を呼び、そこで向きを変えたり止めたりできる
// (onCenter は a.dir を次に進む向きにするか、進めないなら null にする)。
// 曲がるのは必ずマスの中心なので、横に動いている間は y が、縦に動いている間は x がマスの中心からずれない。
NP.move = (function () {
  const T = NP.config.TILE;
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };
  const mod = (a, n) => ((a % n) + n) % n;

  // 今の位置から、向き dir に進んで次のマスの中心に着くまでの距離(中心の上にいるときは 0)
  function toCenter(a, dir) {
    const [dx, dy] = DIRS[dir];
    const v = dx ? a.x : a.y;
    const rel = mod(v - T / 2, T); // いまのマスの中心からのずれ(0 〜 T)
    if (rel < 1e-6 || T - rel < 1e-6) return 0;
    return (dx || dy) > 0 ? T - rel : rel;
  }

  // 中心からのずれが小さいときはぴったり中心にそろえる(小数の誤差をためない)
  function snap(a) {
    for (const k of ['x', 'y']) {
      const rel = mod(a[k] - T / 2, T);
      if (rel < 1e-6) a[k] -= rel;
      else if (T - rel < 1e-6) a[k] += T - rel;
    }
  }

  function advance(a, dist, onCenter) {
    let guard = 0;
    while (dist > 1e-6 && guard++ < 16) {
      if (!a.dir) {
        onCenter(a);
        if (!a.dir) return;
      }
      let d = toCenter(a, a.dir);
      if (d === 0) {
        onCenter(a);
        if (!a.dir) return;
        d = T;
      }
      const s = Math.min(dist, d);
      const [dx, dy] = DIRS[a.dir];
      a.x = NP.maze.wrapX(a.x + dx * s);
      a.y += dy * s;
      dist -= s;
      snap(a);
    }
  }

  // マスの中心にいるか
  const atCenter = (a) => mod(a.x - T / 2, T) < 1e-6 && mod(a.y - T / 2, T) < 1e-6;

  return { DIRS, OPPOSITE, advance, toCenter, atCenter, snap };
})();
