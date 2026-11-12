// ゲーム全体の進行(状態遷移・スコア・残機・当たり判定のまとめ)
// 状態: 'title' | 'ready' | 'playing' | 'escape'(クリア後の逃走演出) | 'clear' | 'dying' | 'gameover'
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
    enemies: [], // 敵(2 面のファイヤースカルなど)。動きは仕掛け、当たり判定と撃破はここで共通に行う
    skullsEnabled: true, // テスト用にファイヤースカルの出現を止められるようにしている
    escape: null, // クリア後の逃走演出(DP.escape)。演出中だけ使う
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
    g.enemies = [];
    // アイテムはステージのデータから毎回置き直す(ミスすると元の場所に戻る)。
    // 鉄骨から少し浮かせて置き、y はアイテムの下端
    g.items = (stage.items || []).map((it) => {
      const gd = g.level.byId[it.girder];
      return { type: it.type, x: it.x, y: geo.surfaceY(gd, it.x) - C.bat.itemFloat, taken: false };
    });
    g.effects = [];
    g.popups = [];
    g.escape = null;
    g.bonus = C.score.bonusStart;
    g.deathReason = null;
    setState('ready', stage.name);
  }

  // stageIndex: 始める面(0 = 1 面)。通常は 0。開発用ショートカットだけが別の面を指定する
  function newGame(stageIndex) {
    g.score = 0;
    g.lives = C.lives;
    g.round = 1;
    g.stageIndex = stageIndex || 0;
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

  // ミスの演出の長さ(ステップ数)
  function dyingFrames(reason) {
    const by = C.timing.dyingByReason || {};
    return by[reason] || C.timing.dying;
  }

  // 主人公をミスにする。reason: 'fall' | 'hazard' | 'boss' | 'burn'(炎上。爆音アンプ・将来のファイヤースカル)。
  // すでにミスしているときは何もしない(残機が二重に減らない)
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
    // 敵(ファイヤースカル)も釘バットで倒せる。ドクロが砕けて炎が消える演出(effects の type: 'skull')
    for (const e of g.enemies) {
      if (e.state === 'emerge' || e.state === 'spawn') continue; // まだ炎の中(姿を現していない)
      if (e.dead || !geo.overlaps(bb, DP.skulls.hitbox(e))) continue;
      e.dead = true;
      g.effects.push({ x: e.x, y: e.y - 8, t: 0, type: e.type });
      addScore(C.score.skull, e.x, e.y - 24);
      DP.audio.play('smash');
    }
    g.enemies = g.enemies.filter((e) => !e.dead);
  }

  // クリア後の逃走演出を始める。通常プレイの処理はここで止める
  // (演出中は updatePlaying を呼ばないので、操作・障害物・当たり判定・ボーナス減少も止まる)
  function startEscape() {
    const p = g.player;
    g.hazards = []; // 残っているビールは片付ける
    g.enemies = []; // 敵も片付ける
    p.bat = 0; // 釘バットは手放す(BGM は updateMusic の条件から外れて止まる)
    p.batTime = 0;
    p.walkTime = 0;
    g.boss.state = 'idle';
    g.boss.holding = null;
    g.escape = DP.escape.create(g.level, g.boss, g.heroine);
    setState('escape');
    // BGM はその場で止める(開発用ショートカットのように update の外から呼ばれても止まるように)
    updateMusic();
  }

  function updateEscape() {
    const done = DP.escape.update(g.escape);
    if (g.escape.sound) DP.audio.play(g.escape.sound, g.escape.soundArg);
    if (done) {
      // 2 人とも画面の上へ消えた。いつものクリア表示へ
      g.boss.gone = true;
      g.heroine.gone = true;
      setState('clear', 'Oi! Oi! Oi!');
      DP.audio.play('clear');
    }
  }

  // ステージデータの mechanics に書かれた仕掛けを順に動かす(js/mechanics.js)
  const mechanicsCtx = {
    g,
    rng: () => rng(),
    spawnHazard: (type, girderId, x) => spawnHazard(type, girderId, x),
    audio: DP.audio,
    killPlayer: (reason) => killPlayer(reason),
  };
  function updateMechanics() {
    const names = g.level.stage.mechanics || [];
    for (const name of names) DP.mechanics[name].update(mechanicsCtx);
    // ゴリラを動かす仕掛けがない面でも、待機アニメ(ときどき腕を上げる)は進める
    if (!names.includes('beerThrow')) DP.enemies.idleBoss(g.boss);
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

    // ステージごとの仕掛け(1 面はゴリラ警官のビール投下、2 面はコンベアと爆音アンプ)
    updateMechanics();
    if (g.state !== 'playing') return; // 仕掛けでミスになった(アンプで炎上など)

    // 障害物を動かす
    for (const h of g.hazards) DP.hazards.update(h, g.level, () => rng(), p);
    g.hazards = g.hazards.filter((h) => !h.dead);

    // 釘バットで割る(体に当たるより先に判定する)
    smashHazards(p);

    // 当たり判定(ジャンプ中も含めて毎ステップ行う)
    const pb = DP.player.hitbox(p);
    for (const h of g.hazards) {
      if (geo.overlaps(pb, DP.hazards.hitbox(h))) {
        // burns の付いた障害物(将来のファイヤースカルなど)は炎上のミス
        killPlayer(h.burns ? 'burn' : 'hazard');
        return;
      }
    }
    // 敵(ファイヤースカル)。出現・飛び出しの間は当たらない。burns なら炎上のミス
    for (const e of g.enemies) {
      if (DP.skulls.isHarmless(e)) continue;
      if (geo.overlaps(pb, DP.skulls.hitbox(e))) {
        killPlayer(e.burns ? 'burn' : 'hazard');
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

    // ヒロインに触れたらクリア。得点を足して、逃走演出へ
    if (geo.overlaps(pb, DP.enemies.heroineHitbox(g.heroine))) {
      addScore(C.score.clearBase * g.round + g.bonus);
      startEscape();
    }
  }

  // BGM: ゲーム開始(各面・ミス後の READY)から通常の BGM('main'。全ステージ・全周回で共通の 1 曲)をループで流し、
  // 釘バットを持っている間は釘バットの BGM('bat')を優先する。釘バットの時間切れで通常の BGM に戻る(頭から)。
  // ミス(dying。ミスのジングルを聞かせる)・クリア(逃走演出の音とクリアジングル)・ゲームオーバー・タイトルでは止める。
  // 面が変わるときは逃走演出で一度止まり、次の面の READY で頭から流し直すので、2 曲が重なることはない。
  // 音 OFF の間は audio 側で流さず、ON に戻すと今の状態の BGM を再開する
  function updateMusic() {
    const p = g.player;
    if (g.state === 'ready') return DP.audio.setMusic('main');
    if (g.state !== 'playing' || !p || p.state === 'dead') return DP.audio.setMusic(null);
    DP.audio.setMusic(p.bat > 0 ? 'bat' : 'main');
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
      case 'escape':
        updateEscape();
        break;
      case 'dying':
        // ミスの演出の長さは理由ごと(炎上は約 1 秒、それ以外は従来どおり)。
        // 終わったら 1 回だけ残機を減らす(この状態の間に主人公がもう一度ミスになることはない)
        if (g.timer >= dyingFrames(g.deathReason)) {
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
    // 開発用ショートカット(dev-tools.js)から: プレイ中ならクリアしたことにして逃走演出を始める
    // 開発用ショートカット / テスト補助から: 指定の面(0 始まり)から新しいゲームを始める
    _startStage: (index) => {
      if (index < 0 || index >= DP.stages.length) return false;
      newGame(index);
      return true;
    },
    _devClear: () => {
      if (g.state !== 'playing') return false;
      addScore(C.score.clearBase * g.round + g.bonus);
      startEscape();
      return true;
    },
    _itemHitbox: itemHitbox,
  };
};
