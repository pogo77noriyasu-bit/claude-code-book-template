// 障害物(ビール瓶・ビール缶)
// 状態: 'roll'(鉄骨を転がる) / 'fall'(端から落下中) / 'ladder'(ハシゴを降りる)
// 種類: 'bottle' / 'can'(単体)と、1 面の R2 以降に出る 2 個セット 'bottle2' / 'can2'、1 面の R5 以降に出るゴミ箱 'trash'
//   (ゴリラが斜め下へ投げる。zigzag で「ジグザグ落下」: 状態 'zigzag' で一定の速さでまっすぐ斜め下へ進み、鉄骨に当たるたびに
//   左右だけ反転してその鉄骨を通り抜け、最下段の下へ抜けたら消える。鉄骨に当たるたびに h.thud を立てて「ガタン」を鳴らさせる。
//   転がり・着地はしない。瓶・缶の処理は使わない)。
//   2 個セットはくっついている間は 1 つの障害物(横に転がる間は横並び、ハシゴを 2 個とも降りる間は縦に重なる)。
//   ハシゴで 1 個だけ降りるときは、単体 2 つ(piece: true、pairGroup: 元のセットの id)に分かれる(update が h.splitInto に入れて返す)
window.DP = window.DP || {};

DP.hazards = (function () {
  const geo = DP.geometry;
  const phys = DP.physics;
  let nextId = 1;

  const PAIR_BASE = { bottle2: 'bottle', can2: 'can' };
  // 2 個セットなら中身の種類('bottle' / 'can')、単体ならそのまま
  function baseType(type) {
    return PAIR_BASE[type] || type;
  }
  function isPair(h) {
    return !!PAIR_BASE[h.type];
  }
  // 2 個セットの大きさ: len = 横並びの全長 / step = 横並びの 2 個の中心の間隔 / stackH = 縦に重なったときの高さ / stackStep = 縦の中心の間隔
  function pairDims(base) {
    const c = DP.config.hazard[base];
    const p = DP.config.hazard.pair[base];
    return { len: 2 * c.width - p.overlap, step: c.width - p.overlap, stackH: 2 * c.height - p.stackOverlap, stackStep: c.height - p.stackOverlap };
  }
  // 種類の性質(2 個セットは横並びの全長を幅にする。高さ・速さは中身と同じ)
  function typeCfg(type) {
    const base = baseType(type);
    const c = DP.config.hazard[base];
    if (base === type) return c;
    return { width: pairDims(base).len, height: c.height, speed: c.speed };
  }
  // 横に転がるときの長さ(連投の間隔の計算に使う)
  function lengthOf(type) {
    return typeCfg(type).width;
  }
  // 周回ごとの難しさ(ステージデータの roundRules。R11 以降は最後の行)。roundRules のない面は null
  function roundRules(stage, round) {
    const rows = stage && stage.roundRules;
    if (!rows || !rows.length) return null;
    return rows[Math.min(Math.max(1, round || 1), rows.length) - 1];
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
      pairGroup: null, // 2 個セットの片割れなら、元のセットの id
      piece: false, // 2 個セットがハシゴで分かれた片割れか(得点は 1 個 150 点)
      dead: false,
    };
  }

  // 当たり判定(足元基準)。2 個セットは横並びなら全長 × 高さ、ハシゴで縦に重なっている間は 1 個の幅 × 2 個ぶんの高さ
  function hitbox(h) {
    if (isPair(h) && h.state === 'ladder') {
      const base = baseType(h.type);
      return { x: h.x, y: h.y, w: DP.config.hazard[base].width, h: pairDims(base).stackH };
    }
    const c = typeCfg(h.type);
    return { x: h.x, y: h.y, w: c.width, h: c.height };
  }

  // 斜め投げ: 障害物 h を (x, y) から、横の速さ vx・縦の速さ vy(+ は下向き)で放物線を描いて飛ばす。
  // 落ちている状態('fall')にするだけなので、そのあとの落下・着地・1 回跳ねる・画面の端で跳ね返る・最下段の左端から出ていくは、
  // 鉄骨の端から落ちたときと同じ処理を使う(どの面の物でも使える共通の処理。投げる物と速さは面のデータで決める)
  function launch(h, x, y, vx, vy) {
    h.x = x;
    h.y = y;
    h.vx = vx;
    h.vy = vy;
    h.dir = vx < 0 ? -1 : 1;
    h.state = 'fall';
    h.girder = null;
    h.ignore = null;
    h.bounced = false;
    h.lobbed = true;
    return h;
  }

  // ジグザグ落下(壊れた樽のような動き): 障害物 h を (x, y) から、水平から angle 度下向き・速さ speed で飛ばす(dir は最初の左右の向き)。
  // 重力なしにまっすぐ進み、鉄骨に当たると左右だけ反転して(角度はそのまま)通り抜ける(update の 'zigzag')。どの面の物でも使える。
  // firstAngle を渡すと、最初の 1 区間(最初の鉄骨に当たるまで)だけその角度で飛び、最初の鉄骨で angle に切り替える
  function zigzag(h, x, y, angle, speed, dir, firstAngle) {
    const start = firstAngle === undefined || firstAngle === null ? angle : firstAngle;
    const rad = (start * Math.PI) / 180;
    h.x = x;
    h.y = y;
    h.vx = (dir < 0 ? -1 : 1) * speed * Math.cos(rad);
    h.vy = speed * Math.sin(rad);
    h.dir = dir < 0 ? -1 : 1;
    h.state = 'zigzag';
    h.girder = null;
    h.angle = angle; // 最初の鉄骨からの角度
    h.firstAngle = start; // 最初の 1 区間の角度
    h.zigSpeed = speed;
    h.passed = new Set(); // 当たって通り抜けた鉄骨(同じ鉄骨で 2 回反転しない)
    h.hits = []; // 当たった鉄骨の順番(テスト・確認用)
    return h;
  }
  // 最初の 1 区間の角度を選ぶ(firstAngleMin〜firstAngleMax 度から一様に。書いていない面は null = 最初から通常の角度)
  function pickFirstAngle(lob, rng) {
    if (lob.firstAngleMin === undefined) return null;
    return lob.firstAngleMin + (lob.firstAngleMax - lob.firstAngleMin) * rng();
  }
  // ジグザグ落下の角度を選ぶ: coreChance の割合で中心の範囲 coreMin〜coreMax 度、残りは angleMin〜angleMax のうち中心の範囲の外
  // (angleMin〜coreMin と coreMax〜angleMax を合わせた範囲)から一様に選ぶ
  function pickAngle(lob, rng) {
    if (rng() < lob.coreChance) return lob.coreMin + (lob.coreMax - lob.coreMin) * rng();
    const low = lob.coreMin - lob.angleMin;
    const high = lob.angleMax - lob.coreMax;
    const u = rng() * (low + high);
    return u < low ? lob.angleMin + u : lob.coreMax + (u - low);
  }

  // パターン B: 2 個セットの前の 1 個がハシゴ l を降り、後ろの 1 個はそのまま鉄骨を転がる。単体 2 つ(片割れ)に置き換える。
  // 後ろの 1 個には判定済みのハシゴ(l を含む)を引き継ぐので、同じハシゴでもう一度降りるかを決め直さない
  function split(level, h, l) {
    const base = baseType(h.type);
    const d = pairDims(base);
    const g = h.girder;
    const piece = (x) => {
      const q = create(level, base, x, g.id, h.speedMul);
      q.dir = h.dir;
      q.spin = h.spin;
      q.checkedLadders = new Set(h.checkedLadders);
      q.pairGroup = h.id;
      q.piece = true;
      return q;
    };
    const front = piece(l.x);
    front.state = 'ladder';
    front.ladder = l;
    front.girder = null;
    front.y = h.y;
    const rearX = h.x - h.dir * (d.step / 2);
    const rear = piece(geo.containsX(g, rearX) ? rearX : h.x);
    h.dead = true;
    h.splitInto = [front, rear];
  }

  // 主人公がハシゴ l の下で待っているか: 下の段の上(立っている、またはその場で跳んでいる)で、
  // ハシゴの中心から左右 ladderSafeX 以内。ここにいる主人公の上へは瓶・缶が降りてこない
  function playerUnderLadder(player, l) {
    if (!player || Math.abs(player.x - l.x) > DP.config.hazard.ladderSafeX) return false;
    if (player.state === 'ground') return player.girder === l.lower;
    if (player.state === 'air') {
      // 下の段から跳んでいる間(足元が下の段の上面から 48px 以内の上)も待っているとみなす
      const floorY = geo.surfaceY(l.lower, player.x);
      return player.y <= floorY && player.y >= floorY - 48;
    }
    return false;
  }

  // 転がっている途中で通過したハシゴの上で、ときどき下へ降りる(ladderChance)。
  // ただし主人公がそのハシゴにつかまっているとき(ハシゴの上では左右によけられないため。上端付近で待てば頭上をやり過ごせる)と、
  // そのハシゴの下で待っているとき(playerUnderLadder)は降りずに鉄骨の上を通過する。ほかのハシゴでは今までどおり降りる
  function tryLadder(level, h, prevX, rng, player) {
    for (const l of level.ladders) {
      if (l.noHazard || l.upper !== h.girder || h.checkedLadders.has(l.index)) continue;
      const crossed = (prevX - l.x) * (h.x - l.x) <= 0;
      if (!crossed) continue;
      h.checkedLadders.add(l.index);
      // 乱数はプレイヤーの位置に関係なく 1 回消費する(他の障害物の動きの並びを変えないため)
      const roll = rng();
      const playerOnLadder = !!player && player.state === 'ladder' && player.ladder === l;
      if (!playerOnLadder && !playerUnderLadder(player, l) && roll < DP.config.hazard.ladderChance) {
        // 2 個セット: 50% で 1 個だけ降りて分かれる(パターン B)。残りは 2 個とも縦に重なって降りる(A)。
        // この乱数は 2 個セットのときだけ引く(単体しか出ない R1 の乱数の並びは変わらない)
        if (isPair(h) && rng() < DP.config.hazard.pair.splitChance) {
          split(level, h, l);
          return true;
        }
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
      const before = h.spin;
      h.spin += speed;
      // ゴミ箱: 1 辺(幅)ぶん転がるごとに角で倒れて「ガタン」
      if (h.type === 'trash' && Math.floor(h.spin / c.width) !== Math.floor(before / c.width)) h.thud = true;
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
        // 画面の左右の端を越えそうになったら、その下に鉄骨があるときだけ跳ね返す。
        // 周回が上がって速くなった瓶(4 周目から)は、端の鉄骨から落ちる間に下の段の端(x=0 / 480)を越えて
        // 画面の外へ消えていたため。下に何もない最下段の左端からは、今までどおり画面の外へ出ていく。
        // 缶はどの周回でも端を越えないので、動きは変わらない
        wallBounce: (x, y) => level.girders.some((g) => g !== h.ignore && g.kind !== 'lift' && geo.containsX(g, x) && geo.surfaceY(g, x) > y),
        // 2 個セットは中心ではなく先頭の端が画面の端に届いたところで跳ね返す(画面からはみ出さない)。単体は 0(中心。前回の修正のまま)
        wallMargin: isPair(h) ? c.width / 2 : 0,
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
    } else if (h.state === 'zigzag') {
      // ジグザグ落下: まっすぐ斜め下へ進む(重力なし)
      const prevX = h.x;
      const prevY = h.y;
      h.x += h.vx;
      h.y += h.vy;
      h.spin += Math.hypot(h.vx, h.vy); // 回転のアニメーションは進んだ距離に合わせる
      // 画面の左右の端: 左右を反転して、斜め下への落下を続ける(端の内側へ折り返すので、同じ端で続けて反転しない)
      const half = c.width / 2;
      if (h.x < half && h.vx < 0) { h.x = 2 * half - h.x; h.vx = -h.vx; h.dir = 1; }
      else if (h.x > W - half && h.vx > 0) { h.x = 2 * (W - half) - h.x; h.vx = -h.vx; h.dir = -1; }
      // 鉄骨: 上面を上から下へ横切った瞬間に左右を反転し、その鉄骨は通り抜ける(通り抜けた鉄骨ではもう反転しない)
      for (const g of level.girders) {
        if (g.kind === 'lift' || h.passed.has(g.id) || !geo.containsX(g, h.x)) continue;
        if (prevY <= geo.surfaceY(g, prevX) && h.y > geo.surfaceY(g, h.x)) {
          h.passed.add(g.id);
          h.hits.push(g.id);
          if (h.hits.length === 1 && h.firstAngle !== h.angle) {
            // 最初の鉄骨: 左右を反転して、通常の角度に切り替える(速さは同じ)
            const rad = (h.angle * Math.PI) / 180;
            h.vx = (h.vx > 0 ? -1 : 1) * h.zigSpeed * Math.cos(rad);
            h.vy = h.zigSpeed * Math.sin(rad);
          } else {
            h.vx = -h.vx;
          }
          h.dir = h.vx < 0 ? -1 : 1;
          h.thud = true; // 「ガタン」
          break;
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

  // 瓶・缶との当たり判定に使う主人公の箱(config.hazard.playerHit。player.hitbox より少し小さい)
  function playerHitbox(p) {
    const c = DP.config.hazard.playerHit;
    return { x: p.x, y: p.y, w: c.width, h: c.height };
  }

  return { create, update, hitbox, playerHitbox, playerUnderLadder, baseType, isPair, pairDims, lengthOf, roundRules, launch, zigzag, pickAngle, pickFirstAngle };
})();
