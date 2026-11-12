// プレイヤー(赤モヒカンのパンクス)の操作と移動
// 状態: 'ground'(鉄骨の上) / 'air'(ジャンプ・落下中) / 'ladder'(ハシゴ昇降中) / 'dead'
window.DP = window.DP || {};

DP.player = (function () {
  const geo = DP.geometry;
  const phys = DP.physics;

  function create(level) {
    const start = level.stage.playerStart;
    const g = level.byId[start.girder];
    return {
      x: start.x,
      y: geo.surfaceY(g, start.x),
      vx: 0,
      vy: 0,
      facing: start.facing || 1,
      state: 'ground',
      girder: g,
      ladder: null,
      peakY: 0, // 空中にいる間の最高点(落下距離の判定用)
      walkTime: 0, // 歩きアニメ用
      climbTime: 0, // ハシゴアニメ用
      bat: 0, // 釘バットの残りステップ(0 = 持っていない)
      batTime: 0, // 釘バットを持ってからの経過ステップ(振りの上下に使う)
    };
  }

  function cfg() {
    return DP.config.player;
  }

  // 当たり判定の矩形
  function hitbox(p) {
    return { x: p.x, y: p.y, w: cfg().width, h: cfg().height };
  }

  // 釘バットの振りの姿勢。'up'(頭上に振りかぶる)/ 'down'(前の地面に叩きつける)/ null(持っていない)
  function batPhase(p) {
    if (!p.bat || p.state === 'dead') return null;
    return Math.floor(p.batTime / DP.config.bat.swingHalf) % 2 === 0 ? 'up' : 'down';
  }

  // 釘バットの攻撃範囲。上: 頭の上 / 下: 向いている側の足元(前から来るビールは必ず届く広さ)
  function batHitbox(p) {
    const ph = batPhase(p);
    if (ph === 'up') return { x: p.x + p.facing * 4, y: p.y - 20, w: 24, h: 38 };
    if (ph === 'down') return { x: p.x + p.facing * 24, y: p.y + 1, w: 40, h: 20 };
    return null;
  }

  // 今いる鉄骨から、指定の向きでつかめるハシゴを探す。
  // 切れたハシゴは上の段から降りられない(途中が切れているため)
  function findLadder(level, p, dir) {
    for (const l of level.ladders) {
      if (dir === 'down' && l.broken) continue;
      const from = dir === 'up' ? l.lower : l.upper;
      if (from === p.girder && Math.abs(p.x - l.x) <= cfg().ladderGrab) return l;
    }
    return null;
  }

  function startFalling(p, vx) {
    p.state = 'air';
    p.girder = null;
    p.vx = vx;
    p.vy = 0;
    p.peakY = p.y;
  }

  function clampToScreen(p) {
    const half = cfg().width / 2;
    p.x = Math.max(half, Math.min(DP.config.WIDTH - half, p.x));
  }

  // 1 ステップ分の更新。戻り値はイベント({ jumped, landed, died: 'fall' など })
  function update(p, level, input) {
    const c = cfg();
    const ev = {};
    if (p.state === 'dead') return ev;

    if (p.state === 'ground') {
      // 釘バットを持っている間はハシゴにつかまれず、ジャンプもできない
      const armed = p.bat > 0;
      // ハシゴにつかまる(ハシゴの真下・真上にいるときだけ)
      if (!armed && input.isDown('up')) {
        const l = findLadder(level, p, 'up');
        if (l) {
          p.state = 'ladder';
          p.ladder = l;
          p.x = l.x;
          p.girder = null;
          return ev;
        }
      }
      if (!armed && input.isDown('down')) {
        const l = findLadder(level, p, 'down');
        if (l) {
          p.state = 'ladder';
          p.ladder = l;
          p.x = l.x;
          p.y = l.topY + 1;
          p.girder = null;
          return ev;
        }
      }

      let dir = 0;
      if (input.isDown('left')) dir -= 1;
      if (input.isDown('right')) dir += 1;
      if (dir !== 0) p.facing = dir;

      // ジャンプ: 踏み切った瞬間の向きで横速度が決まる(空中では変えられない)
      if (!armed && input.wasPressed('jump')) {
        p.state = 'air';
        p.girder = null;
        p.vx = dir * c.walkSpeed;
        p.vy = -c.jumpVelocity;
        p.peakY = p.y;
        ev.jumped = true;
        return ev;
      }

      if (dir !== 0) {
        p.walkTime++;
        const g = p.girder;
        const prevX = p.x;
        const ok = phys.moveOnGirder(p, g, dir * c.walkSpeed);
        clampToScreen(p);
        if (!ok && !geo.containsX(g, p.x)) {
          // 鉄骨の端から踏み外した
          startFalling(p, dir * c.walkSpeed * 0.5);
        } else {
          p.y = geo.surfaceY(g, p.x);
          // 足音: 歩き始めの 1 歩目から c.stepInterval ステップごとに「ピコ」「ポコ」を交互に。
          // 画面端で足踏みしているだけ(実際に動いていない)ときは鳴らさない
          if (p.x !== prevX && (p.walkTime - 1) % c.stepInterval === 0) {
            ev.step = Math.floor((p.walkTime - 1) / c.stepInterval) % 2 === 0 ? 'stepA' : 'stepB';
          }
        }
      } else {
        p.walkTime = 0;
      }
      return ev;
    }

    if (p.state === 'ladder') {
      // ハシゴ中は左右に動けない。上下だけ
      const l = p.ladder;
      if (input.isDown('up')) {
        if (l.broken) {
          // 切れたハシゴ: 行き止まり(climbTopY)で止まる。上の段には移らない
          if (p.y > l.climbTopY) {
            p.y = Math.max(l.climbTopY, p.y - c.climbSpeed);
            p.climbTime++;
          }
          return ev;
        }
        p.y -= c.climbSpeed;
        p.climbTime++;
        if (p.y <= l.topY) {
          p.y = l.topY;
          p.state = 'ground';
          p.girder = l.upper;
          p.ladder = null;
        }
      } else if (input.isDown('down')) {
        p.y += c.climbSpeed;
        p.climbTime++;
        if (p.y >= l.bottomY) {
          p.y = l.bottomY;
          p.state = 'ground';
          p.girder = l.lower;
          p.ladder = null;
        }
      }
      return ev;
    }

    if (p.state === 'air') {
      const r = phys.stepAirborne(p, level, {
        gravity: c.gravity,
        maxFall: c.maxFallSpeed,
        halfW: c.width / 2,
        height: c.height,
        clampX: true,
      });
      p.peakY = Math.min(p.peakY, p.y);
      if (r.bumped) ev.bumped = true;
      if (r.landed) {
        const fell = p.y - p.peakY;
        p.state = 'ground';
        p.girder = r.landed;
        p.vx = 0;
        ev.landed = true;
        if (fell > c.fatalFall) ev.died = 'fall';
      }
      // 万一画面の下へ出たらミス扱い(通常は最下段で必ず着地する)
      if (p.y > DP.config.HEIGHT + 40) ev.died = 'fall';
      return ev;
    }
    return ev;
  }

  return { create, update, hitbox, batPhase, batHitbox };
})();
