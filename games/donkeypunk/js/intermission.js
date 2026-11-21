// 面間演出: 1〜3 面をクリアしたあと、次の面へ進む前に流す「やぐらを積み上げる」演出(自動で進む)。
// ゴリラ警官が現場監督としてやぐらの上から指示を出し、雑魚警察官(怒ったポリスマン。4 面の敵と同じドット絵)が
// 鉄骨を運んでクレーンで積み上げる。やぐらは 1 → 2 段(1 面のあと)、2 → 3 段(2 面のあと)、3 → 4 段(3 面のあと)と
// 段階的に高くなる。3 面のあとは警察官が総出(左右から 4 人)で最後の段を積み、安全ピンを差し込み、旗を立てて完成する。
//
// 段階(長さは config.intermission。1 周目も 2 周目以降も同じ):
//   'intro'(ゴリラが「急げ!」)→ 'carry'(左から 2 人で鉄骨をかついで運ぶ。途中で 1 回よろけてゴリラが怒る)
//   → 'hoist'(クレーンのフックが下りて鉄骨をつり上げ、やぐらの上へ運ぶ)→ 'place'(下ろして「ガキーン!」。1 段高くなる)
//   → (3 面のあとだけ)'pins'(安全ピン 8 本を差し込む)→ 'done'(旗が上がって「やぐら完成!」、全員で万歳)
//   → 'title'(次の面の名前を出して暗転)→ 終わり
// 状態の切り替え(終わったら次の面の READY へ)とスキップは game.js、描画は renderer.js。
// 効果音はこのステップで鳴らす名前を it.sounds に入れ、game.js がまとめて鳴らす。
window.DP = window.DP || {};

