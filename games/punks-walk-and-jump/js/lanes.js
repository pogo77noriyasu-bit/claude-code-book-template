// 道路の車と川の浮遊物(レーンごとに左右へ流れ続ける)
// レーンは config.js の river / road から作る。物の位置はピクセル(左端の x)で持ち、
// 画面の外へ出たら反対側へ回す(くり返しの長さ loop は画面の幅より長いので、端で急に消えたり出たりしない)。
PW.lanes = (function () {
  const cfg = () => PW.config;

  // ステージごとの表 t から、ステージ stage(1 から)の値を取り出す。表より先の面は最後の値のまま
  function byStage(t, stage) {
    return t[Math.min(Math.max(1, stage | 0), t.length) - 1];
  }
  // ステージの難易度: 車の速さ・車の台数・浮遊物の速さの倍率と、ドラム缶の周期(0 = 沈まない)
  function difficulty(stage) {
    const C = cfg();
    return {
      road: byStage(C.roadSpeed, stage),
      count: byStage(C.roadCount, stage),
      river: byStage(C.riverSpeed, stage),
      drumPeriod: byStage(C.drum.periodByStage, stage),
    };
  }

  // 1 本のレーンを作る。type: 'river' | 'road'。mul: 速さの倍率。count: 台数の倍率(1 より小さいと間が広がる)
  function makeLane(row, type, def, mul, count) {
    const T = cfg().TILE;
    const minLoop = (cfg().COLS + 6) * T; // 画面の幅 + 少し(いちばん長い物より長く)
    const objects = [];
    let x = 0;
    let n = 0;
    // 設定の並びを、くり返しの長さが画面の幅より長くなるまでくり返す(最初の 1 台は必ず置くので、空のレーンはできない)
    while (x < minLoop || n % def.items.length !== 0) {
      const [len, gap, kind] = def.items[n % def.items.length];
      objects.push({ x, len: len * T, kind: kind || def.kind, index: n });
      x += Math.round(((len + gap) * T) / count); // 台数を減らす分、次の物までを長くする
      n++;
    }
    return { row, type, kind: def.kind, dir: def.dir, speed: def.speed * mul, loop: x, objects };
  }

  // ステージのレーン一式。{ t: 経過ステップ, list: [レーン], byRow: { 行: レーン }, diff: 難易度 }
  function create(stage) {
    const C = cfg();
    const diff = difficulty(stage);
    const list = [];
    // 川は台数を変えない。車の速さ・台数の倍率は道路だけにかける(倍率を重ねない)
    for (const r of C.RIVER_ROWS) list.push(makeLane(r, 'river', C.river[r], diff.river, 1));
    for (const r of C.ROAD_ROWS) list.push(makeLane(r, 'road', C.road[r], diff.road, diff.count));
    const byRow = {};
    for (const l of list) byRow[l.row] = l;
    return { t: 0, stage, diff, list, byRow };
  }

  // 1 ステップ進める
  function update(L) {
    const W = cfg().WIDTH;
    L.t++;
    for (const lane of L.list) {
      const v = lane.dir * lane.speed;
      for (const o of lane.objects) {
        o.x += v;
        // 画面の外へ出きったら、くり返しの長さだけ戻す
        if (v > 0 && o.x >= W) o.x -= lane.loop;
        else if (v < 0 && o.x + o.len <= 0) o.x += lane.loop;
      }
    }
  }

  // レーンの流れる速さ(px/ステップ。右が +)。そのレーンがなければ 0
  function velocity(L, row) {
    const lane = L.byRow[row];
    return lane ? lane.dir * lane.speed : 0;
  }

  // ドラム缶の浮き台の状態: 'up'(浮いている)/ 'warn'(沈む前の点滅)/ 'down'(沈んでいる。乗れない)
  // 丸太・いかだと、沈まない面(周期 0)のドラム缶は常に 'up'
  function floatState(L, o) {
    if (o.kind !== 'drum') return 'up';
    const period = L.diff.drumPeriod;
    if (!period) return 'up';
    const d = cfg().drum;
    const t = (L.t + o.index * Math.round(period / 3)) % period; // 浮き台ごとに周期の 1/3 ずつずらす
    if (t < period - d.warn - d.down) return 'up';
    if (t < period - d.down) return 'warn';
    return 'down';
  }

  // 川の行 row で、中心が cx(px)の主人公が乗れる浮遊物。なければ null(水に落ちる)
  function floatAt(L, row, cx) {
    const lane = L.byRow[row];
    if (!lane || lane.type !== 'river') return null;
    const m = cfg().hero.standHalfWidth;
    for (const o of lane.objects) {
      if (cx >= o.x + m && cx <= o.x + o.len - m && floatState(L, o) !== 'down') return o;
    }
    return null;
  }

  // 道路の行 row で、中心 cx・半分の幅 hw の主人公とぶつかる車。なければ null
  function vehicleAt(L, row, cx, hw) {
    const lane = L.byRow[row];
    if (!lane || lane.type !== 'road') return null;
    for (const o of lane.objects) {
      if (cx + hw > o.x + 2 && cx - hw < o.x + o.len - 2) return o; // 車の絵の前後 2px は余白
    }
    return null;
  }

  return { create, update, velocity, floatState, floatAt, vehicleAt, difficulty };
})();
