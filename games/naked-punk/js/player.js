// 主人公の移動
// 押した向き(want)は、ほかの向きを押すまで覚えておく(押しっぱなしにしなくても進み続ける。スマホでも遊びやすい)。
//   - 逆向きはいつでもすぐ折り返す
//   - 曲がり角では、マスの中心に着いたときに押した向きへ曲がる(先に押しておけば曲がれる)
//   - 中心を少し通り過ぎてから押しても、turnWindow px 以内なら中心へ戻して曲がる(押すのが遅れたときの救済)
//   - 押した向きへ進めず、今の向きにも進めなければ止まる
NP.player = (function () {
  const cfg = NP.config;
  const T = cfg.TILE;
  const M = NP.move;

  function create(col, row) {
    return {
      x: NP.maze.centerX(col),
      y: NP.maze.centerY(row),
      dir: null, // 今進んでいる向き(止まっていれば null)
      want: null, // 押した向き
      face: 'left', // 絵の向き(止まっているときは最後に進んだ向き)
      walk: 0, // 歩いた量(歩きの絵のコマ送り)
      moving: false,
    };
  }

  // 中心 (x, y) のマスから向き d の隣へ進めるか
  function canGo(x, y, d) {
    const [dx, dy] = M.DIRS[d];
    return NP.maze.playerCan(NP.maze.colOf(x) + dx, NP.maze.rowOf(y) + dy);
  }

  function update(p, speed) {
    // 逆向き: すぐ折り返す
    if (p.want && p.dir && p.want === M.OPPOSITE[p.dir]) p.dir = p.want;
    // 曲がるのが少し遅れたとき: 通り過ぎた中心へ戻して曲がる
    if (p.want && p.dir && p.want !== p.dir && !M.atCenter(p)) {
      const back = M.toCenter(p, M.OPPOSITE[p.dir]); // 後ろの中心までの距離
      if (back > 0 && back <= cfg.player.turnWindow) {
        const [dx, dy] = M.DIRS[p.dir];
        const cx = NP.maze.wrapX(p.x - dx * back);
        const cy = p.y - dy * back;
        if (canGo(cx, cy, p.want)) {
          p.x = cx;
          p.y = cy;
          p.dir = p.want;
        }
      }
    }
    const x0 = p.x;
    const y0 = p.y;
    M.advance(p, speed, (a) => {
      // マスの中心に着いた: 押した向きへ進めるならそちらへ、だめなら今の向きのまま、それもだめなら止まる
      if (a.want && canGo(a.x, a.y, a.want)) a.dir = a.want;
      else if (!a.dir || !canGo(a.x, a.y, a.dir)) a.dir = null;
    });
    p.moving = p.x !== x0 || p.y !== y0;
    if (p.moving) {
      p.face = p.dir || p.face;
      p.walk++;
    }
  }

  // 今いるマス
  const tile = (p) => ({ col: NP.maze.colOf(p.x), row: NP.maze.rowOf(p.y) });

  return { create, update, tile, canGo };
})();