DP.intermission = (function () {
  const cfg = () => DP.config.intermission;

  // 画面の配置(480×560)。やぐらは右寄りに建て、左の空いた所へ鉄骨を運んでクレーンでつり上げる
  const LAYOUT = {
    groundY: 520, // 地面(警察官の足元)
    towerX: 320, // やぐらの中心
    tierW: 200, // 1 段の鉄骨の幅
    tierH: 66, // 1 段の高さ
    jibY: 70, // クレーンの腕の高さ
    pickX: 116, // 運んできた鉄骨を下ろす位置(鉄骨の中心。左の警察官がクレーンの柱に重ならない位置)
    carryLift: 46, // かついだ鉄骨の高さ(足元から上へ)
    copGap: 54, // 2 人で鉄骨をかつぐときの、鉄骨の中心から各警察官までの距離
    flagPairX: 424, // 3 面のあと: 右から旗を運んでくる 2 人の止まる位置(2 人の中心)
  };

  // 次の面の日本語の名前(「NEXT STAGE 2」の下に出す。ステージデータは変えない)
  const STAGE_TITLES = { livehouse: 'ライブハウス搬入口', squat: '解体中のスクワット', rivets: '決戦のやぐら' };

  // ---- にぎやかしの警察官(群衆)----
  // 主役の 2 人(3→4 は 4 人)のほかに、工事現場をうじゃうじゃ動き回る警察官。動きは時間だけで決まる(乱数なし)ので、
  // どの周も同じ。合計の人数は 1→2 が 10 人・2→3 が 15 人・3→4 が 20 人(CROWD の先頭から必要な数だけ使う)。
  // kind: 'haul'(短い鉄骨をかついで画面を横切り、端から出たら反対から入り直す)/ 'run'(走って行ったり来たり)/
  //       'wander'(右往左往: 歩いて止まって「?」、逆へ歩いて止まる)/ 'slack'(サボって居眠り「Zzz」。ゴリラが怒鳴ると飛び起きて敬礼)/
  //       'salute'(ゴリラに向かって敬礼したまま)/ 'tower'(やぐらの n 段目の上で、腕を振り上げて鉄骨をたたく)
  // row: 'back'(奥。地面の奥 y=506、主役より先に描く)/ 'front'(手前。y=552、最後に描く)。人が重なりすぎないよう x と速さをずらす
  const CROWD = [
    { kind: 'haul', row: 'back', x: 0, dir: 1, speed: 1.2 },
    { kind: 'run', row: 'front', a: 30, b: 450, speed: 2.2, off: 0 },
    { kind: 'slack', row: 'front', x: 70, facing: -1 },
    { kind: 'wander', row: 'back', x: 250, range: 50, off: 0 },
    { kind: 'salute', row: 'back', x: 452, facing: -1 },
    { kind: 'haul', row: 'front', x: 300, dir: -1, speed: 1.0 },
    { kind: 'tower', tier: 1, dx: -66, off: 0 },
    { kind: 'run', row: 'back', a: 150, b: 466, speed: 1.8, off: 140 },
    { kind: 'wander', row: 'front', x: 340, range: 46, off: 60 },
    { kind: 'slack', row: 'back', x: 186, facing: 1 },
    { kind: 'haul', row: 'back', x: 330, dir: 1, speed: 1.4 },
    { kind: 'salute', row: 'front', x: 462, facing: -1 },
    { kind: 'tower', tier: 2, dx: 66, off: 5 },
    { kind: 'run', row: 'front', a: 20, b: 300, speed: 2.6, off: 80 },
    { kind: 'wander', row: 'back', x: 110, range: 36, off: 30 },
    { kind: 'haul', row: 'front', x: 120, dir: -1, speed: 1.3 },
  ];
  const ROW_Y = { back: 506, front: 552 };
  // 合計の人数(主役を含む)
  const TOTAL_COPS = [10, 15, 20];

  // 時間 total・演出の状態 it から、にぎやかしの警察官 1 人の位置・向き・ポーズを決める
  function crowdCop(d, it, total) {
    const L = LAYOUT;
    const placed = it.beam.state === 'placed';
    const party = it.final && (it.phase === 'done' || it.phase === 'title'); // 完成したら全員で万歳
    const o = { kind: d.kind, x: d.x || 0, y: d.row ? ROW_Y[d.row] : 0, facing: d.facing || 1, pose: 'stand', walking: false, step: 0, label: '' };
    const stepOf = (n) => (Math.floor(total / n) % 2 ? 1 : 0);
    if (d.kind === 'haul') {
      // 端から出たら反対の端から入り直す(-40〜520 の間をぐるぐる)
      const span = C_W() + 80;
      o.x = ((((d.x + 40 + d.dir * d.speed * total) % span) + span) % span) - 40;
      o.facing = d.dir;
      o.pose = 'carry';
      o.walking = true;
      o.step = stepOf(8);
    } else if (d.kind === 'run') {
      // a〜b を往復(三角波)。走るので足の入れ替えが速い
      const len = d.b - d.a;
      const u = ((d.speed * total + d.off) % (len * 2) + len * 2) % (len * 2);
      o.x = u < len ? d.a + u : d.b - (u - len);
      o.facing = u < len ? 1 : -1;
      o.walking = true;
      o.step = stepOf(4);
    } else if (d.kind === 'wander') {
      // 120 ステップで 1 周: 右へ 40 → 止まる 20 → 左へ 40 → 止まる 20。止まっている間は「?」
      const u = (total + d.off) % 120;
      const k = d.range / 40;
      if (u < 40) { o.x = d.x - d.range / 2 + u * k; o.facing = 1; o.walking = true; }
      else if (u < 60) { o.x = d.x + d.range / 2; o.facing = 1; o.label = '?'; }
      else if (u < 100) { o.x = d.x + d.range / 2 - (u - 60) * k; o.facing = -1; o.walking = true; }
      else { o.x = d.x - d.range / 2; o.facing = -1; o.label = '?'; }
      o.step = stepOf(8);
    } else if (d.kind === 'slack') {
      // サボって居眠り。ゴリラが怒鳴っている間は飛び起きて敬礼(「!」)
      if (it.boss.shout > 0) { o.pose = 'salute'; o.facing = 1; o.label = '!'; }
      else o.label = 'Zzz';
    } else if (d.kind === 'salute') {
      o.pose = 'salute';
    } else if (d.kind === 'tower') {
      // やぐらの tier 段目の上で、腕を振り上げて鉄骨をたたく(その段ができてから現れる)
      if (it.tiers < d.tier) return null;
      o.x = L.towerX + d.dx;
      o.y = tierTopY(d.tier);
      o.facing = d.dx < 0 ? 1 : -1;
      o.pose = Math.floor((total + d.off) / 10) % 2 ? 'cheer' : 'stand';
    }
    // 鉄骨が積まれたら、その場で止まって敬礼(運ぶ・走る人はそのまま働く)。完成したら全員で万歳
    if (party) {
      o.pose = 'cheer';
      o.walking = false;
      o.label = '';
    } else if (placed && (d.kind === 'wander' || d.kind === 'slack' || d.kind === 'tower')) {
      o.pose = 'salute';
      o.walking = false;
      o.label = '';
    }
    o.hop = o.pose === 'cheer' && d.kind !== 'tower' ? Math.abs(Math.sin((total + o.x) / 6)) * 6 : 0;
    return o;
  }
  const C_W = () => DP.config.WIDTH;

  // 何段目の上面の高さか(0 段 = 地面)
  const tierTopY = (n) => LAYOUT.groundY - n * LAYOUT.tierH;

  // 演出の種類。from: クリアした面(0 始まり)。1〜3 面のあと(次が 2〜4 面)だけ演出がある
  function has(from, to) {
    return from >= 0 && from <= 2 && to === from + 1;
  }

  // 段階と長さの並び(合計が演出の長さ)
  function phasesOf(final) {
    const k = cfg();
    const list = [['intro', k.intro], ['carry', final ? k.carryFinal : k.carry], ['hoist', k.hoist], ['place', k.place]];
    if (final) list.push(['pins', k.pins], ['done', k.done]);
    list.push(['title', final ? k.titleFinal : k.title]);
    return list;
  }

  // 演出の長さ(ステップ)。1→2・2→3 は約 8 秒、3→4 は約 11 秒
  function lengthOf(from) {
    return phasesOf(from === 2).reduce((a, p) => a + p[1], 0);
  }

  // from: クリアした面 / to: 次の面(0 始まり)
  function create(from, to) {
    const final = from === 2;
    const before = from + 1; // 演出の前のやぐらの段数(1 面のあとは 1 段)
    const it = {
      from,
      to,
      final,
      stageName: DP.stages[to].name,
      stageTitle: STAGE_TITLES[DP.stages[to].id] || '',
      phases: phasesOf(final),
      phaseIndex: 0,
      phase: 'intro',
      t: 0, // 段階ごとの経過ステップ
      total: 0, // 演出全体の経過ステップ
      length: lengthOf(from),
      tiers: before, // 今のやぐらの段数
      tiersAfter: before + 1,
      // 鉄骨(運ぶ → つる → 置く)。x は中心、y は上面
      beam: { x: -LAYOUT.copGap - 60, y: LAYOUT.groundY - LAYOUT.carryLift, state: 'carried', tilt: 0 },
      hook: { x: LAYOUT.pickX, y: LAYOUT.jibY + 20 }, // クレーンのフック(y は先端)
      // 警察官。左の 2 人が鉄骨を、3 面のあとは右の 2 人が旗を運ぶ。
      // pose: 'carry' | 'stand' | 'salute' | 'cheer'、step: 歩きの足の入れ替え
      cops: [],
      flag: { x: LAYOUT.flagPairX, carried: final, up: 0 }, // up: 旗が上がった量(0〜1)
      pinsIn: 0, // 差し込んだ安全ピンの数(3 面のあと)
      stumble: 0, // よろけている残りステップ
      boss: { x: LAYOUT.towerX, y: tierTopY(before), pose: 'stand', bubble: '', shout: 0 },
      shake: 0, // 画面の揺れ(px)
      sparks: 0, // 鉄骨を置いたときの火花の残りステップ
      fade: 0, // 暗転の量(0〜1)
      sounds: [],
      stepToggle: false,
      crowdDefs: [], // にぎやかしの警察官(CROWD から)
      crowd: [], // その位置・ポーズ(毎ステップ crowdCop で決め直す)
    };
    const L = LAYOUT;
    it.cops.push({ x: it.beam.x - L.copGap, y: L.groundY, facing: 1, pose: 'carry', step: 0, side: 'left' });
    it.cops.push({ x: it.beam.x + L.copGap, y: L.groundY, facing: 1, pose: 'carry', step: 0, side: 'left' });
    if (final) {
      // 右から旗(長い旗ざお)をかついでくる 2 人
      it.cops.push({ x: 540 - 30, y: L.groundY, facing: -1, pose: 'carry', step: 0, side: 'right' });
      it.cops.push({ x: 540 + 30, y: L.groundY, facing: -1, pose: 'carry', step: 0, side: 'right' });
      it.flag.x = 540;
    }
    it.crowdDefs = CROWD.slice(0, TOTAL_COPS[from] - it.cops.length);
    updateCrowd(it);
    return it;
  }

  function updateCrowd(it) {
    it.crowd = it.crowdDefs.map((d) => crowdCop(d, it, it.total)).filter(Boolean);
  }

  function nextPhase(it) {
    it.phaseIndex++;
    it.t = 0;
    it.phase = it.phaseIndex < it.phases.length ? it.phases[it.phaseIndex][0] : 'end';
  }

  // ゴリラが指示を出す(吹き出しと腕を振り上げるポーズ、うなり声)
  function shout(it, text) {
    it.boss.bubble = text;
    it.boss.shout = cfg().shoutFrames;
    it.sounds.push('bossBark');
  }

  // 足踏みの音(運んでいる間、stepInterval ごとに左右の足を交互に)
  function footstep(it, k) {
    if (it.t % k.stepInterval === 0) {
      it.stepToggle = !it.stepToggle;
      it.sounds.push('copStep');
      for (const c of it.cops) if (c.walking) c.step = it.stepToggle ? 1 : 0;
    }
  }

  // 1 ステップ進める。終わったら true
  function update(it) {
    const k = cfg();
    const L = LAYOUT;
    it.t++;
    it.total++;
    it.sounds = [];
    it.shake = 0;
    if (it.sparks > 0) it.sparks--;
    if (it.boss.shout > 0) it.boss.shout--;
    it.boss.pose = it.boss.shout > 0 && Math.floor(it.boss.shout / 8) % 2 === 0 ? 'up' : 'stand';
    const len = it.phases[it.phaseIndex] ? it.phases[it.phaseIndex][1] : 0;

    switch (it.phase) {
      case 'intro':
        if (it.t === 10) shout(it, '急げ!');
        break;
      case 'carry': {
        // 左の 2 人が鉄骨をかついで pickX まで歩く。途中(半分の所)で 1 回よろけて、ゴリラが「コラー!」
        const startX = -L.copGap - 60;
        const walkFrames = len - k.stumble - 10; // 最後の 10 ステップは止まって待つ
        if (it.t === Math.floor(walkFrames / 2)) {
          it.stumble = k.stumble;
          shout(it, 'コラー!');
        }
        let moving = false;
        if (it.stumble > 0) {
          it.stumble--;
          it.beam.tilt = Math.sin(it.stumble / 3) * 0.12; // 鉄骨がぐらぐら傾く
        } else {
          it.beam.tilt = 0;
          const done = it.t - (it.t > walkFrames / 2 ? k.stumble : 0);
          const p = Math.min(1, done / walkFrames);
          it.beam.x = startX + (L.pickX - startX) * p;
          moving = p < 1;
        }
        it.cops[0].x = it.beam.x - L.copGap;
        it.cops[1].x = it.beam.x + L.copGap;
        it.cops[0].walking = it.cops[1].walking = moving;
        if (it.final) {
          // 右の 2 人は旗をかついで flagPairX まで(よろけない)
          const p = Math.min(1, it.t / (len - 10));
          it.flag.x = 540 + (L.flagPairX - 540) * p;
          it.cops[2].x = it.flag.x - 30;
          it.cops[3].x = it.flag.x + 30;
          it.cops[2].walking = it.cops[3].walking = p < 1;
        }
        if (it.cops.some((c) => c.walking)) footstep(it, k);
        if (it.t >= len) {
          for (const c of it.cops) {
            c.walking = false;
            c.step = 0;
          }
        }
        break;
      }
      case 'hoist': {
        // フックが下りる(1/4)→ 鉄骨をつり上げる(2/4。警察官は手を離して見上げる)→ やぐらの上へ横に運ぶ(1/4)。
        // つり上げ・運ぶ間は巻き上げの「カリカリ」
        const q = len / 4;
        const carryY = L.groundY - L.carryLift; // かついでいた鉄骨の下面
        const highY = tierTopY(it.tiers + 1) - 24; // やぐらより上(置く高さの少し上)
        if (it.t <= q) {
          it.hook.x = L.pickX;
          it.hook.y = L.jibY + 20 + (carryY - 8 - (L.jibY + 20)) * (it.t / q);
        } else {
          if (it.beam.state === 'carried') {
            it.beam.state = 'hooked';
            for (const c of it.cops.slice(0, 2)) c.pose = 'stand';
          }
          if (it.t <= q * 3) {
            const p = (it.t - q) / (q * 2);
            it.beam.y = carryY + (highY - carryY) * p;
          } else {
            const p = (it.t - q * 3) / q;
            it.beam.x = L.pickX + (L.towerX - L.pickX) * p;
          }
          it.hook.x = it.beam.x;
          it.hook.y = it.beam.y - 8;
          if (it.t % k.winchInterval === 0) it.sounds.push('winch');
        }
        break;
      }
      case 'place':
        // 鉄骨をやぐらの上へ下ろし、着いた瞬間に「ガキーン!」(火花・小さな画面の揺れ)。1 段高くなり、ゴリラも上へ。
        // 警察官は敬礼、ゴリラは胸をたたいて「よし!」
        if (it.beam.state === 'hooked') {
          const target = tierTopY(it.tiers + 1);
          it.beam.y = Math.min(target, it.beam.y + 3);
          it.hook.y = it.beam.y - 8;
          if (it.beam.y >= target) {
            it.beam.state = 'placed';
            it.tiers = it.tiersAfter;
            it.boss.y = tierTopY(it.tiers);
            it.sparks = k.sparkFrames;
            it.sounds.push('beamClang');
            for (const c of it.cops) c.pose = 'salute';
            shout(it, 'よし!');
          }
        } else {
          it.hook.y = Math.max(L.jibY + 20, it.hook.y - 4); // フックは上へ戻る
        }
        if (it.beam.state === 'placed' && it.t - (it.placedAt || (it.placedAt = it.t)) < k.shakeFrames) {
          it.shake = (it.t % 2 ? 1 : -1) * 3;
        }
        break;
      case 'pins':
        // 3 面のあと: 安全ピン 8 本を、下の段から順に差し込む(差し込むたびにピンの音)
        if (it.t % k.pinInterval === 0 && it.pinsIn < 8) {
          it.pinsIn++;
          it.sounds.push('pin');
        }
        break;
      case 'done':
        // 旗が上がって「やぐら完成!」。完成のファンファーレ、警察官は万歳、ゴリラは「完成だ!」
        if (it.t === 1) {
          it.flag.carried = false;
          it.sounds.push('towerDone');
          for (const c of it.cops) c.pose = 'cheer';
          shout(it, '完成だ!');
        }
        it.flag.up = Math.min(1, it.t / 40);
        break;
      case 'title':
        // 次の面の名前を出し、最後の fadeFrames ステップで暗転する
        it.fade = Math.max(0, (it.t - (len - k.fadeFrames)) / k.fadeFrames);
        break;
    }
    // 万歳の間は跳ねる
    for (const c of it.cops) c.hop = c.pose === 'cheer' ? Math.abs(Math.sin((it.total + c.x) / 6)) * 6 : 0;
    updateCrowd(it);

    if (it.phase !== 'end' && it.t >= len) nextPhase(it);
    return it.phase === 'end';
  }

  return { create, update, has, lengthOf, tierTopY, LAYOUT, CROWD, TOTAL_COPS };
})();
