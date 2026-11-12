// ゲーム全体の進行(状態遷移・スコア・残機・当たり判定のまとめ)
// 状態: 'title' | 'ready' | 'playing' | 'dying' | 'clear' | 'gameover'
window.DP = window.DP || {};

DP.createGame = function () {
  const C = DP.config;
  const geo = DP.geometry;

  // 乱数(テストでは種を固定できるよう差し替え可能にしている)
  let rng = Math.random;

  const g = {
    state: 'title',
    timer: 0, // 状態ごとの経過ステップ
    frame: 0, // 通算ステップ(アニメ用)
    score: 0,
    hiScore: loadHiScore(),
    lives: C.lives,
    round: 1, // 周回数(全ステージを回ると +1)
    stageIndex: 0,
    level: null,
    player: null,
    boss: null,
    heroine: null,
    hazards: [],
    items: [], // 鉄骨の上に置かれたアイテム(釘バット)
    effects: [], // ビールが割れたときの破片
    popups: [], // 得点表示などの浮かぶ文字
    bonus: C.score.bonusStart,
    deathReason: null,
    message: '',
  };

  function loadHiScore() {
    try {
      return parseInt(localStorage.getItem(C.storageKeys.highScore), 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function saveHiScore() {
    if (g.score <= g.hiScore) return;
    g.hiScore = g.score;
    try {
      localStorage.setItem(C.storageKeys.highScore, String(g.hiScore));
    } catch (e) {
      /* 保存できなくても続行 */
    }
  }

  // 周回が進むほど速く・頻繁にする(4 面ができたら「4 面クリア後に周回」で使う)
  function difficulty() {
    const r = g.round - 1;
    return {
      speedMul: Math.min(1.8, 1 + 0.15 * r),
      throwMul: Math.max(0.5, 1 - 0.12 * r),
    };
  }

  function addScore(n, x, y) {
    g.score += n;
    if (x !== undefined) g.popups.push({ text: String(n), x, y, t: 0 });
    saveHiScore();
  }

  function setState(s, message) {
    g.state = s;
    g.timer = 0;
    g.message = message || '';
  }

  // ステージを組み立て直して、プレイヤーを開始位置に置く(ミス後もここから再開)
  function setupStage() {
    const stage = DP.stages[g.stageIndex];
    g.level = geo.buildLevel(stage);
    g.player = DP.player.create(g.level);
    const prevEnabled = g.boss ? g.boss.enabled : true;
    g.boss = DP.enemies.createBoss(g.level, difficulty(), () => rng());
    g.boss.enabled = prevEnabled;
    g.heroine = DP.enemies.createHeroine(g.level);
    g.hazards = [];
    // アイテムはステージのデータから毎回置き直す(ミスすると元の場所に戻る)。
    // 鉄骨から少し浮かせて置き、y はアイテムの下端
    g.items = (stage.items || []).map((it) => {
      const gd = g.level.byId[it.girder];
      return { type: it.type, x: it.x, y: geo.surfaceY(gd, it.x) - C.bat.itemFloat, taken: false };
    });
    g.effects = [];
    g.popups = [];
    g.bonus = C.score.bonusStart;
    g.deathReason = null;
    setState('ready', stage.name);
  }

  function newGame() {
    g.score = 0;
    g.lives = C.lives;
    g.round = 1;
    g.stageIndex = 0;
    g.boss = null;
    setupStage();
    DP.audio.play('start');
  }

  function nextStage() {
    g.stageIndex++;
    if (g.stageIndex >= DP.stages.length) {
      // 全ステージを回ったら最初に戻って難易度アップ
      g.stageIndex = 0;
      g.round++;
    }
    setupStage();
  }

  function killPlayer(reason) {
    if (g.player.state === 'dead') return;
    g.player.state = 'dead';
    g.deathReason = reason;
    setState('dying');
    DP.audio.play('miss');
  }

  function spawnHazard(type, girderId, x) {
    const h = DP.hazards.create(g.level, type, x, girderId, difficulty().speedMul);
    g.hazards.push(h);
    return h;
  }

  // 浮いている釘バットの当たり判定(描画と同じ位置・大きさ)
  function itemHitbox(it) {
    return { x: it.x, y: it.y, w: C.bat.itemWidth, h: C.bat.itemHeight };
  }

  // 釘バット: 拾う・残り時間を減らす
  function updateBat(p) {
    if (p.bat > 0) {
      p.bat--;
      p.batTime++;
      // 残りわずかになったら 0.5 秒ごとに警告音
      if (p.bat > 0 && p.bat <= C.bat.warnAt && p.bat % 30 === 0) DP.audio.play('batTick');
      if (p.bat === 0) {
        p.batTime = 0;
        DP.audio.play('batEnd');
      }
      return;
    }
    // 持っていないときだけ、ジャンプ中(空中)に実際に触れたら拾える。
    // 高さ的にも歩きでは届かないが、念のため空中にいるときだけ判定する
    if (p.state !== 'air') return;
    const pb = DP.player.hitbox(p);
    for (const it of g.items) {
      if (it.taken) continue;
      if (geo.overlaps(pb, itemHitbox(it))) {
        it.taken = true;
        p.bat = C.bat.duration;
        p.batTime = 0;
        DP.audio.play('batGet');
        break;
      }
    }
  }

  // 釘バットの攻撃範囲に入ったビールを割る
  function smashHazards(p) {
    const bb = DP.player.batHitbox(p);
    if (!bb) return;
    for (const h of g.hazards) {
      if (h.dead || !geo.overlaps(bb, DP.hazards.hitbox(h))) continue;
      h.dead = true;
      h.smashed = true;
      g.effects.push({ x: h.x, y: h.y - 5, t: 0, type: h.type });
      addScore(C.score.smash, h.x, h.y - 20);
      DP.audio.play('smash');
    }
    g.hazards = g.hazards.filter((h) => !h.dead);
  }

  // プレイ中の 1 ステップ
  function updatePlaying(input) {
    const p = g.player;
    const ev = DP.player.update(p, g.level, input);
    if (ev.jumped) DP.audio.play('jump');
    // 足音(地上を歩いているときだけ player.js が出す)。釘バット使用中は BGM があるので鳴らさない
    if (ev.step && !(p.bat > 0)) DP.audio.play(ev.step);
    if (ev.died) {
      killPlayer(ev.died);
      return;
    }

    updateBat(p);

    // ゴリラ警官がビールを投下
    const bev = DP.enemies.updateBoss(g.boss, g.level, () => rng());
    if (bev.spawn) {
      spawnHazard(bev.spawn, g.boss.girder.id, g.boss.throwX);
      DP.audio.play('throw');
    }

    // 障害物を動かす
    for (const h of g.hazards) DP.hazards.update(h, g.level, () => rng(), p);
    g.hazards = g.hazards.filter((h) => !h.dead);

    // 釘バットで割る(体に当たるより先に判定する)
    smashHazards(p);

    // 当たり判定(ジャンプ中も含めて毎ステップ行う)
    const pb = DP.player.hitbox(p);
    for (const h of g.hazards) {
      if (geo.overlaps(pb, DP.hazards.hitbox(h))) {
        killPlayer('hazard');
        return;
      }
    }
    if (geo.overlaps(pb, DP.enemies.bossHitbox(g.boss))) {
      killPlayer('boss');
      return;
    }

    // ジャンプで飛び越えたら得点(真下を通過した障害物 1 つにつき 1 回)
    if (p.state === 'air') {
      for (const h of g.hazards) {
        if (h.jumpedOver) continue;
        const below = h.y > p.y && h.y - p.y < 48;
        if (below && Math.abs(h.x - p.x) < 6) {
          h.jumpedOver = true;
          addScore(C.score.jumpOver, p.x, p.y - 34);
          DP.audio.play('score');
        }
      }
    }

    // ボーナスは時間とともに減る
    if (g.timer % C.score.bonusIntervalFrames === 0 && g.timer > 0) {
      g.bonus = Math.max(0, g.bonus - C.score.bonusStep);
    }

    // ヒロインに触れたらクリア
    if (geo.overlaps(pb, DP.enemies.heroineHitbox(g.heroine))) {
      addScore(C.score.clearBase * g.round + g.bonus);
      setState('clear', 'Oi! Oi! Oi!');
      DP.audio.play('clear');
    }
  }

  // BGM: プレイ中に釘バットを持っている間だけ流す。
  // 時間切れ・ミス(dying)・クリア・ゲームオーバーでは条件から外れて止まる。
  // 音 OFF の間は audio 側で流さず、ON に戻したときまだ持っていれば再開する
  function updateMusic() {
    const p = g.player;
    const armed = g.state === 'playing' && p && p.bat > 0 && p.state !== 'dead';
    DP.audio.setMusic(armed ? 'bat' : null);
  }

  // 1 ステップ(1/60 秒)分の更新
  function update(input) {
    g.frame++;
    g.timer++;
    if (input.wasPressed('sound')) DP.audio.toggle();

    for (const pp of g.popups) pp.t++;
    g.popups = g.popups.filter((pp) => pp.t < 60);
    for (const e of g.effects) e.t++;
    g.effects = g.effects.filter((e) => e.t < 24);
    if (g.heroine) g.heroine.anim++;

    switch (g.state) {
      case 'title':
        if (input.wasPressed('start')) newGame();
        break;
      case 'ready':
        if (g.timer >= 90) setState('playing');
        break;
      case 'playing':
        updatePlaying(input);
        break;
      case 'dying':
        if (g.timer >= C.timing.dying) {
          g.lives--;
          if (g.lives <= 0) {
            g.lives = 0;
            saveHiScore();
            setState('gameover', 'GAME OVER');
            DP.audio.play('gameover');
          } else {
            setupStage();
          }
        }
        break;
      case 'clear':
        if (g.timer >= C.timing.clearWait && input.wasPressed('start')) nextStage();
        break;
      case 'gameover':
        if (input.wasPressed('start')) newGame();
        break;
    }
    // このステップで拾った・時間切れ・ミス・クリアになった場合もすぐ反映する
    updateMusic();
  }

  return {
    data: g,
    update,
    difficulty,
    // ↓ テスト補助(test-hooks.js)からだけ使う操作
    _spawnHazard: spawnHazard,
    _setRng: (fn) => { rng = fn; },
    _killPlayer: killPlayer,
    _itemHitbox: itemHitbox,
  };
};
