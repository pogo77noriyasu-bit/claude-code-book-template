// 怒ったポリスマン(4 面の雑魚敵)。面間演出の作業員と同じドット絵(sprites.js の cop*)。
// 2 面のファイヤースカル(skulls.js)の動きを下敷きにした、動きを読んでよけられる敵:
//   ・鉄骨の上を歩き、ハシゴで段を移って、主人公のいる段へゆるく寄ってくる(確率で動くので一直線には追わない)
//   ・主人公の方へ振り向くときは、必ず turnFrames(0.2 秒)立ち止まって頭の上に「!」を出してから振り向く(予告)
//   ・ジャンプしない。足場の端・ピンを抜いた穴の手前で折り返すので、歩いて落ちることはない
//   ・主人公がつかまっているハシゴには入らず、そのハシゴの上下の足場でも playerWall より近づかない
//   ・足元の安全ピンを抜かれると、穴から下の段へ落ちて気絶し(300 点)、しばらくして消える。出現地点からまた出てくる
// 状態: 'spawn'(笛の合図で点滅しながら現れる。当たらない)→ 'walk' ⇔ 'turn'(「!」の予告)⇔ 'ladder'
//       → (足元のピンを抜かれたら)'fall'(落ちる。当たらない)→ 'stunned'(気絶。当たらない)→ 消える(dead)
// 速さ・確率・人数は周回で変わる(config.cop の配列。1 周目・2 周目・3 周目以降)。出現は仕掛け 'cops'(mechanics.js)。
window.DP = window.DP || {};

