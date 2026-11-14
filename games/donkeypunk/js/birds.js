// 空飛ぶパンクニワトリ(3 面の敵)
// ステージデータの birds.lines に書いた 4 本の飛行ラインを、決まった向きに水平に飛ぶ。
// ラインの y は「その高さの床の上面」。鳥はその床すれすれを飛ぶので、床を普通に歩いている主人公には当たり、
// ジャンプすれば上を跳び越えられる。画面の外へ出たら消える。羽ばたきは見た目だけで、当たり判定は変わらない。
// 出現・移動・当たり判定は仕掛け 'birds'(js/mechanics.js)が毎ステップ呼ぶ。状態はレベル(ミスすると組み立て直す)に持つ。
// R5 以降は火炎攻撃: 鳥ごとに「休む(rest)→ 予備動作(windup。くちばしを開く)→ 噴く(burn)→ 休む」をくり返す。
// 火炎はくちばしから進行方向へ伸びて鳥と一緒に動く(独立した弾ではない)。鳥が画面に入るまでは数えない(fire = 'wait')。
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
      hop: null, // リフトの縦穴を越える跳ね上がり({ a, b, dy }: 縦穴の危ない範囲の左端・右端と、ずれる量(上が負))。跳ねていなければ null
      hopDy: 0, // 今のずれ(上が負。当たり判定と絵をこれだけずらす。b.y はラインの床のまま)
      fire: 'wait', // 火炎の段階: 'wait'(画面に入る前・火炎なしの周回)| 'rest' | 'windup' | 'burn'
      fireT: 0, // 今の段階の経過ステップ
      fireRest: 0, // 今の休みの長さ
      dead: false,
    };
  }

  // 跳ね上がり(くぐり)のずれ(上が負)。縦穴の危ない範囲 [a, b] の手前 hopRamp px で滑らかにずれ、範囲の上では hop.dy を保ち、
  // 越えたら hopRamp px で戻る。高さは鳥の位置だけで決まる(速さが変わっても同じ形)
  function hopOffset(b) {
    if (!b.hop) return 0;
    const c = cfg();
    // 進む向きに沿った位置: 0 = 上がり始め、hopRamp = 範囲の入口、hopRamp + 幅 = 範囲の出口
    const w = b.hop.b - b.hop.a;
    const u = b.dir > 0 ? b.x - (b.hop.a - c.hopRamp) : (b.hop.b + c.hopRamp) - b.x;
    let k;
    if (u <= 0) k = 0;
    else if (u < c.hopRamp) k = Math.sin((Math.PI / 2) * (u / c.hopRamp));
    else if (u <= c.hopRamp + w) k = 1;
    else if (u < c.hopRamp * 2 + w) k = Math.sin((Math.PI / 2) * (1 - (u - c.hopRamp - w) / c.hopRamp));
    else k = 0;
    return b.hop.dy * k;
  }

  // 1 ステップ進める。画面の外へ出たら dead
  function update(b) {
    const c = cfg();
    b.x += b.dir * c.speed;
    b.anim++;
    if (b.hop) {
      b.hopDy = hopOffset(b);
      // 越えて元の高さに戻ったら跳ね上がりを終える
      const past = b.dir > 0 ? b.x >= b.hop.b + c.hopRamp : b.x <= b.hop.a - c.hopRamp;
      if (past) { b.hop = null; b.hopDy = 0; }
    }
    if (b.x < -c.offscreen - 1 || b.x > DP.config.WIDTH + c.offscreen + 1) b.dead = true;
  }

  // 周回ごとの値(ステージデータの birds.rounds。R11 以降は最後の行 = R10)。表のない面は null
  function rules(def, round) {
    const rows = def && def.rounds;
    if (!rows || rows.length === 0) return null;
    return rows[Math.min(rows.length - 1, Math.max(0, (round || 1) - 1))];
  }

  // 火炎がリフト(エレベーター)の縦穴にかかるか。リフトの上の主人公は左右に逃げられないので、縦穴には火を噴かない。
  // 縦穴 = リフトの幅の左右に fireLiftMargin を足した範囲(主人公がリフトの端に立ったときの当たり判定まで含む)。
  // そのリフトが上下する高さ(循環: top〜bottom、往復: いちばん上〜いちばん下の階)を通るラインだけが対象。
  // ahead: 鳥がこれから進む距離(予備動作のあとに噴き始める位置を先に調べるため)
  function fireOverLift(b, fr, stage, ahead) {
    const c = cfg();
    const lifts = (stage && stage.lifts) || [];
    const x = b.x + b.dir * (ahead || 0);
    const near = x + b.dir * c.fireFrom;
    const far = near + b.dir * fr.length;
    const lo = Math.min(near, far);
    const hi = Math.max(near, far);
    for (const L of lifts) {
      const top = L.stops ? Math.min(...L.stops) : L.top;
      const bottom = L.stops ? Math.max(...L.stops) : L.bottom;
      if (b.y < top || b.y > bottom) continue; // このラインの高さをリフトが通らない
      if (hi > L.x1 - c.fireLiftMargin && lo < L.x2 + c.fireLiftMargin) return true;
    }
    return false;
  }

  // 火炎のサイクルを 1 ステップ進める。fr: 周回の fire(null なら何もしない)。stage: リフトの縦穴を調べるためのステージデータ。
  // 噴き始めたステップは true を返す(噴射音用)
  function updateFire(b, fr, stage) {
    if (!fr) return false;
    const c = cfg();
    if (b.fire === 'wait') {
      // 飛んでくる側の画面の端から fireEnterMargin 入ったら、休みから始める(鳥ごとに少しずらす)
      const inside = b.dir > 0 ? b.x >= c.fireEnterMargin : b.x <= DP.config.WIDTH - c.fireEnterMargin;
      if (!inside) return false;
      b.fire = 'rest';
      b.fireT = 0;
      b.fireRest = c.fireFirstRest + c.fireStagger * (b.id % 4);
      return false;
    }
    b.fireT++;
    if (b.fire === 'rest' && b.fireT >= b.fireRest) {
      // 予備動作のあと噴き始める位置で火炎がリフトの縦穴にかかるなら、まだ予備動作に入らない(通り過ぎるまで休みを延ばす)
      if (fireOverLift(b, fr, stage, DP.config.bird.speed * fr.windup)) return false;
      b.fire = 'windup';
      b.fireT = 0;
    } else if (b.fire === 'windup' && b.fireT >= fr.windup) {
      if (fireOverLift(b, fr, stage, 0)) {
        // 念のため(予備動作の前に調べているので、ふつうは起きない): 噴かずに休みへ戻る
        b.fire = 'rest';
        b.fireT = 0;
        b.fireRest = fr.cycle - fr.windup;
        return false;
      }
      b.fire = 'burn';
      b.fireT = 0;
      return true;
    } else if (b.fire === 'burn' && fireOverLift(b, fr, stage, 0)) {
      // 噴いている途中で火炎の先がリフトの縦穴に入った: その場で噴くのをやめる(次の噴き始めは予定どおり cycle 後)
      b.fire = 'rest';
      b.fireRest = Math.max(0, fr.cycle - b.fireT - fr.windup);
      b.fireT = 0;
    } else if (b.fire === 'burn' && b.fireT >= fr.burn) {
      // 次の噴き始めまで cycle(噴く・休む・予備動作の合計)
      b.fire = 'rest';
      b.fireT = 0;
      b.fireRest = fr.cycle - fr.burn - fr.windup;
    }
    return false;
  }

  // 火炎の当たり判定(噴いている間だけ。それ以外は null)。くちばしから進行方向へ length px、床から 8〜16px の高さ
  function fireHitbox(b, fr) {
    if (!fr || b.fire !== 'burn') return null;
    const c = cfg();
    return { x: b.x + b.dir * (c.fireFrom + fr.length / 2), y: b.y + (b.hopDy || 0) - c.fireLift, w: fr.length, h: c.fireHeight };
  }

  // くちばしを開いているか(予備動作と噴いている間。見た目だけ)
  function mouthOpen(b) {
    return b.fire === 'windup' || b.fire === 'burn';
  }

  // 羽の向き(見た目だけ)。'up' と 'down' を flapFrames ステップごとに入れ替える。跳ね上がっている間は 2 倍の速さで羽ばたく
  function wing(b) {
    const f = b.hop ? Math.max(1, Math.floor(cfg().flapFrames / 2)) : cfg().flapFrames;
    return Math.floor(b.anim / f) % 2 === 0 ? 'up' : 'down';
  }

  // 当たり判定(胴体だけ。羽・トサカ・足は含めない)。{x(中心), y(下端), w, h}。跳ね上がっている間はその高さへずらす
  function hitbox(b) {
    const c = cfg();
    return { x: b.x, y: b.y + (b.hopDy || 0) - c.hitLift, w: c.hitWidth, h: c.hitHeight };
  }

  // リフトの縦穴を越える跳ね上がりを始めるか決める(仕掛け 'birds' が毎ステップ呼ぶ)。
  // 鳥が縦穴の危ない範囲の手前 hopRamp px(上がり始める位置)を通ったステップで 1 回だけ調べ、
  // 「動いているリフトに乗っている(またはその上で跳んでいる)主人公の体が、鳥が範囲の上を通る間に鳥の高さにかかりそう」なら跳ねる。
  // 床の上・止まっているリフトの上・リフトを待っている主人公のときは跳ねない(今までどおり跳んでよける)
  function decideHop(b, level, p) {
    if (b.hop || !level.lifts) return;
    const c = cfg();
    for (const L of level.lifts) {
      const top = L.stops ? Math.min(...L.stops) : L.def.top;
      const bottom = L.stops ? Math.max(...L.stops) : L.def.bottom;
      if (b.y < top || b.y > bottom) continue; // このラインの高さをリフトが通らない
      const a = L.x1 - c.hopMargin;
      const z = L.x2 + c.hopMargin;
      // 上がり始める位置を、このステップで通ったか(進む向きに沿って)
      const start = b.dir > 0 ? a - c.hopRamp : z + c.hopRamp;
      const prev = b.x - b.dir * c.speed;
      const crossed = b.dir > 0 ? prev < start && b.x >= start : prev > start && b.x <= start;
      if (!crossed) continue;
      const body = riskOnLift(L, b, p, (z - a) / c.speed);
      if (!body) return;
      // 体(上端 body.top 〜 下端 body.bottom)をよけるずれ: 上を越える(鳥の当たり判定の下端を体の上端より上へ)か、
      // 下をくぐる(鳥の当たり判定の上端を体の下端より下へ)。小さい方を選ぶ
      const boxTop = b.y - c.hitLift - c.hitHeight;
      const boxBottom = b.y - c.hitLift;
      const up = body.top - c.hopClear - boxBottom; // 負なら上へずれる必要がある
      const down = body.bottom + c.hopClear - boxTop; // 正なら下へずれる必要がある
      if (up >= 0 || down <= 0) return; // もうよけられている
      const dy = -up <= down ? Math.max(-c.hopMax, up) : Math.min(c.hopMax, down);
      b.hop = { a, b: z, dy };
      b.hopDy = hopOffset(b);
      return;
    }
  }

  // 主人公がリフト L に乗っていて(L の上で跳んでいるときも)、動いているリフトで運ばれながら、
  // 鳥が危ない範囲の上を通る間(今から hopRamp / 速さ 〜 さらに cross ステップ)に体が鳥の高さにかかりそうなら、
  // その間に体が動く範囲 { top, bottom } を返す(かからないなら null)
  function riskOnLift(L, b, p, cross) {
    const c = cfg();
    if (!p || p.state === 'dead') return false;
    const onPlate = p.state === 'ground' && p.girder && p.girder.kind === 'lift' && p.girder.lift === L.id;
    const above = p.state === 'air' && p.x >= L.x1 && p.x <= L.x2 && L.plates.some((q) => q.y1 >= p.y && q.y1 - p.y < 60);
    if (!onPlate && !above) return false;
    // リフトの動き: 循環リフトは上へ一定の速さ。往復リフトは止まっている間は「止まった床」とみなして跳ねない
    let v;
    let stopY = null;
    if (L.type === 'loop') v = -L.speed;
    else {
      if (L.state.pause > 0) return false;
      v = L.state.dir * L.speed;
      stopY = v < 0 ? Math.min(...L.stops) : Math.max(...L.stops);
    }
    const feetAt = (t) => {
      let y = p.y + v * t;
      if (stopY !== null) y = v < 0 ? Math.max(stopY, y) : Math.min(stopY, y);
      return y;
    };
    const t1 = c.hopRamp / c.speed;
    const t2 = t1 + cross;
    const lo = Math.min(feetAt(t1), feetAt(t2));
    const hi = Math.max(feetAt(t1), feetAt(t2));
    // 体(足元から 26px)と鳥の当たり判定(床から hitLift〜hitLift + hitHeight)が重なる足元の範囲
    const bandLo = b.y - c.hitLift - c.hitHeight - c.hopClear;
    const bandHi = b.y - c.hitLift + DP.config.player.height + c.hopClear;
    if (!(hi > bandLo && lo < bandHi)) return null;
    return { top: lo - DP.config.player.height, bottom: hi };
  }

  return { create, update, wing, hitbox, rules, updateFire, fireHitbox, fireOverLift, mouthOpen, decideHop, hopOffset };
})();
