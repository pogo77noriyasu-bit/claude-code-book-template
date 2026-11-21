// 主人公(緑モヒカンのパンクス)
// 1 回の入力で上下左右へ 1 マス跳ぶ。跳んでいる間(hopSteps ステップ)は次の入力を受け付けない(1 つだけ先に覚えておく)。
// 位置: row = 行(0 = 入口の行 … 12 = スタート)、x = 中心の x(px)。
// 川では浮遊物と一緒に流されるので、x はマスの中心からずれる。道路・安全地帯・スタートに着地したらマスの中心にそろえる。
PW.player = (function () {
  const C = () => PW.config;
  const DIRS = {
    up: { dx: 0, dy: -1, face: 'up' },
    down: { dx: 0, dy: 1, face: 'down' },
    left: { dx: -1, dy: 0, face: 'left' },
    right: { dx: 1, dy: 0, face: 'right' },
  };

  // 列 col の中心の x
  const colX = (col) => col * C().TILE + C().TILE / 2;
  // x にいちばん近い列
  const nearestCol = (x) => Math.round((x - C().TILE / 2) / C().TILE);
  const isRiver = (row) => C().RIVER_ROWS.includes(row);

  function create() {
    return {
      row: C().START_ROW,
      x: colX(C().START_COL),
      hop: null, // 跳んでいる途中 { t, fromX, toX, fromRow, toRow }
      face: 'up', // 最後に跳んだ向き(止まっているときもこの向きの絵)
      bestRow: C().START_ROW, // この回(スタートしてからゴール・ミスまで)でいちばん前に進んだ行。前進の得点に使う
      hops: 0, // 跳んだ回数(歩きの絵のコマに使う)
    };
  }

  // スタート地点へ戻す(ゴール・ミスのあと)
  function reset(p) {
    Object.assign(p, create(), { face: 'up' });
  }

  // name の向きへ跳び始める。返り値: 跳び始めたか(跳んでいる途中・画面の端・スタートより下は跳ばない)
  function tryHop(p, name) {
    const d = DIRS[name];
    if (!d || p.hop) return false;
    const T = C().TILE;
    const toRow = p.row + d.dy;
    if (toRow < 0 || toRow > C().START_ROW) return false;
    let toX = p.x + d.dx * T;
    // 横は画面の中だけ(中心が端のマスの中心より外へは跳ばない)
    if (d.dx && (toX < colX(0) - 0.5 || toX > colX(C().COLS - 1) + 0.5)) return false;
    // 道路・安全地帯・スタートに着地するときはマスの中心にそろえる(川と入口の行は流された位置のまま)
    if (!isRiver(toRow) && toRow !== C().GOAL_ROW) toX = colX(Math.min(C().COLS - 1, Math.max(0, nearestCol(toX))));
    p.hop = { t: 0, fromX: p.x, toX, fromRow: p.row, toRow };
    p.face = d.face;
    p.hops++;
    return true;
  }

  // 1 ステップ進める。返り値: 'landed'(このステップで着地した)か null
  function update(p, L) {
    const cfg = C();
    if (p.hop) {
      const h = p.hop;
      // 川から跳んだときは、跳んでいる間も元のレーンの流れに乗って動く
      const v = isRiver(h.fromRow) ? PW.lanes.velocity(L, h.fromRow) : 0;
      h.fromX += v;
      h.toX += v;
      h.t++;
      const k = h.t / cfg.hero.hopSteps;
      p.x = h.fromX + (h.toX - h.fromX) * k;
      if (h.t >= cfg.hero.hopSteps) {
        p.row = h.toRow;
        p.x = h.toX;
        p.hop = null;
        return 'landed';
      }
      return null;
    }
    // 川の上で止まっているときは、乗っているレーンと一緒に流される
    if (isRiver(p.row)) p.x += PW.lanes.velocity(L, p.row);
    return null;
  }

  // 今の行(跳んでいる途中は小数。描画と車の当たり判定に使う)
  function rowF(p) {
    if (!p.hop) return p.row;
    const k = p.hop.t / C().hero.hopSteps;
    return p.hop.fromRow + (p.hop.toRow - p.hop.fromRow) * k;
  }

  // 跳ねている高さ(px。見た目だけ)
  function lift(p) {
    if (!p.hop) return 0;
    return Math.sin((Math.PI * p.hop.t) / C().hero.hopSteps) * C().hero.hopHeight;
  }

  return { create, reset, tryHop, update, rowF, lift, colX, nearestCol, DIRS };
})();
