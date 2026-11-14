// 4 面: 警察ヘリ(アパッチ風)と、パラシュートで降りてくる機動隊員、その銃弾
// ・ヘリ: 画面の上空を左右どちらかから横切り、主人公が向かっていそうな場所の真上で機動隊員を投下して、反対側へ飛び去る。
//         ヘリ自体に当たり判定はなく、攻撃もしない(機関砲・ポッドは見た目だけ)
// ・機動隊員: 'chute'(パラシュートで降下。当たらない・撃たない)→ 'land'(着地直後の猶予。撃たない)→ 'walk' ⇔ 'aim'(構え。銃口が点滅)
//             → 'fire'(発砲の反動)→ 'walk' …。足元のピンを抜かれると 'fall' → 'stunned'(ポリスマンと同じく 300 点)→ 消える
//             鉄骨の上を左右に歩くだけでハシゴは使わない。主人公がつかまっているハシゴには近づかない。
//             主人公が同じ段(同じ足場)にいれば、立ち止まって主人公の方を向き、構えてから水平に撃つ。ハシゴの上の主人公は撃たない
// ・銃弾: 床から bulletLift〜bulletLift + bulletH の高さを水平にまっすぐ飛ぶ(誘導しない)。普通のジャンプで跳び越えられる。
//         ハシゴの上の主人公には当たらない(身動きが取れない場面の理不尽な死亡を防ぐ)
// 周回ごとの値はステージデータの riot.rounds(R11 以降は R10)。出現のタイミング・銃弾・得点は仕掛け 'riot'(mechanics.js)。
// 機動隊員は g.enemies に入れる(type 'riot')ので、主人公との当たり判定・釘バットでの撃破(1,000 点)・体の跳び越え(100 点)は
// game.js の敵に共通の処理で行い、ピンの穴での鉄骨の付け替え・穴への落下(cops.dropIntoHole)も既存の処理を使う。
window.DP = window.DP || {};

