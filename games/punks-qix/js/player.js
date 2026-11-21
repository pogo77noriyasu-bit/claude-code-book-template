// 主人公(黄色モヒカンのパンクス)
// 位置はマス単位。境界線の上は自由に、描画ボタンを押している間だけ未獲得エリアへ線を引いて進める。
PQ.player = (function () {
  const F = () => PQ.field;

  function create(field) {
    // スタートは下の外周の真ん中
    return {
      x: Math.floor(field.cols / 2),
      y: field.rows - 1,
      drawing: false, // 線を引いている途中か
      trail: [], // 描画中の線のマス(引いた順)
      startX: 0, // 線を引き始めた境界線のマス(ミスしたらここへ戻る)
      startY: 0,
      acc: 0, // 速さの端数(1 マス分たまったら 1 マス進む)
      dir: 1, // 最後に動いた左右の向き(1 = 右、-1 = 左)
      face: 'right', // 最後に動いた向き('up' / 'down' / 'left' / 'right')。絵の選び方に使う。止まっても変えない
      walkFrame: 0,
      moved: false, // このステップで 1 マス以上動いたか
      walking: false, // 歩いている途中か(方向キーを押していて、ふさがれていない)。歩きの絵に使う。
      //   速さが 1 マス/ステップより遅いので、moved だけで決めると進まないステップで立ち絵に戻ってちらつく
    };
  }

  // 1 マス進もうとする。返り値: 'move' | 'start' | 'trail' | 'close' | null(進めない)
  function tryStep(p, field, dx, dy, drawHeld) {
    const fl = F();
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!fl.inBounds(field, nx, ny)) return null;
    const cell = fl.get(field, nx, ny);

    if (!p.drawing) {
      // 境界線の上: 境界線から境界線へ(群衆が分かれて境界線が離れたときは、つなぐ「橋」の白い線も歩ける)
      if (fl.isWalkable(field, nx, ny)) {
        p.x = nx;
        p.y = ny;
        return 'move';
      }
      // 描画ボタンを押しながら未獲得エリアへ入ると、線を引き始める
      if (cell === fl.EMPTY && drawHeld) {
        p.drawing = true;
        p.startX = p.x;
        p.startY = p.y;
        p.trail = [{ x: nx, y: ny }];
        fl.set(field, nx, ny, fl.TRAIL);
        p.x = nx;
        p.y = ny;
        return 'start';
      }
      return null;
    }

    // 線を引いている途中: 描画ボタンを離すとその場で止まる
    if (!drawHeld) return null;
    if (cell === fl.EMPTY) {
      p.trail.push({ x: nx, y: ny });
      fl.set(field, nx, ny, fl.TRAIL);
      p.x = nx;
      p.y = ny;
      return 'trail';
    }
    if (cell === fl.FILLED) {
      // 既存の境界線に着いた → 陣地を確定(確定処理は game.js)
      p.x = nx;
      p.y = ny;
      return 'close';
    }
    return null; // 自分の線(TRAIL)には戻れない
  }

  // 入力に合わせて動かす。dirs は押している方向キーの一覧(最後に押したものが先頭)
  // 返り値: このステップで起きたこと(tryStep の結果の一覧)
  function update(p, field, dirs, drawHeld) {
    const cfg = PQ.config.player;
    const events = [];
    p.moved = false;
    p.walking = false;
    if (!dirs.length) {
      p.acc = 0;
      return events;
    }
    let blocked = false;
    p.acc += p.drawing ? cfg.drawSpeed : cfg.edgeSpeed;
    while (p.acc >= 1 - 1e-9) { // 小数の誤差で 1 マス遅れないように少し余裕を持たせる
      p.acc -= 1;
      let ev = null;
      // 最後に押した方向から順に試す(角で別の方向キーも押していれば曲がれる)
      for (const d of dirs) {
        ev = tryStep(p, field, d.dx, d.dy, drawHeld);
        if (ev) {
          // 実際に進んだ向きを覚える(外周・境界線・線を引いている途中のどれでも同じ)
          if (d.dx) p.dir = d.dx;
          p.face = d.dx > 0 ? 'right' : d.dx < 0 ? 'left' : d.dy < 0 ? 'up' : 'down';
          break;
        }
      }
      if (!ev) {
        p.acc = 0;
        blocked = true;
        break;
      }
      p.moved = true;
      events.push(ev);
      if (ev === 'close') break; // 確定したらこのステップはここまで
    }
    if (p.moved) p.walkFrame++;
    p.walking = p.moved || !blocked;
    return events;
  }

  // 線を消して、引き始めた場所へ戻す(ミスのとき)
  function resetTrail(p, field) {
    if (p.drawing) {
      F().clearTrail(field, p.trail);
      p.x = p.startX;
      p.y = p.startY;
    }
    p.drawing = false;
    p.trail = [];
    p.acc = 0;
  }

  // 陣地を確定したあと、主人公のマスが境界線でなくなっていたら(獲得済みの内側に埋もれたら)、
  // いちばん近い境界線のマスへ移す。移さないと、隣に歩けるマスがなく動けなくなることがある。
  // 返り値: 移したか
  function snapToEdge(p, field) {
    const fl = F();
    if (fl.isWalkable(field, p.x, p.y)) return false;
    const e = fl.nearestEdge(field, p.x, p.y);
    if (!e) return false; // 未獲得のマスが残っていない(境界線がない)
    p.x = e.x;
    p.y = e.y;
    p.acc = 0;
    return true;
  }

  // ピクセル座標(フィールド内)での中心
  function center(p) {
    const c = PQ.config.CELL;
    return { x: p.x * c + c / 2, y: p.y * c + c / 2 };
  }

  return { create, update, resetTrail, snapToEdge, center, tryStep };
})();
