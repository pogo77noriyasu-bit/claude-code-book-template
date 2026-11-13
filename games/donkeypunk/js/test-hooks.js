// テスト補助(Playwright 用)
// URL に ?test が付いているときだけ window.__dp を公開する。
// 通常プレイでは何も公開せず、ゲームの動作にも一切影響しない。
window.DP = window.DP || {};

DP.installTestHooks = function (game, loop, renderer) {
  if (!new URLSearchParams(location.search).has('test')) return;
  const g = game.data;
  const geo = DP.geometry;

  // 種を固定した乱数(mulberry32)
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function snapshot() {
    const p = g.player;
    return {
      stageIndex: g.stageIndex,
      stageId: g.level ? g.level.stage.id : null,
      state: g.state,
      message: g.message,
      score: g.score,
      lives: g.lives,
      round: g.round,
      bonus: g.bonus,
      deathReason: g.deathReason,
      player: p && {
        x: p.x,
        y: p.y,
        vy: p.vy,
        state: p.state,
        girder: p.girder ? p.girder.id : null,
        ladder: p.ladder ? p.ladder.index : null,
        head: p.y - DP.config.player.height,
        facing: p.facing,
        bat: p.bat,
        batPhase: DP.player.batPhase(p),
      },
      popups: g.popups.map((pp) => pp.text),
      boss: g.boss && { x: g.boss.x, y: g.boss.y, gone: !!g.boss.gone },
      heroine: g.heroine && { x: g.heroine.x, y: g.heroine.y, gone: !!g.heroine.gone },
      escape: g.escape && {
        phase: g.escape.phase, bossX: g.escape.bossX, bossY: g.escape.bossY,
        girlX: g.escape.girlX, girlY: g.escape.girlY, carrying: g.escape.carrying,
        ladderX: g.escape.ladderX, ladderBottom: g.escape.ladderBottom, walkFrame: g.escape.walkFrame,
      },
      enemies: g.enemies.map((e) => ({
        id: e.id, type: e.type, state: e.state, x: e.x, y: e.y, dir: e.dir, t: e.t, landGrace: !!e.landGrace,
        girder: e.girder ? e.girder.id : null, ladder: e.ladder ? e.ladder.index : null,
      })),
      // 3 面の鉄球の中心と本体の当たり判定(ほかの面では null)
      wreckingBall: g.level && g.level.stage.wreckingBall ? {
        frame: g.frame,
        x: DP.mechanics.wreckingBall.position(g.level.stage.wreckingBall, g.frame).x,
        y: DP.mechanics.wreckingBall.position(g.level.stage.wreckingBall, g.frame).y,
        boxes: DP.mechanics.wreckingBall.hitboxes(g.level.stage.wreckingBall, g.frame),
      } : null,
      // 3 面のパンクニワトリ(wing: 羽の向き。box: 当たり判定)
      birds: ((g.level && g.level.birds) || []).map((b) => ({
        id: b.id, line: b.line, color: b.color, dir: b.dir, x: b.x, y: b.y, wing: DP.birds.wing(b), box: DP.birds.hitbox(b),
      })),
      items: g.items.map((it) => Object.assign({ type: it.type, taken: it.taken }, game._itemHitbox(it))),
      hazards: g.hazards.map((h) => ({
        id: h.id, type: h.type, x: h.x, y: h.y, state: h.state,
        girder: h.girder ? h.girder.id : null,
        ladder: h.ladder ? h.ladder.index : null,
      })),
    };
  }

  // 実際に鳴らした効果音の名前を記録する(音 OFF のときは記録されない)
  const soundLog = [];
  DP.audio._setOnPlay((name) => soundLog.push(name));
  const musicSteps = [];

  window.__dp = {
    snapshot,
    sounds: () => soundLog.slice(),
    clearSounds: () => { soundLog.length = 0; },
    soundEnabled: () => DP.audio.isEnabled(),
    music: () => DP.audio.currentMusic(),
    musicDucked: () => DP.audio.isMusicDucked(),
    musicActive: () => DP.audio.activeMusicCount(),
    audioState: () => DP.audio.contextState(),
    // BGM の 1 ステップを予約するたびに { name, step, t } を記録する(ループのつなぎ目の確認用)
    recordMusicSteps: () => { musicSteps.length = 0; DP.audio._setOnMusicStep((name, step, t) => musicSteps.push({ name, step, t })); },
    musicSteps: () => musicSteps.slice(),
    seekMusic: (step) => DP.audio._seekMusic(step),
    // 地形情報(テストで座標を計算するため)
    level: () => g.level && {
      girders: g.level.girders.map((x) => ({ id: x.id, x1: x.x1, y1: x.y1, x2: x.x2, y2: x.y2, kind: x.kind || null })),
      ladders: g.level.ladders.map((l) => ({
        index: l.index, x: l.x, lower: l.lower.id, upper: l.upper.id, topY: l.topY, bottomY: l.bottomY,
        broken: l.broken, climbTopY: l.climbTopY, stubBottomY: l.stubBottomY,
      })),
      escapeLadders: g.level.stage.escape.ladders.slice(),
    },
    surfaceY: (id, x) => geo.surfaceY(g.level.byId[id], x),
    // ループを手動にして、決まった回数だけ進める
    setManual: (on) => { loop.manual = !!on; },
    step: (n) => { for (let i = 0; i < (n || 1); i++) loop.step(); return snapshot(); },
    setSeed: (s) => game._setRng(seeded(s)),
    setBossEnabled: (on) => { if (g.boss) g.boss.enabled = !!on; },
    // 3 面の鉄球の当たり判定を止める / 戻す(揺れと見た目はそのまま。ジャンプの届く範囲だけを測るテスト用)
    setWreckingBallEnabled: (on) => { g.wreckingBallOff = !on; },
    clearHazards: () => { g.hazards = []; },
    spawnHazard: (type, girderId, x) => game._spawnHazard(type, girderId, x).id,
    // プレイヤーを鉄骨の上の指定位置に置く
    placePlayer: (girderId, x) => {
      const p = g.player;
      const gd = g.level.byId[girderId];
      p.state = 'ground'; p.girder = gd; p.ladder = null;
      p.x = x; p.y = geo.surfaceY(gd, x); p.vx = 0; p.vy = 0;
    },
    // プレイヤーを空中に置く(下から鉄骨に突っ込むテスト用)
    placePlayerAir: (x, y, vy) => {
      const p = g.player;
      p.state = 'air'; p.girder = null; p.ladder = null;
      p.x = x; p.y = y; p.vx = 0; p.vy = vy; p.fallFromY = y;
    },
    // プレイヤーをハシゴの途中(足元の高さ y)につかまらせる
    placePlayerLadder: (index, y) => {
      const p = g.player;
      const l = g.level.ladders[index];
      p.state = 'ladder'; p.girder = null; p.ladder = l;
      p.x = l.x; p.y = y; p.vx = 0; p.vy = 0;
    },
    // ハシゴを降りる確率を変える(テスト用。null で元に戻す)
    setLadderChance: (v) => {
      if (DP.installTestHooks._origChance === undefined) DP.installTestHooks._origChance = DP.config.hazard.ladderChance;
      DP.config.hazard.ladderChance = v === null ? DP.installTestHooks._origChance : v;
    },
    setLives: (n) => { g.lives = n; },
    // ファイヤースカル: 自動の出現を止める・出す / 指定の場所に出す(skipSpawn で出現の演出を省く)/ 全部消す
    setSkullsEnabled: (on) => { g.skullsEnabled = !!on; },
    // 3 面のパンクニワトリの自動の出現を止める / 戻す(出ている鳥はそのまま飛ぶ)
    setBirdsEnabled: (on) => { g.birdsEnabled = !!on; },
    // ライン index(0 = いちばん上)に鳥を 1 羽出す。x を省くと飛んでくる側の画面の外から
    spawnBird: (index, x) => {
      const lv = g.level;
      if (!lv.birds) DP.mechanics.birds.init(lv);
      const b = DP.birds.create(lv.stage.birds.lines[index], index, x);
      lv.birds.push(b);
      return b.id;
    },
    clearBirds: () => { if (g.level.birds) g.level.birds = []; },
    spawnSkull: (girderId, x, opts) => { const e = DP.skulls.create(g.level, girderId, x, opts || {}); g.enemies.push(e); return e.id; },
    clearEnemies: () => { g.enemies = []; },
    // 爆音アンプからスカルを出す(side: 'left' | 'right'。着地点の安全確認はしない)/ アンプの炎の燃え上がりの残り
    spawnSkullFromAmp: (side) => {
      const ls = g.level.stage.skulls.landings;
      const e = DP.skulls.createFromAmp(g.level, side === 'right' ? ls[1] : ls[0]);
      g.enemies.push(e);
      g.level.ampFlare = DP.config.skull.emergeFrames + DP.config.skull.leapFrames;
      return e.id;
    },
    ampFlare: () => g.level.ampFlare || 0,
    // 追跡 AI の確率を確かめる: スカル id がハシゴ ladderIndex を通りかかったときの使う確率
    // (主人公が上の段・下の段・同じ段にいる場合)
    chanceFor: (id, ladderIndex) => {
      const e = g.enemies.find((x) => x.id === id);
      const l = g.level.ladders[ladderIndex];
      const at = (state, girder, y) => ({ state, girder, y, x: e.x });
      return {
        playerAbove: DP.skulls.ladderChanceFor(e, l, at('ground', l.upper, l.topY)),
        playerBelow: DP.skulls.ladderChanceFor(e, l, at('ground', g.level.byId.f0, 540)),
        sameLevel: DP.skulls.ladderChanceFor(e, l, at('ground', e.girder, e.y)),
      };
    },
    // 向きの考え直し(thinkDir)に乱数を n 回渡したときの割合
    thinkStats: (n) => {
      const gd = g.level.byId.f0;
      const s = { x: 300, y: 540, dir: 1, girder: gd };
      const same = { state: 'ground', girder: gd, x: 60, y: 540 }; // 同じ段の左にいる主人公
      const other = { state: 'ground', girder: g.level.byId.mid || g.level.byId.f0, x: 60, y: 350 };
      let toward = 0, reverse = 0;
      let seed = 12345;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < n; i++) {
        if (DP.skulls.thinkDir(s, same, rnd()) === -1) toward++;
        if (DP.skulls.thinkDir(s, other, rnd()) === -1) reverse++;
      }
      return { sameLevelToward: toward / n, otherLevelReverse: reverse / n };
    },
    // アンプの炎の見た目の大きさ({ scale, cols, flaring })
    ampFlameScale: () => DP.mechanics.amp.flameScale(g.level.ampFlare || 0),
    // スカルをハシゴの途中に置く(vdir: -1 = 上へ / 1 = 下へ)
    placeSkullOnLadder: (id, ladderIndex, y, vdir) => {
      const e = g.enemies.find((x) => x.id === id);
      const l = g.level.ladders[ladderIndex];
      e.state = 'ladder'; e.ladder = l; e.girder = null; e.x = l.x; e.y = y; e.vdir = vdir;
    },
    skullHitbox: (id) => { const e = g.enemies.find((x) => x.id === id); return e ? DP.skulls.hitbox(e) : null; },
    // 指定の面(0 始まり)から新しいゲームを始める(READY から)
    startStage: (index, round) => game._startStage(index, round),
    stageIds: () => DP.stages.map((s) => s.id),
    // 爆音アンプの当たり判定(2 面。アンプのない面は null)
    ampHitbox: () => (g.level.stage.amp ? DP.mechanics.amp.hitbox(g.level.stage.amp) : null),
    // 障害物を「触れると炎上」にする(将来のファイヤースカルの代わりに演出を確かめる用)
    setHazardBurns: (id, on) => { const h = g.hazards.find((x) => x.id === id); if (h) h.burns = on !== false; },
    // ベルトコンベアの今の状態(向き・速さ・逆転の予告中か・逆転までの経過)
    // 3 面のリフトの状態(type: 'loop' / 'shuttle'、板の id と高さ、往復リフトの向き・止まっている残り)
    lifts: () => (g.level.lifts || []).map((L) => ({
      id: L.id, type: L.type, speed: L.speed, spacing: L.spacing || 0, pauseFrames: L.pauseFrames || 0,
      x1: L.x1, x2: L.x2, top: L.def.top, bottom: L.def.bottom, stops: L.stops || null,
      plates: L.plates.map((p) => ({ id: p.id, y: p.y1 })),
      dir: L.state ? L.state.dir : -1, pause: L.state ? L.state.pause : 0,
    })),
    conveyors: () => g.level.girders.filter((x) => x.conveyor).map((x) => ({
      id: x.id, dir: x.convDir === undefined ? x.conveyor.dir : x.convDir, vx: x.vx || 0,
      warn: !!x.convWarn, timer: x.convTimer || 0, reverseEvery: x.conveyor.reverseEvery || 0,
    })),
    // 釘バットの残りステップを直接設定する(0 で手放す)
    setBat: (n) => { g.player.bat = n; g.player.batTime = 0; },
    // 向きを変える(1: 右 / -1: 左)
    setFacing: (d) => { g.player.facing = d; },
  };
};
