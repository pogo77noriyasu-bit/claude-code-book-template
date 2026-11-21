// ゲームの進行(状態遷移・アイテム・当たり判定・得点・残機)
// 状態: title → ready → playing ⇄ eating(敵を倒して一瞬止まる)
//                       playing → dying → ready(残機があれば)/ gameover
//                       playing → clear → ready(次の面)
NP.game = (function () {
  const cfg = NP.config;
  const Z = NP.maze;

  const g = {
    state: 'title',
    stage: 1,
    score: 0,
    hiScore: 0,
    lives: cfg.player.lives,
    player: null,
    enemies: NP.enemies.create(),
    items: null, // items[row][col]
    badgesLeft: 0,
    badgesTotal: 0,
    wear: {}, // 着ている服 { boots: true, ... }
    powerTimer: 0, // ビールの残りステップ
    chain: 0, // いまのビールの効き目のあいだに倒した通常の敵の数(連続撃破ボーナス)
    powerTotal: 0,
    timer: 0, // 状態ごとの残りステップ
    popups: [], // 画面に出す得点 { x, y, text, t }
    lastPickup: null, // 最後に取った服の名前(画面に表示)
    pickupTimer: 0,
    t: 0, // 経過ステップ(点滅などの見た目用)
    rand: NP.enemies.rng(20261116),
    diff: null,
    devMode: false,
    devInvincible: false,
    // 乱入キャラクター(js/intruders.js)
    intruders: [],
    shots: [], // 銃弾・砲弾
    blasts: [], // 砲弾の爆風(当たり判定あり)
    booms: [], // 撃破の爆発の演出(当たり判定なし)
    intruderTimer: 0, // 次の乱入までのステップ
    shake: 0, // 画面の揺れ(戦車の撃破)
    // 得点による 1UP(追加修正⑨)
    nextExtend: cfg.extend.first, // 次に 1UP する得点
    extendCount: 0, // このゲームで 1UP した回数
    oneUpTimer: 0, // 「1UP」を表示している残りステップ
    demoT: 0, // タイトル画面のデモの経過ステップ(最終演出①)
    inter: null, // ブレイク演出(最終演出②)の { type: 車両, t: 経過ステップ, next: 終わったら始める面 }
  };

  try {
    g.hiScore = Number(localStorage.getItem(cfg.HI_KEY)) || 0;
  } catch (e) {
    /* 保存できない環境では 0 から */
  }

  // 表から stage 面の値を読む(表より先の面は最後の値)
  const pick = (table, stage) => table[Math.min(stage, table.length) - 1];
  function difficulty(stage) {
    return { playerSpeed: pick(cfg.stage.playerSpeed, stage), enemySpeed: pick(cfg.stage.enemySpeed, stage), powerSteps: Math.round(cfg.power.steps * pick(cfg.stage.powerSteps, stage)) };
  }

  function newGame(stage) {
    g.score = 0;
    g.lives = cfg.player.lives;
    g.nextExtend = cfg.extend.first;
    g.extendCount = 0;
    g.oneUpTimer = 0;
    g.rand = NP.enemies.rng(20261116 + (stage || 1));
    startStage(stage || 1);
    NP.audio.play('start');
  }

  // 面の始め: アイテムを並べ直し、服をすべて脱いだ状態に戻す
  function startStage(stage) {
    g.stage = stage;
    g.diff = difficulty(stage);
    const m = Z.createItems();
    g.items = m.items;
    g.badgesLeft = m.badges;
    g.badgesTotal = m.badges;
    g.start = m.start;
    g.wear = {};
    resetRound(true);
  }

  // ミスのあと・面の始め(newStage): 主人公と敵を初期位置へ(集めた服・アイテムはそのまま)。
  // 乱入キャラクターは消すが、出現タイマーは面の始めだけ戻す(ミスのあとは残り時間を引き継ぐ)
  function resetRound(newStage) {
    g.player = NP.player.create(g.start.col, g.start.row);
    NP.enemies.reset(g.enemies);
    NP.intruders.reset(g, !!newStage);
    g.powerTimer = 0;
    g.chain = 0;
    g.popups = [];
    g.state = 'ready';
    g.timer = cfg.timing.ready;
    NP.input.clear();
  }

  function addScore(n) {
    g.score += n;
    checkExtend();
    // DEV モードのあいだはハイスコアを記録しない
    if (g.devMode) return;
    if (g.score > g.hiScore) {
      g.hiScore = g.score;
      try {
        localStorage.setItem(cfg.HI_KEY, String(g.hiScore));
      } catch (e) {
        /* 保存できなくても続ける */
      }
    }
  }

  // 得点による 1UP: 次の 1UP の得点を超えた数だけ残機を増やす(一度に大きく得点しても取りこぼさない)。
  // 超えるたびに次の得点を every 点先へ進めるので、同じ得点で 2 回は増えない
  function checkExtend() {
    let gained = 0;
    while (g.score >= g.nextExtend) {
      g.lives++;
      g.extendCount++;
      g.nextExtend += cfg.extend.every;
      gained++;
    }
    if (gained) {
      g.oneUpTimer = cfg.extend.showSteps;
      NP.audio.play('oneUp'); // 一度に複数でも音は 1 回
    }
  }

  const devInvincible = () => g.devMode && g.devInvincible;
  const clothesCount = () => cfg.CLOTHES.filter((c) => g.wear[c]).length;
  const isCleared = () => g.badgesLeft === 0 && clothesCount() === cfg.CLOTHES.length;

  // 主人公がマスの中心の近くまで来たら、そのマスのアイテムを取る
  function collect() {
    const p = g.player;
    const col = Z.colOf(p.x);
    const row = Z.rowOf(p.y);
    const it = g.items[row] && g.items[row][col];
    if (!it) return;
    if (Math.abs(Z.dx(p.x, Z.centerX(col))) > 5 || Math.abs(p.y - Z.centerY(row)) > 5) return;
    g.items[row][col] = null;
    if (it === 'badge') {
      g.badgesLeft--;
      addScore(cfg.score.badge);
      NP.audio.play('badge');
    } else if (it === 'beer') {
      addScore(cfg.score.beer);
      g.powerTimer = g.diff.powerSteps;
      g.powerTotal = g.diff.powerSteps;
      g.chain = 0; // 次のビールで連続撃破の数え直し
      NP.enemies.frighten(g.enemies);
      NP.audio.play('power');
    } else if (it.startsWith('clothes:')) {
      const name = it.slice(8);
      g.wear[name] = true;
      addScore(cfg.score.clothes);
      g.popups.push({ x: p.x, y: p.y, text: String(cfg.score.clothes), t: 50, life: 50 });
      g.lastPickup = name;
      g.pickupTimer = 90;
      NP.audio.play('clothes');
    }
  }

  // 服 5 つと缶バッジをすべて取ったらステージクリア(ビールは残っていてもよい)
  function checkClear() {
    if (!isCleared()) return;
    g.state = 'clear';
    g.timer = cfg.timing.clear;
    NP.audio.play('clear');
  }

  // 主人公と敵の当たり判定
  function collide() {
    const p = g.player;
    for (const e of g.enemies) {
      if (e.state !== 'active') continue;
      if (Math.hypot(Z.dx(p.x, e.x), e.y - p.y) >= cfg.enemy.hitDist) continue;
      if (e.fright) {
        // パワーアップ中: 敵を倒す。交番へ戻り、しばらくして出てくる
        // 連続撃破ボーナス: 100 → 200 → 400 → 800(4 人目以降は 800)
        const table = cfg.score.enemyChain;
        const pts = table[Math.min(g.chain, table.length - 1)];
        g.chain++;
        addScore(pts);
        g.popups.push({ x: e.x, y: e.y, text: String(pts), t: 60, life: 60 });
        NP.enemies.arrest(e);
        NP.audio.play('defeat');
        g.state = 'eating';
        g.timer = cfg.timing.eat;
        return;
      }
      if (devInvincible()) continue;
      g.state = 'dying';
      g.timer = cfg.timing.dying;
      NP.audio.play('miss');
      return;
    }
  }

  // 乱入キャラクターとの当たり判定。ビール中は触れた車両を撃破し、弾・爆風ではダメージを受けない。
  // ふだんは車体・銃弾・砲弾・爆風のどれに当たってもミス
  function collideIntruders() {
    const h = NP.intruders.hits(g);
    if (g.powerTimer > 0) {
      for (const v of h.body) {
        addScore(v.def.score); // 連続撃破ボーナスとは別に数える
        NP.intruders.destroy(g, v);
      }
      return;
    }
    if (devInvincible()) return;
    if (h.body.length || h.shot || h.blast) {
      g.state = 'dying';
      g.timer = cfg.timing.dying;
      NP.audio.play('miss');
    }
  }

  function updatePlaying() {
    const p = g.player;
    const dir = NP.input.dir();
    if (dir) p.want = dir;
    NP.player.update(p, (g.powerTimer > 0 ? cfg.player.powerSpeed : cfg.player.speed) * g.diff.playerSpeed);
    collect();
    checkClear();
    if (g.state !== 'playing') return;
    collide();
    if (g.state !== 'playing') return;
    for (const e of g.enemies) NP.enemies.update(e, g);
    collide();
    if (g.state !== 'playing') return;
    NP.intruders.update(g);
    collideIntruders();
    if (g.powerTimer > 0) {
      g.powerTimer--;
      if (g.powerTimer === 0) {
        for (const e of g.enemies) e.fright = false;
        g.chain = 0; // 効き目が切れたら連続撃破の数え直し
      }
    }
  }

  function update() {
    g.t++;
    if (NP.input.consume('sound')) NP.audio.toggle();
    const start = NP.input.consume('start');
    for (const pp of g.popups) pp.t--;
    g.popups = g.popups.filter((pp) => pp.t > 0);
    if (g.pickupTimer > 0) g.pickupTimer--;
    if (g.oneUpTimer > 0) g.oneUpTimer--;
    NP.intruders.updateEffects(g);

    switch (g.state) {
      case 'title':
        // デモはずっとくり返す(js/demo.js)。途中でも ENTER(タップ)で始められる
        g.demoT = (g.demoT + 1) % NP.demo.D.total;
        // デモで缶バッジを拾った音(本編と同じ効果音。得点には入れない)。音はブラウザの制限でキー入力・タッチのあとから鳴る
        for (const name of NP.demo.frame(g.demoT).sounds) NP.audio.play(name);
        if (start) newGame(1);
        break;
      case 'intermission':
        updateIntermission();
        break;
      case 'ready':
        if (--g.timer <= 0) g.state = 'playing';
        break;
      case 'playing':
        updatePlaying();
        break;
      case 'eating':
        if (--g.timer <= 0) g.state = 'playing';
        break;
      case 'dying':
        if (--g.timer <= 0) {
          g.lives--;
          if (g.lives <= 0) {
            g.state = 'gameover';
            g.timer = 60;
            NP.audio.play('over');
          } else resetRound();
        }
        break;
      case 'clear':
        if (--g.timer <= 0) {
          // 3 面ごとにブレイク演出をはさむ(得点・残機・タイマーには関係しない)
          const type = NP.intermission.typeAfter(g.stage);
          if (type) startIntermission(type, g.stage + 1);
          else startStage(g.stage + 1);
        }
        break;
      case 'gameover':
        if (g.timer > 0) g.timer--;
        else if (start) newGame(1);
        break;
    }
    NP.audio.setMusic(g.state === 'ready' || g.state === 'playing' || g.state === 'eating');
    NP.audio.setJingle(g.state === 'intermission'); // ブレイク演出の専用 BGM
    // 乱入キャラクターの巡回音(追加修正⑦): プレイ中(と敵を倒した直後の停止)に、退場中でない車両がいるときだけ。
    // 退場・撃破(車両が消える)・ミス・ステージ終了・ゲームオーバーでは止まる
    const car = g.intruders.find((v) => v.state !== 'exit');
    let vehicle = (g.state === 'playing' || g.state === 'eating') && car ? car.type : null;
    // ブレイク演出: 車両が画面にいるあいだは、その車両の巡回音
    if (g.state === 'intermission') {
      const f = NP.intermission.frame(g.inter.t, g.inter.type);
      vehicle = f.car && f.car.x > -30 ? g.inter.type : null;
    }
    NP.audio.setVehicle(vehicle);
    NP.input.endStep();
  }

  // ---- ブレイク演出(最終演出②) ----
  // 乱入キャラクター・弾・爆風を消してから始める。終わったら面 next を始める
  function startIntermission(type, next) {
    g.state = 'intermission';
    g.inter = { type, t: 0, next };
    g.intruders = [];
    g.shots = [];
    g.blasts = [];
    g.popups = [];
    g.powerTimer = 0;
  }

  function updateIntermission() {
    const it = g.inter;
    it.t++;
    const f = NP.intermission.frame(it.t, it.type);
    // このステップの音: 車両の登場音・攻撃準備音・発射音・着弾音・ビールのパワーアップ音・逃げ出すときの音(本編と同じ音)
    for (const name of f.sounds) NP.audio.play(name);
    if (f.done) {
      g.inter = null;
      startStage(it.next);
    }
  }

  // DEV モード: ブレイク演出を見る(type の車両。終わったら今の面を最初から)
  function devIntermission(type) {
    if (g.state === 'title') return;
    startIntermission(type, g.stage);
  }

  // DEV モード: 強制クリア(プレイ中・READY のとき)
  function devClear() {
    if (g.state !== 'playing' && g.state !== 'ready') return;
    for (const row of g.items) for (let c = 0; c < row.length; c++) if (row[c] === 'badge' || (row[c] && row[c].startsWith('clothes:'))) row[c] = null;
    g.badgesLeft = 0;
    for (const c of cfg.CLOTHES) g.wear[c] = true;
    g.state = 'clear';
    g.timer = cfg.timing.clear;
    NP.audio.play('clear');
  }

  // DEV モード: 種類 type の乱入キャラクターをすぐ出す(いまいる車両と弾は消す。面によらずどの種類でも)
  function devSpawn(type) {
    if (g.state !== 'playing' && g.state !== 'ready') return;
    g.intruders = [];
    g.shots = [];
    g.blasts = [];
    NP.intruders.spawn(g, type);
    g.intruderTimer = NP.intruders.intervalOf(type);
  }

  return { data: g, devSpawn, devIntermission, update, newGame, startStage, resetRound, addScore, devClear, clothesCount, isCleared, difficulty };
})();