DP.cops = (function () {
  const geo = DP.geometry;
  let nextId = 1;

  const cfg = () => DP.config.cop;
  // 周回ごとの値(配列なら 1 周目・2 周目・3 周目以降)
  const byRound = (v, round) => (Array.isArray(v) ? v[Math.min(round, v.length) - 1] : v);

  // girderId の鉄骨の x に出す。opts: { dir, skipSpawn, round }
  function create(level, girder, x, opts) {
    opts = opts || {};
    const g = typeof girder === 'string' ? level.byId[girder] : girder;
    const round = opts.round || 1;
    const c = cfg();
    return {
      id: 'cop' + nextId++,
      type: 'cop',
      state: opts.skipSpawn ? 'walk' : 'spawn',
      x,
      y: geo.surfaceY(g, x),
      girder: g,
      ladder: null,
      dir: opts.dir || 1,
      vdir: 0,
      vy: 0,
      t: 0,
      anim: 0,
      think: 0,
      lastLadder: -1,
      turnTo: 0, // 「!」の予告のあとに向く向き
      landOn: null, // 落ちる先の鉄骨
      // 周回ごとの値(出したときに決める)
      speed: byRound(c.speed, round),
      climbSpeed: byRound(c.climbSpeed, round),
      sameLevelChase: byRound(c.sameLevelChase, round),
      jumpedOver: false,
      burns: false,
      dead: false,
    };
  }

  // 主人公と当たらない状態か(現れている途中・落ちている・気絶している)
  function isHarmless(e) {
    return e.state === 'spawn' || e.state === 'fall' || e.state === 'stunned';
  }

  // 当たり判定(帽子を除いた顔と体。足元基準)
  function hitbox(e) {
    const c = cfg();
    return { x: e.x, y: e.y, w: c.hitWidth, h: c.hitHeight };
  }

  // ジャンプで飛び越えたら得点になる状態か(歩いている・振り向きの予告中)
  function canJumpOver(e) {
    return e.state === 'walk' || e.state === 'turn';
  }

  function playerLadder(player) {
    return player && player.state === 'ladder' ? player.ladder : null;
  }

  // 主人公が同じ足場の上に立っているか(穴で分かれた床は別の足場)
  function sameLevel(e, player) {
    return !!player && player.state === 'ground' && player.girder === e.girder;
  }

  // 通りかかったハシゴを使う確率。主人公がいる段の方向へのハシゴなら chaseChance、ほかは ladderChance
  function ladderChanceFor(e, l, player) {
    const c = cfg();
    const up = l.lower === e.girder;
    const toward = !!player && player.state !== 'dead' && (up ? player.y < e.y - 20 : player.y > e.y + 20);
    return toward ? c.chaseChance : c.ladderChance;
  }

  // 向きを決める(考え直すとき・ハシゴを移ったとき)。主人公の方へ向きを変えるときは「!」の予告(turn)を挟む
  function decide(e, player, r) {
    const c = cfg();
    let want;
    let toward = false;
    if (sameLevel(e, player)) {
      const tw = player.x >= e.x ? 1 : -1;
      want = r < e.sameLevelChase ? tw : -tw;
      toward = want === tw;
    } else {
      want = r < c.wanderChance ? -e.dir : e.dir;
    }
    if (toward && want !== e.dir) {
      e.state = 'turn';
      e.turnTo = want;
      e.t = 0;
    } else {
      e.dir = want;
    }
  }

  // 足場の上の 1 ステップ
  function walk(e, level, player, rng) {
    const c = cfg();
    const g = e.girder;
    const prevX = e.x;
    e.think++;
    if (e.think >= c.thinkInterval) {
      e.think = 0;
      decide(e, player, rng());
      if (e.state === 'turn') return; // 立ち止まって「!」
    }
    let nx = e.x + e.dir * e.speed;

    // 主人公がつかまっているハシゴは「壁」: そのハシゴの上下の足場では、ハシゴへ playerWall より近づかない
    const pl = playerLadder(player);
    if (pl && (pl.lower === g || pl.upper === g)) {
      const near = Math.abs(nx - pl.x) < c.playerWall;
      if (near && Math.abs(nx - pl.x) < Math.abs(e.x - pl.x)) {
        e.dir = nx > pl.x ? 1 : -1;
        nx = e.x + e.dir * e.speed;
        if (Math.abs(nx - pl.x) < Math.abs(e.x - pl.x)) nx = e.x;
      }
    }

    // 足場の端(ピンを抜いた穴の端も同じ)の手前で折り返す。落ちない
    const minX = g.x1 + c.edgeMargin;
    const maxX = g.x2 - c.edgeMargin;
    if (nx < minX) { nx = minX; e.dir = 1; }
    if (nx > maxX) { nx = maxX; e.dir = -1; }
    e.x = nx;
    e.y = geo.surfaceY(g, e.x);

    if (e.lastLadder >= 0) {
      const l = level.ladders[e.lastLadder];
      if (Math.abs(e.x - l.x) > 12) e.lastLadder = -1;
    }

    // 通りかかったハシゴで、ときどき上下の足場へ移る(主人公がいる段の方向へは行きやすい)
    for (const l of level.ladders) {
      if (l.noHazard || l.broken || l.index === e.lastLadder) continue;
      if (l.lower !== g && l.upper !== g) continue;
      if ((prevX - l.x) * (e.x - l.x) > 0) continue;
      e.lastLadder = l.index;
      const chance = ladderChanceFor(e, l, player);
      const roll = rng();
      if (roll < chance && pl !== l) {
        e.state = 'ladder';
        e.ladder = l;
        e.vdir = l.lower === g ? -1 : 1;
        e.x = l.x;
        e.girder = null;
        e.t = 0;
        return;
      }
    }
  }

  // ハシゴの上の 1 ステップ。主人公が同じハシゴにつかまったら、主人公から離れる向きへ引き返す
  function climb(e, player, rng) {
    const l = e.ladder;
    if (playerLadder(player) === l) e.vdir = player.y < e.y ? 1 : -1;
    e.y += e.vdir * e.climbSpeed;
    if (e.vdir < 0 && e.y <= l.topY) arrive(e, l.upper, l.topY, l, player, rng);
    else if (e.vdir > 0 && e.y >= l.bottomY) arrive(e, l.lower, l.bottomY, l, player, rng);
  }

  // ハシゴを登った(降りた)ところ。今の向きのまま着いて、向きを決め直す(主人公の方へ変えるなら「!」の予告)
  function arrive(e, g, y, l, player, rng) {
    e.state = 'walk';
    e.girder = g;
    e.y = y;
    e.ladder = null;
    e.lastLadder = l.index;
    e.think = 0;
    e.t = 0;
    decide(e, player, rng());
  }

  // 足元のピンが抜かれて穴が開いたら、下の段へ落とす(pin: 抜いたピン)。落とした敵の数を返す
  function dropIntoHole(enemies, level, pin) {
    const h = DP.config.pin.halfWidth;
    let n = 0;
    for (const e of enemies) {
      if (e.type !== 'cop' || e.dead || !e.girder) continue;
      if (e.state !== 'walk' && e.state !== 'turn' && e.state !== 'spawn') continue;
      if ((e.girder.floor || e.girder.id) !== pin.girder || Math.abs(e.x - pin.x) > h) continue;
      e.state = 'fall';
      e.t = 0;
      e.vy = 0;
      e.girder = null;
      e.landOn = geo.girderBelow ? geo.girderBelow(level, e.x, e.y + 1) : null;
      n++;
    }
    return n;
  }

  // 1 ステップ分の更新。{ stunned: true } のとき、そのステップで気絶した(得点・音は仕掛けが出す)
  function update(e, level, player, rng) {
    const c = cfg();
    e.t++;
    e.anim++;
    const ev = {};
    if (e.state === 'spawn') {
      if (e.t >= c.spawnFrames) {
        e.state = 'walk';
        e.t = 0;
      }
    } else if (e.state === 'turn') {
      // 立ち止まって「!」(turnFrames)。そのあと主人公の方へ振り向いて歩き出す
      if (e.t >= c.turnFrames) {
        e.dir = e.turnTo;
        e.state = 'walk';
        e.t = 0;
        e.think = 0;
      }
    } else if (e.state === 'walk') {
      walk(e, level, player, rng);
    } else if (e.state === 'ladder') {
      climb(e, player, rng);
    } else if (e.state === 'fall') {
      // 穴から下の段へ落ちる。着いたら気絶
      e.vy = Math.min(e.vy + c.gravity, c.maxFall);
      e.y += e.vy;
      const floorY = e.landOn ? geo.surfaceY(e.landOn, e.x) : Infinity;
      if (e.y >= floorY) {
        e.y = floorY;
        e.girder = e.landOn;
        e.state = 'stunned';
        e.t = 0;
        ev.stunned = true;
      } else if (e.y > DP.config.HEIGHT + 40) {
        e.dead = true;
        ev.stunned = true;
      }
    } else if (e.state === 'stunned') {
      // 目を回して気絶。stunFrames たったら消える(出現地点からまた出てくる)
      if (e.t >= c.stunFrames) e.dead = true;
    }
    return ev;
  }

  return { create, update, hitbox, isHarmless, canJumpOver, dropIntoHole, ladderChanceFor, byRound };
})();