DP.riot = (function () {
  const geo = DP.geometry;
  const cfg = () => DP.config.riot;
  let nextId = 1;

  // 周回ごとの値(ステージデータの riot.rounds。1 行目が R1。R11 以降は最後の行 = R10)。表のない面は null
  function rules(stage, round) {
    const rows = stage && stage.riot && stage.riot.rounds;
    if (!rows || rows.length === 0) return null;
    return rows[Math.min(rows.length - 1, Math.max(0, (round || 1) - 1))];
  }

  // ---- ヘリ ----
  // side: 1 = 左から右へ / -1 = 右から左へ。targets: [{ floor, x }](この真上を通ったら投下する)
  function createHeli(side, targets) {
    const c = cfg();
    return {
      id: 'heli' + nextId++,
      dir: side,
      x: side > 0 ? -c.heliOffscreen : DP.config.WIDTH + c.heliOffscreen,
      y: c.heliY,
      t: 0,
      targets: targets.map((tg) => Object.assign({ dropped: false }, tg)),
      dead: false,
    };
  }

  // ヘリを 1 ステップ進める。投下する目標の一覧を返す(この真上を今のステップで通った)
  function updateHeli(h) {
    const c = cfg();
    const prev = h.x;
    h.x += h.dir * c.heliSpeed;
    h.t++;
    const drops = [];
    for (const tg of h.targets) {
      if (tg.dropped) continue;
      if ((prev - tg.x) * (h.x - tg.x) <= 0) { tg.dropped = true; drops.push(tg); }
    }
    if (h.x < -c.heliOffscreen - 2 || h.x > DP.config.WIDTH + c.heliOffscreen + 2) h.dead = true;
    return drops;
  }

  // ヘリが画面に見えているか(ローター音を鳴らす間)
  function heliOnScreen(h) {
    const half = cfg().heliHalfWidth;
    return h.x + half > 0 && h.x - half < DP.config.WIDTH;
  }

  // ---- 投下する場所 ----
  // 主人公がいる段(ハシゴの上なら上の段、空中なら真下の段)の床の id
  function playerFloor(level, p) {
    if (p.state === 'ground' && p.girder) return p.girder.floor || p.girder.id;
    if (p.state === 'ladder' && p.ladder) return p.ladder.upper.floor || p.ladder.upper.id;
    // 空中: 足元より下でいちばん近い床
    let best = null;
    for (const g of level.girders) {
      if (g.kind === 'lift' || g.noHazard || !geo.containsX(g, p.x)) continue;
      const y = geo.surfaceY(g, p.x);
      if (y >= p.y - 2 && (!best || y < best.y)) best = { id: g.floor || g.id, y };
    }
    return best ? best.id : null;
  }

  // その床で、x に機動隊員が降りてよいか(足場があり、穴・床の端・ハシゴ・ゴリラ・ほかの隊員から離れている)
  function landable(level, floor, x, avoid, boss) {
    const c = cfg();
    if (x < c.screenMargin || x > DP.config.WIDTH - c.screenMargin) return false;
    const seg = level.girders.find((g) => (g.floor || g.id) === floor && g.kind !== 'lift' && x >= g.x1 + c.holeMargin && x <= g.x2 - c.holeMargin);
    if (!seg) return false;
    for (const l of level.ladders) {
      const lo = l.lower.floor || l.lower.id;
      const up = l.upper.floor || l.upper.id;
      if ((lo === floor || up === floor) && Math.abs(l.x - x) < c.ladderMargin) return false;
    }
    if (boss && boss.girder && (boss.girder.floor || boss.girder.id) === floor && Math.abs(boss.x - x) < c.bossMargin) return false;
    for (const a of avoid) if (a.floor === floor && Math.abs(a.x - x) < c.riotSpacing) return false;
    return true;
  }

  // 投下する目標を n か所まで選ぶ。主人公の段で、向いている先(前方 targetDist px)を優先し、だめなら後ろ。
  // 主人公から minPlayerDist 以上離す(真上から降ってきて避けられない、をなくす)。enemies: 今いる機動隊員(重ならないように)
  function chooseTargets(level, p, n, enemies, boss) {
    const c = cfg();
    const floor = playerFloor(level, p);
    if (!floor || n <= 0) return [];
    const face = p.facing || 1;
    const avoid = enemies.filter((e) => e.type === 'riot' && !e.dead).map((e) => ({ floor: e.targetFloor || (e.girder && (e.girder.floor || e.girder.id)), x: e.x }));
    const out = [];
    for (const s of [face, -face]) {
      for (const d of c.targetDist) {
        if (out.length >= n) break;
        const x = Math.round(p.x + s * d);
        if (Math.abs(x - p.x) < c.minPlayerDist) continue;
        if (!landable(level, floor, x, avoid.concat(out), boss)) continue;
        out.push({ floor, x });
      }
    }
    return out.slice(0, n);
  }

  // ---- 機動隊員 ----
  // ヘリから投下する(パラシュートで降りる)。target: { floor, x }。r: 周回の値
  function createDrop(heli, target, r) {
    const c = cfg();
    return {
      id: 'riot' + nextId++,
      type: 'riot',
      state: 'chute',
      x: target.x,
      tx: target.x,
      y: heli.y + c.dropBelow,
      targetFloor: target.floor,
      girder: null,
      dir: heli.dir,
      t: 0,
      anim: 0,
      think: 0,
      cool: 0, // 次に構えられるまで
      aimFrames: r.aim,
      fireEvery: r.cooldown,
      bulletSpeed: r.bullet,
      speed: r.speed,
      landGrace: false,
      vy: 0,
      landOn: null,
      jumpedOver: false,
      burns: false,
      dead: false,
    };
  }

  // テスト補助・面の途中から: 鉄骨の上に直接置く(opts.state: 'walk' | 'land' など)
  function createOn(level, girder, x, r, opts) {
    opts = opts || {};
    const g = typeof girder === 'string' ? level.byId[girder] : girder;
    const e = createDrop({ y: 0, dir: opts.dir || 1 }, { floor: g.floor || g.id, x }, r);
    e.state = opts.state || 'walk';
    e.girder = g;
    e.y = geo.surfaceY(g, x);
    e.dir = opts.dir || 1;
    if (e.state === 'walk') e.t = cfg().landFrames;
    if (opts.cool) e.cool = opts.cool; // 次に構えられるまで(テスト補助: 撃たせずに歩かせる)
    return e;
  }

  // 主人公と当たらない状態か(降下中・落ちている・気絶している・着地のときに重なっていて、まだ離れていない)
  function isHarmless(e) {
    return e.state === 'chute' || e.state === 'fall' || e.state === 'stunned' || !!e.landGrace;
  }

  // 当たり判定(ヘルメットのてっぺんを除いた体。足元基準)
  function hitbox(e) {
    const c = cfg();
    return { x: e.x, y: e.y, w: c.hitWidth, h: c.hitHeight };
  }

  // ジャンプで体を跳び越えたら 100 点になる状態か(床に立っているとき)
  function canJumpOver(e) {
    return (e.state === 'walk' || e.state === 'aim' || e.state === 'fire' || e.state === 'land') && !e.landGrace;
  }

  // 主人公が同じ段(同じ足場)にいるか。地上なら同じ鉄骨、空中ならこの段の床から跳んだとき。ハシゴの上は数えない
  function sameFloor(e, p) {
    if (!p || !e.girder) return false;
    if (p.state === 'ground') return p.girder === e.girder;
    if (p.state === 'air' && p.jumpFromY != null) return Math.abs(p.jumpFromY - e.y) < 4 && p.x >= e.girder.x1 - 8 && p.x <= e.girder.x2 + 8;
    return false;
  }

  // 1 ステップ進める。戻り値 { fire: 銃弾 | undefined, stunned, landed }
  function update(e, level, p, rng) {
    const c = cfg();
    e.t++;
    e.anim++;
    const ev = {};
    if (e.state === 'chute') {
      // ふらふら左右に揺れながら降りる(揺れの位相は投下した位置から)。目標の床より上の床はすり抜ける
      const prevY = e.y;
      e.y += c.chuteSpeed;
      e.x = e.tx + c.swayAmp * Math.sin((2 * Math.PI * e.t) / c.swayPeriod);
      const targetY = targetFloorY(level, e);
      const land = level.girders.find((g) => g.kind !== 'lift' && !g.noHazard && geo.containsX(g, e.x) &&
        geo.surfaceY(g, e.x) >= targetY - 0.5 && prevY < geo.surfaceY(g, e.x) && e.y >= geo.surfaceY(g, e.x));
      if (land) {
        e.girder = land;
        e.y = geo.surfaceY(land, e.x);
        // 足場の端に寄りすぎていたら内側へ(揺れで端に降りても、歩けるように)
        e.x = Math.max(land.x1 + c.edgeMargin, Math.min(land.x2 - c.edgeMargin, e.x));
        e.state = 'land';
        e.t = 0;
        e.dir = p && p.x < e.x ? -1 : 1;
        // 着地した瞬間に主人公のすぐそば(landSafe 以内)なら、主人公が離れるまで当たらない(理不尽な即死を防ぐ。
        // 投下する場所は主人公から離して選ぶが、降りてくる間に主人公がそちらへ歩いてくることがある)
        e.landGrace = tooClose(e, p);
        ev.landed = true;
      } else if (e.y > DP.config.HEIGHT + 40) {
        e.dead = true;
      }
      return ev;
    }
    if (e.state === 'fall') {
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
      return ev;
    }
    if (e.state === 'stunned') {
      if (e.t >= c.stunFrames) e.dead = true;
      return ev;
    }
    // 着地のときにすぐそばにいたら、主人公が離れたかを毎ステップ確かめる
    if (e.landGrace && !tooClose(e, p)) e.landGrace = false;
    if (e.cool > 0) e.cool--;
    const near = sameFloor(e, p);
    if (e.state === 'land') {
      // 着地直後の猶予(撃たない)。そのあと歩き出す
      if (e.t >= c.landFrames) { e.state = 'walk'; e.t = 0; }
      return ev;
    }
    if (e.state === 'aim') {
      // 構え: 主人公がこの段からいなくなった・至近距離に来たら構えを解く。aimFrames たったら撃つ
      if (!near || (p && p.state === 'ladder') || Math.abs(p.x - e.x) < c.minShootDist) { e.state = 'walk'; e.t = 0; e.cool = c.cancelCool; return ev; }
      if (e.t >= e.aimFrames) {
        e.state = 'fire';
        e.t = 0;
        e.cool = e.fireEvery;
        ev.fire = createBullet(e);
      }
      return ev;
    }
    if (e.state === 'fire') {
      if (e.t >= c.fireFrames) { e.state = 'walk'; e.t = 0; }
      return ev;
    }
    // 歩く。主人公が同じ段にいて、撃てる(待ちが終わっている)なら、主人公の方を向いて構える
    if (near && e.cool <= 0 && !e.landGrace && Math.abs(p.x - e.x) >= c.minShootDist) {
      e.dir = p.x >= e.x ? 1 : -1;
      e.state = 'aim';
      e.t = 0;
      return ev;
    }
    walk(e, level, p, rng);
    return ev;
  }

  // 主人公が機動隊員のすぐそば(横に landSafe 以内で、同じ床の上か、その上の空中 = 床から 60px 上まで。重なっているときも含む)にいるか
  function tooClose(e, p) {
    if (!p || p.state === 'dead') return false;
    const c = cfg();
    if (geo.overlaps(DP.player.hitbox(p), hitbox(e))) return true;
    return Math.abs(p.x - e.x) < c.landSafe && p.y <= e.y + 2 && p.y > e.y - 60;
  }

  // 目標の床の高さ(投下したときに選んだ床)
  function targetFloorY(level, e) {
    const g = level.girders.find((q) => (q.floor || q.id) === e.targetFloor && q.kind !== 'lift');
    return g ? geo.surfaceY(g, e.x) : 0;
  }

  // 足場の上を左右に歩く(端・穴の端の手前で折り返す。主人公がつかまっているハシゴへは playerWall より近づかない)
  function walk(e, level, p, rng) {
    const c = cfg();
    const g = e.girder;
    e.think++;
    // 主人公がすぐ近く(横 jumpCommit 以内)で空中にいる間は向きを変えない(跳び越えようとしている最中に急に向きを変えて、
    // 着地点に入ってくる理不尽をなくす。ポリスマンが振り向く前に「!」を出すのと同じ考え方)
    const committed = p && p.state === 'air' && Math.abs(p.x - e.x) < c.jumpCommit;
    if (e.think >= c.thinkInterval && !committed) {
      e.think = 0;
      if (sameFloor(e, p)) e.dir = rng() < c.sameLevelChase ? (p.x >= e.x ? 1 : -1) : -(p.x >= e.x ? 1 : -1);
      else if (rng() < c.wanderChance) e.dir = -e.dir;
    }
    let nx = e.x + e.dir * e.speed;
    const pl = p && p.state === 'ladder' ? p.ladder : null;
    if (pl && (pl.lower === g || pl.upper === g)) {
      if (Math.abs(nx - pl.x) < c.playerWall && Math.abs(nx - pl.x) < Math.abs(e.x - pl.x)) {
        e.dir = nx > pl.x ? 1 : -1;
        nx = e.x;
      }
    }
    const minX = g.x1 + c.edgeMargin;
    const maxX = g.x2 - c.edgeMargin;
    if (nx < minX) { nx = minX; e.dir = 1; }
    if (nx > maxX) { nx = maxX; e.dir = -1; }
    e.x = nx;
    e.y = geo.surfaceY(g, e.x);
  }

  // ---- 銃弾 ----
  function createBullet(e) {
    const c = cfg();
    return {
      id: 'shot' + nextId++,
      x: e.x + e.dir * c.muzzle,
      y: e.y - c.bulletLift, // 下端(床から bulletLift px 上)
      dir: e.dir,
      speed: e.bulletSpeed,
      floorY: e.y,
      jumpedOver: false,
      dead: false,
    };
  }

  function updateBullet(b) {
    b.x += b.dir * b.speed;
    const m = cfg().bulletW;
    if (b.x < -m || b.x > DP.config.WIDTH + m) b.dead = true;
  }

  // 銃弾の当たり判定({x(中心), y(下端), w, h})
  function bulletHitbox(b) {
    const c = cfg();
    return { x: b.x, y: b.y, w: c.bulletW, h: c.bulletH };
  }

  return {
    rules, createHeli, updateHeli, heliOnScreen, playerFloor, landable, chooseTargets,
    createDrop, createOn, isHarmless, hitbox, canJumpOver, sameFloor, update, createBullet, updateBullet, bulletHitbox,
  };
})();
