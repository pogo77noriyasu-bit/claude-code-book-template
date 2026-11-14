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
      // 1 面の周回ごとの難しさ(ステージデータの roundRules。2 個セットの割合・連投の割合)。roundRules のない面は null
      rules: DP.hazards.roundRules(level.stage, difficulty.round),
      speedMul: difficulty.speedMul || 1,
      queued: null, // 連投の 2 本目 { type, delay }
      second: false, // 連投の 2 本目を持ち上げているところか
      opening: null, // 開幕の連続投げ { left: 残りの本数, no: 何本目まで投げたか, base: 種類 }
    };
    // 開幕の連続投げ(1 面の R2 以降。roundRules の openingThrows 本)。プレイが始まってすぐ 1 本目を持ち上げる。
    // R1(openingThrows 0)と 2〜4 面は今までどおり(最初の 1 本は 60 ステップ待ってから)
    if (boss.rules && boss.rules.openingThrows > 0) {
      boss.opening = { left: boss.rules.openingThrows, no: 0, base: null };
      boss.timer = 1;
    }
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

    const rules = boss.rules;
    const op = boss.opening;
    if (boss.state === 'idle') {
      boss.state = 'grab';
      if (op && op.left > 0) {
        // 開幕の連続投げ: 種類は 1 本目の抽選で決め、2 本目からは同じ種類(瓶と缶は速さが違うので、混ぜると間隔が縮む)。
        // 指定の番号(openingPairs)は必ず 2 個セット、それ以外は通常の抽選
        if (!op.base) op.base = rng() < level.stage.canRatio ? 'can' : 'bottle';
        op.no++;
        boss.holding = op.base;
        if (rules.openingPairs.includes(op.no) || (rules.pairRate > 0 && rng() < rules.pairRate)) boss.holding += '2';
      } else if (rules && rules.trashRate > 0 && level.stage.lob && rng() < rules.trashRate) {
        // 斜め投げ(1 面のゴミ箱): 通常の 1 本をゴミ箱に置き換える(本数・間隔は増えない)。
        // 割合が 0 の周回(R1〜R4)では乱数を引かないので、R1〜R4 の乱数の並びは今までと同じ
        boss.holding = level.stage.lob.type;
      } else {
        boss.holding = rng() < level.stage.canRatio ? 'can' : 'bottle';
        // 2 個セットの抽選(割合が 0 の周回・面では乱数を引かない。R1 の乱数の並びは改修前と同じ)
        if (rules && rules.pairRate > 0 && rng() < rules.pairRate) boss.holding += '2';
      }
      boss.timer = 30;
    } else if (boss.state === 'grab') {
      boss.state = 'throw';
      ev.spawn = boss.holding;
      boss.thrown = boss.holding; // 投げた物(描画で、斜め投げの腕の振りを出すため)
      boss.timer = 24;
      const lobbed = !!(level.stage.lob && boss.holding === level.stage.lob.type);
      if (op && op.left > 0) {
        // 開幕の連続投げ: 次の 1 本は、端と端が 140px あく最短のタイミングで投げる(持ち上げ 30 + 転がす 24 ステップを差し引いた待ち)。
        // 次が 2 個セットかはまだ決まっていないので、2 個セットだとして間隔を取る(単体なら少し広くなる)
        op.left--;
        if (op.left > 0) {
          const base = DP.hazards.baseType(boss.holding);
          const speed = DP.config.hazard[base].speed * boss.speedMul;
          const span = DP.config.hazard.pair.doubleGap + DP.hazards.lengthOf(boss.holding) / 2 + DP.hazards.lengthOf(base + '2') / 2;
          op.wait = Math.max(1, Math.ceil(span / speed) - 54);
        }
      } else if (!lobbed && !boss.second && rules && rules.doubleRate > 0 && rng() < rules.doubleRate) {
        // (斜め投げのゴミ箱は連投しない)
        // 連投: 同じ種類をもう 1 本。2 本目も 2 個セットの抽選をする。端と端が doubleGap(140px)あくように、
        // 1 本目を投げてから delay ステップ後に 2 本目を投げる(同じ種類なので速さも同じで、転がる間この間隔は変わらない)
        const base = DP.hazards.baseType(boss.holding);
        let type2 = base;
        if (rules.pairRate > 0 && rng() < rules.pairRate) type2 += '2';
        const speed = DP.config.hazard[base].speed * boss.speedMul;
        const span = DP.config.hazard.pair.doubleGap + DP.hazards.lengthOf(boss.holding) / 2 + DP.hazards.lengthOf(type2) / 2;
        boss.queued = { type: type2, delay: Math.ceil(span / speed) };
      }
      boss.second = false;
      boss.holding = null;
    } else if (boss.queued) {
      // 連投の 2 本目を持ち上げる(1 本目からちょうど delay ステップ後に投げる)
      boss.state = 'grab';
      boss.holding = boss.queued.type;
      boss.timer = Math.max(1, boss.queued.delay - 24);
      boss.queued = null;
      boss.second = true;
    } else {
      boss.state = 'idle';
      if (op && op.left > 0) {
        boss.timer = op.wait; // 開幕の連続投げの次の 1 本
      } else {
        boss.timer = boss.nextInterval();
        boss.opening = null; // 開幕の連続投げは終わり(このあとは通常の投げ方)
      }
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
