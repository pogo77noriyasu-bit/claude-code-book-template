// タイトル画面のデモ(最終演出①)
// 黒い画面の四角いコースを、裸の主人公が全敵キャラクターの行列(警察官 2 人 → 機動隊員 2 人 → パトカー → ジープ → 軽戦車 → 重戦車)に
// 追いかけられながらぐるぐる逃げ回り、落ちている 5 種類の服を拾っていく(演出の改良①で、追手を警察官 1 人から全員の行列にした)。
// 拾うたびに見た目が変わり、5 つそろうと完全装備のパンクスに。追手は全員怯えて逃げ出し、主人公はまん中へ歩いて正面を向いて止まる。
// しばらくしたら最初からくり返す。ENTER でいつでもゲームを始められる(game.js)。
// 位置はすべて「デモが始まってからのステップ数 t」から計算する(状態を持たないので、テストでどの瞬間も再現できる)。
// 座標は迷路と同じ(迷路の左上が原点。描画で HUD の高さを足す)。キャラクター・服の大きさはゲーム本編と同じ。
NP.demo = (function () {
  const D = {
    track: { x0: 56, y0: 118, x1: 280, y1: 226 }, // 四角いコース(時計回り。左上から右へ)
    speed: 1.4, // 主人公の速さ(px / ステップ)
    // 追手の行列(先頭から順に)。gap: 主人公の何 px 後ろを走るか(大きい車両ほど間をあける)。
    // enemy: 本編の敵の番号(config.enemies。色もゲーム中と同じ)。警察官 2 人(赤・青)・機動隊員 2 人(緑・オレンジ)の
    // 4 人全員が走る(以前は赤の警察官と緑の機動隊員の 2 人だけで、青とオレンジがいなかった)
    chasers: [
      { kind: 'cop', enemy: 0, gap: 34 },
      { kind: 'cop', enemy: 1, gap: 54 },
      { kind: 'riot', enemy: 2, gap: 76 },
      { kind: 'riot', enemy: 3, gap: 98 },
      { kind: 'patrol', gap: 126 },
      { kind: 'jeep', gap: 156 },
      { kind: 'lightTank', gap: 188 },
      { kind: 'heavyTank', gap: 226 },
    ],
    // 服を落としておく場所(コースの左上からの道のり px)と、拾う順
    clothes: [
      { name: 'boots', s: 40 },
      { name: 'pants', s: 270 },
      { name: 'belt', s: 430 },
      { name: 'tshirt', s: 600 },
      { name: 'jacket', s: 760 }, // 2 周目の上の辺
    ],
    badgeStep: 16, // コースに並べる缶バッジの間隔(px。本編の 1 マスと同じ。演出の追加修正で点線の代わりに置いた)
    center: { x: 168, y: 172 }, // 最後に主人公が立つ場所
    walkSpeed: 1.2, // 最後にまん中へ歩く速さ
    copRun: 2.0, // 怯えて逃げる追手の速さ
    introStart: 780, // キャラクター紹介を始めるステップ(13 秒。完全装備で止まってから約 3 秒後。追加修正⑬)
    introStep: 45, // 紹介で 1 人ずつ出てくる間隔(主人公 → 敵 4 人)
    total: 1320, // 1 回のデモの長さ(22 秒)。過ぎたら最初から
  };
  const T = D.track;
  const W = T.x1 - T.x0;
  const H = T.y1 - T.y0;
  const LAP = 2 * (W + H);
  const RUN_END = Math.ceil(D.clothes[D.clothes.length - 1].s / D.speed) + 1; // 最後の服を拾ったステップの少しあと
  // コースに並べる缶バッジ(道のり s)。服を置いた場所の近くには置かない。1 周目で主人公がすべて拾う
  const BADGES = [];
  for (let s = D.badgeStep / 2; s < LAP; s += D.badgeStep) {
    if (D.clothes.some((c) => Math.abs(((c.s - s + LAP / 2) % LAP + LAP) % LAP - LAP / 2) < 12)) continue;
    BADGES.push(s);
  }
  // 缶バッジを拾うステップ(主人公の道のりがその場所に届いた最初のステップ)
  const pickStep = (s) => Math.ceil(s / D.speed);

  // コースの上の道のり s の位置と向き
  function at(s) {
    s = ((s % LAP) + LAP) % LAP;
    if (s < W) return { x: T.x0 + s, y: T.y0, face: 'right' };
    s -= W;
    if (s < H) return { x: T.x1, y: T.y0 + s, face: 'down' };
    s -= H;
    if (s < W) return { x: T.x1 - s, y: T.y1, face: 'left' };
    s -= W;
    return { x: T.x0, y: T.y1 - s, face: 'up' };
  }

  // デモの t ステップ目の様子
  function frame(t) {
    t = ((t % D.total) + D.total) % D.total;
    if (t >= D.introStart) {
      // キャラクター紹介(追加修正⑬): 主人公 → 敵 4 人の順に 1 人ずつ出てくる(shown = 出ている人数。主人公を含む)
      const it = t - D.introStart;
      const allWear = {};
      for (const c of D.clothes) allWear[c.name] = true;
      return {
        t,
        phase: 'intro',
        introT: it,
        shown: Math.min(1 + NP.config.enemies.length, Math.floor(it / D.introStep) + 1),
        hero: { x: 168, y: 110, face: 'down', moving: false, walk: 0 },
        chasers: [],
        clothes: [],
        badges: [],
        wear: allWear,
        sounds: [],
      };
    }
    const runT = Math.min(t, RUN_END);
    const s = runT * D.speed;
    const wear = {};
    const clothes = D.clothes.map((c) => {
      const taken = s >= c.s;
      if (taken) wear[c.name] = true;
      return Object.assign({}, at(c.s), { name: c.name, taken });
    });
    let hero;
    let chasers;
    let phase;
    if (t <= RUN_END) {
      // 逃げ回る: 主人公と追手の行列は、コースの上を同じ速さで走る(間が変わらない)
      phase = 'run';
      const p = at(s);
      hero = { x: p.x, y: p.y, face: p.face, moving: true, walk: t };
      chasers = D.chasers.map((c) => Object.assign(at(s - c.gap), { kind: c.kind, enemy: c.enemy, scared: false, walk: t }));
    } else {
      // 5 つそろった: 主人公はまん中へ歩き(横 → 縦)、正面を向いて止まる。追手は全員怯えて左へ逃げていく
      const a = at(RUN_END * D.speed);
      const k = (t - RUN_END) * D.walkSpeed;
      const dx = D.center.x - a.x;
      const dy = D.center.y - a.y;
      if (k < Math.abs(dx)) {
        phase = 'walk';
        hero = { x: a.x + Math.sign(dx) * k, y: a.y, face: dx < 0 ? 'left' : 'right', moving: true, walk: t };
      } else if (k < Math.abs(dx) + Math.abs(dy)) {
        phase = 'walk';
        hero = { x: D.center.x, y: a.y + Math.sign(dy) * (k - Math.abs(dx)), face: dy < 0 ? 'up' : 'down', moving: true, walk: t };
      } else {
        phase = 'pose';
        hero = { x: D.center.x, y: D.center.y, face: 'down', moving: false, walk: 0 };
      }
      chasers = D.chasers
        .map((c) => {
          const a = at(RUN_END * D.speed - c.gap);
          return { kind: c.kind, enemy: c.enemy, x: a.x - (t - RUN_END) * D.copRun, y: a.y, face: 'left', scared: true, walk: t };
        })
        .filter((c) => c.x > -30); // 画面の外へ出たら消える
    }
    // 缶バッジ: 主人公が通ったら消える。拾ったステップに本編と同じ効果音(得点には入れない)
    const badges = BADGES.map((bs, i) => Object.assign(at(bs), { i, taken: s >= bs }));
    const sounds = t <= RUN_END && BADGES.some((bs) => pickStep(bs) === t) ? ['badge'] : [];
    return { t, phase, hero, chasers, clothes, wear, badges, sounds };
  }

  return { frame, at, D, RUN_END, LAP, BADGES };
})();

