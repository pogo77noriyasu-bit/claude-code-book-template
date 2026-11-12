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

  window.__dp = {
    snapshot,
    sounds: () => soundLog.slice(),
    clearSounds: () => { soundLog.length = 0; },
    soundEnabled: () => DP.audio.isEnabled(),
    music: () => DP.audio.currentMusic(),
    musicDucked: () => DP.audio.isMusicDucked(),
    // 地形情報(テストで座標を計算するため)
    level: () => g.level && {
      girders: g.level.girders.map((x) => ({ id: x.id, x1: x.x1, y1: x.y1, x2: x.x2, y2: x.y2 })),
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
      p.x = x; p.y = y; p.vx = 0; p.vy = vy; p.peakY = y;
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
    // 釘バットの残りステップを直接設定する(0 で手放す)
    setBat: (n) => { g.player.bat = n; g.player.batTime = 0; },
    // 向きを変える(1: 右 / -1: 左)
    setFacing: (d) => { g.player.facing = d; },
  };
};
