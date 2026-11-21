// ゴリラ警官のバズーカ砲と蛇行ミサイル(2 面)
// ゴリラがバズーカを構え(raise)→ 主人公を狙い(aim)→ 発射した瞬間の主人公の位置へ向けてミサイルを撃つ(recoil)。
// ミサイルは発射後は追尾しない。発射した向き(基本の飛行方向)へまっすぐ進みながら、
// 進行方向と直角にサイン波で蛇行する。波は「進んだ距離」で決まるので、弾速が違っても同じ形になる。
// 波の位相は「狙った位置(発射時の主人公の体の中心)で、ちょうど基本の飛行方向の線上に戻る」ようにそろえるので、
// 発射の瞬間から動かなければ必ず当たる。発射直後は蛇行の幅を 0 から少しずつ広げる(砲口から離れて見えないように)。
// 鉄骨・ベルトコンベア・ハシゴは通り抜け、画面の外へ出たら消える。煙は見た目だけ(当たり判定なし)。
//
// ここは位置や当たり判定などの計算だけ。出現のタイミング・主人公との当たり判定・釘バットでの破壊は
// 仕掛け 'bazooka'(js/mechanics.js)が行う。状態はレベル(ミスすると組み立て直す)に持つ。
window.DP = window.DP || {};

DP.bazooka = (function () {
  const cfg = () => DP.config.missile;
  const DEG = Math.PI / 180;
  let nextId = 1;

  // 周回ごとの値(ステージデータの bazooka.rounds。1 行目が R1。R11 以降は最後の行 = R10 で上限)
  function rules(stage, round) {
    const rows = stage && stage.bazooka && stage.bazooka.rounds;
    if (!rows || rows.length === 0) return null;
    return rows[Math.min(rows.length - 1, Math.max(0, (round || 1) - 1))];
  }

  // バズーカの回転の中心(肩)。flip: 左を向いているとき(左右反転)
  function pivot(boss, flip) {
    const c = cfg();
    return { x: boss.x + (flip ? -c.pivot.dx : c.pivot.dx), y: boss.y + c.pivot.dy };
  }

  // 主人公の体の中心(狙う位置)
  function targetOf(p) {
    return { x: p.x, y: p.y - DP.config.player.height / 2 };
  }

  // 肩から狙う位置への角度(度。0 = 右水平、90 = 真下、180 = 左水平)。
  // minAngle〜maxAngle に収める(上は撃たない)。90 度を超えたら左向き(flip)。
  // 左向きのときは肩の位置が変わるので、反転した肩からもう一度測る
  function aim(boss, target) {
    const c = cfg();
    const calc = (flip) => {
      const pv = pivot(boss, flip);
      let a = Math.atan2(target.y - pv.y, target.x - pv.x) / DEG;
      if (a < -90) a += 360; // 左上(-180〜-90)は「左水平より上」なので、180 度の側へ寄せてから収める
      a = Math.max(c.minAngle, Math.min(c.maxAngle, a));
      return a;
    };
    let angle = calc(false);
    let flip = angle > 90;
    if (flip) {
      angle = calc(true);
      flip = angle > 90;
    }
    return { angle, flip };
  }

  // 砲口の位置(肩から基本の飛行方向へ tubeFront 進んだ所)
  function muzzle(boss, angle, flip) {
    const c = cfg();
    const pv = pivot(boss, flip);
    return { x: pv.x + Math.cos(angle * DEG) * c.tubeFront, y: pv.y + Math.sin(angle * DEG) * c.tubeFront };
  }

  // ミサイルを作る。from: 砲口 / angle: 基本の飛行方向(度)/ aimDist: 砲口から狙った位置までの距離 /
  // r: 周回ごとの値(speed, amp, wave)
  function create(from, angle, aimDist, r) {
    const ux = Math.cos(angle * DEG);
    const uy = Math.sin(angle * DEG);
    const m = {
      id: nextId++,
      type: 'missile',
      x0: from.x,
      y0: from.y,
      angle,
      ux,
      uy,
      nx: -uy, // 蛇行する向き(進行方向と直角)
      ny: ux,
      s: 0, // 基本の飛行方向に進んだ距離
      speed: r.speed,
      amp: r.amp,
      wave: r.wave,
      aimDist,
      x: from.x,
      y: from.y,
      heading: angle * DEG, // 描画の向き(蛇行の傾きを含む。ラジアン)
      age: 0,
      jumpedOver: false,
      dead: false,
    };
    return m;
  }

  // 進んだ距離 s での、基本の飛行方向の線からのずれ(蛇行)。
  // 発射直後の ampRamp px で幅を 0 → amp に広げ、狙った位置(s = aimDist)でちょうど 0 になる位相にする
  function offsetAt(m, s) {
    const env = Math.min(1, s / cfg().ampRamp);
    return m.amp * env * Math.sin((2 * Math.PI * (s - m.aimDist)) / m.wave);
  }

  function posAt(m, s) {
    const o = offsetAt(m, s);
    return { x: m.x0 + m.ux * s + m.nx * o, y: m.y0 + m.uy * s + m.ny * o };
  }

  // 画面の外か(外へ出たら消す)
  function offscreen(m) {
    const c = cfg();
    return m.x < -c.offscreen || m.x > DP.config.WIDTH + c.offscreen || m.y < -c.offscreen || m.y > DP.config.HEIGHT + c.offscreen;
  }

  // 1 ステップ進める。煙を出すときは煙の粒を返す(出さないときは null)
  function update(m) {
    const c = cfg();
    m.s += m.speed;
    m.age++;
    const p = posAt(m, m.s);
    const ahead = posAt(m, m.s + 1);
    m.x = p.x;
    m.y = p.y;
    m.heading = Math.atan2(ahead.y - p.y, ahead.x - p.x);
    if (offscreen(m)) m.dead = true;
    if (m.dead || m.age % c.smokeEvery !== 0) return null;
    // 尾(向きの反対側へ tail px)から煙を出す
    return { x: m.x - Math.cos(m.heading) * c.tail, y: m.y - Math.sin(m.heading) * c.tail, t: 0 };
  }

  // 煙を 1 ステップ進める(少し上へ漂って薄れる。見た目だけ)。消えたら false
  function updateSmoke(sm) {
    sm.t++;
    sm.y -= 0.3;
    return sm.t < cfg().smokeLife;
  }

  // ミサイル本体の当たり判定(回転しても変わらない正方形)。{x(中心), y(下端), w, h}
  function hitbox(m) {
    const n = cfg().hitSize;
    return { x: m.x, y: m.y + n / 2, w: n, h: n };
  }

  // 釘バットで壊したときの爆発の演出(見た目だけ。巻き添えの当たり判定はない)。
  // 破片の向きは決まった角度に少しずつずらして並べる(ゲームの乱数を使わない)
  function createBlast(x, y, heading) {
    const c = cfg();
    const debris = [];
    for (let i = 0; i < c.debrisCount; i++) {
      const a = (i / c.debrisCount) * Math.PI * 2 + 0.35;
      const sp = 1.6 + (i % 3) * 0.7;
      debris.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.8, spin: i * 0.7, kind: i % 3 });
    }
    const puffs = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.55;
      puffs.push({ x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 4, vx: Math.cos(a) * 0.45, vy: -0.5 - (i % 2) * 0.25 });
    }
    return { x, y, heading, t: 0, debris, puffs };
  }

  // 爆発の演出を 1 ステップ進める。終わったら false
  function updateBlast(b) {
    b.t++;
    for (const d of b.debris) {
      d.x += d.vx;
      d.y += d.vy;
      d.vy += 0.18; // 重力
      d.spin += 0.4;
    }
    for (const p of b.puffs) {
      p.x += p.vx;
      p.y += p.vy;
    }
    return b.t < cfg().blastFrames;
  }

  return { rules, pivot, targetOf, aim, muzzle, create, offsetAt, posAt, update, updateSmoke, hitbox, createBlast, updateBlast, offscreen };
})();
