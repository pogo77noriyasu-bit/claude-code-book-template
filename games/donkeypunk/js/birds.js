// 空飛ぶパンクニワトリ(3 面の敵)
// ステージデータの birds.lines に書いた 4 本の飛行ラインを、決まった向きに水平に飛ぶ。
// ラインの y は「その高さの床の上面」。鳥はその床すれすれを飛ぶので、床を普通に歩いている主人公には当たり、
// ジャンプすれば上を跳び越えられる。画面の外へ出たら消える。羽ばたきは見た目だけで、当たり判定は変わらない。
// 出現・移動・当たり判定は仕掛け 'birds'(js/mechanics.js)が毎ステップ呼ぶ。状態はレベル(ミスすると組み立て直す)に持つ。
window.DP = window.DP || {};

DP.birds = (function () {
  const cfg = () => DP.config.bird;
  let nextId = 1;

  // ライン line(ステージデータの 1 本)に鳥を 1 羽作る。x を省くと、飛んでくる側の画面の外から
  function create(line, index, x) {
    const c = cfg();
    return {
      id: nextId++,
      type: 'bird',
      line: index, // 何本目のラインか(0 = いちばん上)
      color: line.color,
      dir: line.dir, // 1 = 左 → 右 / -1 = 右 → 左
      x: x !== undefined ? x : line.dir > 0 ? -c.offscreen : DP.config.WIDTH + c.offscreen,
      y: line.y, // 床の上面(鳥の絵の下端)
      anim: 0, // 羽ばたき用の経過ステップ
      dead: false,
    };
  }

  // 1 ステップ進める。画面の外へ出たら dead
  function update(b) {
    const c = cfg();
    b.x += b.dir * c.speed;
    b.anim++;
    if (b.x < -c.offscreen - 1 || b.x > DP.config.WIDTH + c.offscreen + 1) b.dead = true;
  }

  // 羽の向き(見た目だけ)。'up' と 'down' を flapFrames ステップごとに入れ替える
  function wing(b) {
    return Math.floor(b.anim / cfg().flapFrames) % 2 === 0 ? 'up' : 'down';
  }

  // 当たり判定(胴体だけ。羽・トサカ・足は含めない)。{x(中心), y(下端), w, h}
  function hitbox(b) {
    const c = cfg();
    return { x: b.x, y: b.y - c.hitLift, w: c.hitWidth, h: c.hitHeight };
  }

  return { create, update, wing, hitbox };
})();