// 3 面ごとのブレイク演出(最終演出②。インターミッション)
// 裸の主人公が左から逃げてきて、乱入キャラクターの車両が画面の右端ギリギリまで追いかける。
// ジープ・軽戦車・重戦車は追いかけながらくり返し攻撃する(本編と同じ予備動作 → 発射炎・弾・爆風・攻撃音)が、
// 弾は主人公のすぐ後ろで消え、爆風も主人公のすぐ後ろで止まる(ギリギリでよける。爆風のたびに主人公は跳び上がる)。
// 右端で主人公がビールを拾ってパワーアップ → 車両は慌てて止まって汗をかき、向きを変えて左へ逃げる →
// 今度は主人公が追いかけて、2 人とも左の画面の外へ消える(反転してからは改良前と同じ)。
// 3 面のあとはパトカー、6 面はジープ、9 面は軽戦車、12 面は重戦車、15 面からはまたパトカーから順に。
// demo と同じく、位置・弾・鳴らす音はすべて演出が始まってからのステップ数 t から計算する。座標は迷路と同じ。
NP.intermission = (function () {
  const C = {
    y: 172, // 地面の高さ(キャラクターの中心)
    heroSpeed: 1.2, // 逃げる主人公
    carDelay: 40, // 主人公が出てから車両が出るまで
    carSpeed: 1.2, // 追いかける車両(主人公と同じ速さで、撃っているあいだは間が変わらない)
    closeIn: 50, // ビールの手前のこのステップから、車両が追い上げて差を詰める(右端ギリギリまで迫る)
    closeSpeed: 0.5, // 追い上げるときに足す速さ
    beerX: 300, // ビールの位置(右端の近く)
    surprise: 30, // ビールを拾ってから車両が逃げ出すまで(慌てる間)
    chaseDelay: 12, // 車両が逃げ出してから主人公が追いかけ始めるまで
    fleeSpeed: 2.3, // 逃げる車両
    heroChase: 2.0, // 追いかける主人公
    tail: 30, // 2 人が消えてから次の面へ進むまで
    // 追いかけながらの攻撃(ジープ・軽戦車・重戦車)。first: 最初に撃つステップ、period: 撃つ間隔。
    // 予備動作の長さ・弾の速さ・連射・爆風の大きさは本編の車両の設定(config.intruder.types)をそのまま使う
    attack: { first: 90, period: { jeep: 60, lightTank: 80, heavyTank: 95 } },
    miss: 8, // 弾が消える(爆風の端が来る)のは主人公の中心の何 px 後ろか(ギリギリでよける)
    hop: 10, // 爆風のときに主人公が跳び上がる長さ(ステップ)
  };
  const ORDER = ['patrol', 'jeep', 'lightTank', 'heavyTank'];
  const START = -14; // 画面の左の外
  const PICK = Math.ceil((C.beerX - START) / C.heroSpeed); // ビールを拾うステップ
  const FLEE = PICK + C.surprise; // 車両が逃げ出すステップ
  const CHASE = FLEE + C.chaseDelay; // 主人公が追いかけ始めるステップ
  const heroX = (t) => START + Math.min(t, PICK) * C.heroSpeed; // 逃げている主人公の x
  // 追いかけている車両の x(ビールを拾った瞬間に止まる。最後の closeIn ステップは追い上げる)
  const carAt = (t) => {
    const tt = Math.min(t, PICK);
    return START - 22 + (tt - C.carDelay) * C.carSpeed + Math.max(0, tt - (PICK - C.closeIn)) * C.closeSpeed;
  };
  const CAR_STOP = carAt(PICK);
  const CAR_GONE = FLEE + Math.ceil((CAR_STOP + 40) / C.fleeSpeed);
  const HERO_GONE = CHASE + Math.ceil((C.beerX + 16) / C.heroChase);
  const TOTAL = Math.max(CAR_GONE, HERO_GONE) + C.tail;

  // stage 面をクリアしたあとにブレイク演出があるか。あればその車両の種類
  function typeAfter(stage) {
    if (stage < 3 || stage % 3 !== 0) return null;
    return ORDER[(stage / 3 - 1) % ORDER.length];
  }

  // 車両 type の攻撃の予定(撃つ前に済む: 弾が消える・爆風が終わるのがビールを拾う前のものだけ)。
  // 1 発ごとに { fire: 撃つステップ, x0: 撃つ位置, speed, end: 消える(爆発する)ステップ, endX, kind, blast }
  const plans = {};
  function plan(type) {
    if (plans[type]) return plans[type];
    const def = NP.config.intruder.types[type];
    const out = [];
    if (def.attack !== 'none') {
      const tip = 12; // 車体の中心から銃口・砲口まで(だいたい)
      for (let tf = C.attack.first; tf < PICK; tf += C.attack.period[type]) {
        const n = def.attack === 'gun' ? def.burst : 1;
        const shots = [];
        for (let k = 0; k < n; k++) {
          const fire = tf + k * (def.burstGap || 0);
          const x0 = carAt(fire) + tip;
          // 主人公の後ろ miss px(砲弾は爆風の半径も足す)に追いつく時刻: x0 + v(te - fire) = heroX(te) - gap
          const gap = C.miss + (def.attack === 'cannon' ? def.blast : 0);
          const end = (START - gap - x0 + def.shotSpeed * fire) / (def.shotSpeed - C.heroSpeed);
          if (end <= fire + 2) continue; // 間が詰まりすぎて撃てない
          shots.push({ fire, x0, speed: def.shotSpeed, end, endX: x0 + def.shotSpeed * (end - fire), kind: def.attack === 'gun' ? 'bullet' : 'shell', blast: def.blast || 0, blastSteps: def.blastSteps || 0, blastHit: def.blastHit || 0 });
        }
        const last = shots[shots.length - 1];
        if (!last) break;
        if (last.end + last.blastSteps >= PICK - 4) break; // ビールを拾うまでに片付かない攻撃はしない
        out.push({ windupFrom: tf - def.windup, fire: tf, shots });
      }
    }
    plans[type] = out;
    return out;
  }

  // 演出の t ステップ目の様子。sounds: このステップで鳴らす音の名前
  function frame(t, type) {
    const def = NP.config.intruder.types[type];
    let hero;
    let car = null;
    let phase;
    const beer = t < PICK;
    const shots = [];
    const blasts = [];
    const sounds = [];
    const SND = NP.intruders.SOUND[type];
    let hop = 0;
    if (t < PICK) {
      phase = 'chased'; // 右端まで追いかけられる(攻撃をギリギリでよける)
      hero = { x: heroX(t), face: 'right', moving: true, power: false, sweat: t >= C.carDelay };
      if (t >= C.carDelay) car = { x: carAt(t), face: 'right', scared: false };
      for (const a of plan(type)) {
        // 予備動作: 本編と同じく武器が点滅し、攻撃準備音をくり返す
        if (t >= a.windupFrom && t < a.fire && car) {
          car.aim = { dir: 'right', timer: a.fire - t };
          if ((t - a.windupFrom) % NP.config.intruder.sound.chargeEvery === 0) sounds.push(SND.charge);
        }
        for (const sh of a.shots) {
          if (t === sh.fire) sounds.push(SND.fire);
          if (car && t >= sh.fire && t < sh.fire + (sh.kind === 'bullet' ? 4 : 12)) car.flash = sh.fire + (sh.kind === 'bullet' ? 4 : 12) - t; // 発射炎
          if (t >= sh.fire && t < sh.end) shots.push({ kind: sh.kind, x: sh.x0 + sh.speed * (t - sh.fire), y: C.y });
          if (sh.kind === 'shell') {
            const te = Math.ceil(sh.end);
            if (t === te) sounds.push(SND.impact);
            if (t >= te && t < te + sh.blastSteps) blasts.push({ x: sh.endX, y: C.y, r: sh.blast, t: te + sh.blastSteps - t, life: sh.blastSteps, hit: sh.blastHit }); // hit は色の切り替えにだけ使う(演出なので当たり判定はない)
            if (t >= te && t < te + C.hop) hop = Math.max(hop, Math.round(Math.sin(((t - te) / C.hop) * Math.PI) * 6)); // 爆風で跳び上がる
          }
        }
      }
    } else if (t < FLEE) {
      phase = 'surprise'; // ビールでパワーアップ。車両は止まって慌てる
      hero = { x: heroX(PICK), face: 'right', moving: false, power: true };
      car = { x: CAR_STOP, face: 'right', scared: true, stopped: true };
    } else {
      phase = 'reverse'; // 立場が逆転: 車両が逃げ、主人公が追いかける(改良前と同じ)
      const hx = t < CHASE ? C.beerX : C.beerX - (t - CHASE) * C.heroChase;
      hero = { x: hx, face: 'left', moving: t >= CHASE, power: true };
      const cx = CAR_STOP - (t - FLEE) * C.fleeSpeed;
      if (cx > -40) car = { x: cx, face: 'left', scared: true };
    }
    // 演出の音(登場・パワーアップ・逃げ出す)
    if (t === C.carDelay) sounds.push(SND.enter);
    if (t === PICK) sounds.push('power');
    if (t === FLEE) sounds.push(type === 'patrol' ? 'siren' : SND.charge);
    hero.y = C.y - hop;
    hero.hop = hop;
    hero.walk = t;
    if (hero.x < -16) hero = null; // 画面の外へ消えた
    if (car) Object.assign(car, { y: C.y, type, walk: t });
    return { t, phase, hero, car, beer, beerX: C.beerX, shots, blasts, sounds, done: t >= TOTAL, def };
  }

  return { typeAfter, frame, plan, C, ORDER, PICK, FLEE, CHASE, TOTAL, CAR_GONE, HERO_GONE, heroX };
})();
