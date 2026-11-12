// 障害物(ビール瓶・ビール缶)
// 状態: 'roll'(鉄骨を転がる) / 'fall'(端から落下中) / 'ladder'(ハシゴを降りる)
window.DP = window.DP || {};

DP.hazards = (function () {
  const geo = DP.geometry;
  const phys = DP.physics;
  let nextId = 1;

  function typeCfg(type) {
    return DP.config.hazard[type];
  }

  function create(level, type, x, girderId, speedMul) {
    const g = level.byId[girderId];
    return {
      id: nextId++,
      type, // 'bottle' | 'can'
      x,
      y: geo.surfaceY(g, x),
      vx: 0,
      vy: 0,
      state: 'roll',
      girder: g,
      dir: g.downhill || 1,
      ladder: null,
      ignore: null, // 落下中に着地しない鉄骨(落ちた元の鉄骨)
      bounced: false,
      speedMul: speedMul || 1,
      spin: 0, // 転がりアニメ用
      checkedLadders: new Set(), // 降りるかどうか判定済みのハシゴ
      jumpedOver: false, // プレイヤーに飛び越えられたか(得点は 1 回だけ)
      burns: false, // 触れると炎上のミスになるか(将来のファイヤースカルなど)
      dead: false,
    };
  }

  function hitbox(h) {
    const c = typeCfg(h.type);
    return { x: h.x, y: h.y, w: c.width, h: c.height };
  }

  // 転がっている途中で通過したハシゴの上で、ときどき下へ降りる。
  // ただしプレイヤーがそのハシゴにつかまっているときは降りずに鉄骨の上を通過する
  // (ハシゴの上では左右によけられないため。上端付近で待てば頭上をやり過ごせる)
  function tryLadder(level, h, prevX, rng, player) {
    for (const l of level.ladders) {
      if (l.noHazard || l.upper !== h.girder || h.checkedLadders.has(l.index)) continue;
      const crossed = (prevX - l.x) * (h.x - l.x) <= 0;
      if (!crossed) continue;
      h.checkedLadders.add(l.index);
      // 乱数はプレイヤーの位置に関係なく 1 回消費する(他の障害物の動きの並びを変えないため)
      const roll = rng();
      const playerOnLadder = !!player && player.state === 'ladder' && player.ladder === l;
      if (!playerOnLadder && roll < DP.config.hazard.ladderChance) {
        h.state = 'ladder';
        h.ladder = l;
        h.x = l.x;
        h.girder = null;
        return true;
      }
    }
    return false;
  }

  // player は省略可(ハシゴを降りるかの判定にだけ使う)
  function update(h, level, rng, player) {
    const hc = DP.config.hazard;
    const c = typeCfg(h.type);
    const W = DP.config.WIDTH;
    const H = DP.config.HEIGHT;
    rng = rng || Math.random;

    if (h.state === 'roll') {
      const speed = c.speed * h.speedMul;
      const prevX = h.x;
      const g = h.girder;
      const ok = phys.moveOnGirder(h, g, h.dir * speed);
      h.spin += speed;
      if (!ok) {
        // 鉄骨の端から下の段へ落ちる
        h.state = 'fall';
        h.vx = h.dir * speed * 0.6;
        h.vy = 0;
        h.ignore = g;
        h.girder = null;
        h.bounced = false;
      } else {
        tryLadder(level, h, prevX, rng, player);
      }
    } else if (h.state === 'fall') {
      const r = phys.stepAirborne(h, level, {
        gravity: hc.gravity,
        maxFall: hc.maxFallSpeed,
        halfW: c.width / 2,
        clampX: false,
        ignore: h.ignore,
      });
      h.spin += Math.abs(h.vx);
      if (r.landed) {
        h.ignore = null;
        if (!h.bounced) {
          // 着地したら 1 回だけ小さく跳ねる。跳ねながら新しい鉄骨の低い側へ向きを変える
          // (向きを変えないと、跳ねている間に鉄骨の端から飛び出してしまう)
          h.bounced = true;
          h.vy = -1.6;
          h.dir = r.landed.downhill || h.dir;
          h.vx = h.dir * c.speed * h.speedMul * 0.6;
        } else {
          h.state = 'roll';
          h.girder = r.landed;
          h.dir = r.landed.downhill || h.dir;
          h.vx = 0;
        }
      }
    } else if (h.state === 'ladder') {
      const l = h.ladder;
      h.y += hc.ladderSpeed * h.speedMul;
      if (h.y >= l.bottomY) {
        h.y = l.bottomY;
        h.state = 'roll';
        h.girder = l.lower;
        h.dir = l.lower.downhill || h.dir;
        h.ladder = null;
        h.checkedLadders.clear();
      }
    }

    // 画面の外に出たら消す
    if (h.x < -c.width || h.x > W + c.width || h.y > H + 40) h.dead = true;
  }

  return { create, update, hitbox };
})();
