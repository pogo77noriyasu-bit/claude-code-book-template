// 敵キャラクター(ゴリラ警官)とヒロイン(スキンヘッドガール)
window.DP = window.DP || {};

DP.enemies = (function () {
  const geo = DP.geometry;

  // ゴリラ警官。'idle' → 'grab'(ビールを持ち上げる)→ 'throw'(転がす)→ 'idle' をくり返す
  function createBoss(level, difficulty, rng) {
    const s = level.stage.boss;
    const g = level.byId[s.girder];
    const boss = {
      x: s.x,
      y: geo.surfaceY(g, s.x),
      girder: g,
      throwX: s.throwX,
      state: 'idle',
      timer: 60, // 最初の 1 本は少し待ってから
      holding: null, // 持ち上げているビールの種類
      anim: 0,
      enabled: true, // テスト用に投下を止められるようにしている
    };
    boss.nextInterval = () => {
      const t = level.stage.throwInterval;
      const base = t.min + (t.max - t.min) * rng();
      return Math.max(50, Math.round(base * difficulty.throwMul));
    };
    return boss;
  }

  // 1 ステップ分の更新。ビールを投下したら { spawn: 'bottle' | 'can' } を返す
  function updateBoss(boss, level, rng) {
    boss.anim++;
    const ev = {};
    if (!boss.enabled) {
      boss.state = 'idle';
      boss.holding = null;
      return ev;
    }
    boss.timer--;
    if (boss.timer > 0) return ev;

    if (boss.state === 'idle') {
      boss.state = 'grab';
      boss.holding = rng() < level.stage.canRatio ? 'can' : 'bottle';
      boss.timer = 30;
    } else if (boss.state === 'grab') {
      boss.state = 'throw';
      ev.spawn = boss.holding;
      boss.holding = null;
      boss.timer = 24;
    } else {
      boss.state = 'idle';
      boss.timer = boss.nextInterval();
    }
    return ev;
  }

  // 何も投げない面でのゴリラ(待機アニメだけ進める)
  function idleBoss(boss) {
    boss.anim++;
    boss.state = 'idle';
    boss.holding = null;
  }

  // ゴリラの当たり判定(大きな体)
  function bossHitbox(boss) {
    return { x: boss.x, y: boss.y, w: 40, h: 44 };
  }

  function createHeroine(level) {
    const s = level.stage.heroine;
    const g = level.byId[s.girder];
    return { x: s.x, y: geo.surfaceY(g, s.x), anim: 0 };
  }

  function heroineHitbox(h) {
    return { x: h.x, y: h.y, w: 16, h: 28 };
  }

  return { createBoss, updateBoss, idleBoss, bossHitbox, createHeroine, heroineHitbox };
})();
