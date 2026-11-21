// ゲーム進行: 状態遷移・得点・残機・当たり判定のまとめ
// 状態: 'title' | 'ready' | 'playing' | 'dying' | 'clear' | 'gameover'
PQ.game = (function () {
  const g = {
    state: 'title',
    timer: 0, // 今の状態になってからのステップ数
    frame: 0, // 通算ステップ
    score: 0,
    hiScore: 0,
    lives: 0,
    stage: 1,
    field: null,
    player: null,
    crowd: null, // 1 つ目の群衆(crowds[0]。1〜8 面は群衆がこれだけ)
    crowds: [], // その面のすべての群衆(9 面以降は 2 つ)
    seed: 12345, // 群衆の乱数の種(ステージごとに変える)
    lastGain: 0, // 直前に獲得した割合(%)。画面に一瞬出す
    gainTimer: 0,
    clearBonus: 0,
    nextExtend: 0, // 次に 1UP する得点(config.extend。新しいゲームでリセット)
    oneUpTimer: 0, // 画面に「1UP」を出している残りステップ
    drawTick: 0,
  };

  try {
    g.hiScore = parseInt(localStorage.getItem(PQ.config.HI_KEY), 10) || 0;
  } catch (e) {
    g.hiScore = 0;
  }

  function setState(s) {
    g.state = s;
    g.timer = 0;
  }

  // ステージを組み立てる(フィールド・主人公・群衆を初期状態に)
  function setupStage() {
    g.field = PQ.field.create();
    g.player = PQ.player.create(g.field);
    // 群衆の数は面で決まる(config.crowd.stageGroups)。群衆ごとに乱数の種を変えて独立して動かす
    // (1 つ目の種は以前と同じなので、1〜8 面の群衆は以前とまったく同じ動きになる)
    const groups = PQ.crowd.groupsFor(g.stage);
    g.crowds = [];
    for (let k = 0; k < groups; k++) {
      g.crowds.push(PQ.crowd.create(g.field, g.stage, g.seed + g.stage * 7919 + k * 104729, k, groups));
    }
    g.crowd = g.crowds[0];
    g.lastGain = 0;
    g.gainTimer = 0;
  }

  // 新しいゲームを始める。stage は始める面(省略すると 1 面。DEV モードの 1〜9 キー・URL の stage が使う)
  function newGame(stage) {
    g.score = 0;
    g.lives = PQ.config.player.lives;
    g.nextExtend = PQ.config.extend.first; // 1UP の判定をリセット
    g.oneUpTimer = 0;
    g.stage = stage || 1;
    setupStage();
    setState('ready');
    PQ.audio.play('start');
  }

  function addScore(n) {
    g.score += n;
    checkExtend();
    // DEV モード(URL に ?dev。js/dev-tools.js)のときはハイスコアを保存せず、画面の HI も変えない。
    // 面の指定や無敵で出した得点を、通常のハイスコア(今後のランキングも)に記録しないため
    if (g.devMode) return;
    if (g.score > g.hiScore) {
      g.hiScore = g.score;
      try {
        localStorage.setItem(PQ.config.HI_KEY, String(g.hiScore));
      } catch (e) {
        /* 保存できなくても続ける */
      }
    }
  }

  // 得点による 1UP。次の 1UP の得点に届いていたら残機を 1 人増やし、次の得点(+ every)へ進める。
  // 一度の加算で 2 つ以上の得点を超えたときは、超えた数だけ増やす(同じ得点で 2 回は増やさない)
  function checkExtend() {
    const ex = PQ.config.extend;
    let n = 0;
    while (g.nextExtend > 0 && g.score >= g.nextExtend) {
      g.lives++;
      g.nextExtend += ex.every;
      n++;
    }
    if (n) {
      g.oneUpTimer = ex.showSteps;
      PQ.audio.play('oneUp'); // 一度に何人増えても音は 1 回
    }
    return n;
  }

  function percent() {
    return g.field ? PQ.field.percent(g.field) : 0;
  }

  // 陣地の確定
  function closeArea() {
    const p = g.player;
    const before = percent();
    // どの群衆からも届かない未獲得の領域だけを獲得する(群衆ごとの起点を渡す)
    PQ.field.close(g.field, p.trail, g.crowds.map((c) => PQ.crowd.seeds(c)));
    p.drawing = false;
    p.trail = [];
    // 着いたマスのまわりがまとめて獲得されると、主人公が獲得済みの内側に埋もれて動けなくなるので、
    // いちばん近い境界線へ移す(複数の陣地の境界が交わる場所で起きていた不具合の修正)
    PQ.player.snapToEdge(p, g.field);
    for (const c of g.crowds) PQ.crowd.evacuate(c, g.field);
    const gain = percent() - before;
    g.lastGain = gain;
    g.gainTimer = 90;
    addScore(Math.round(gain * PQ.config.score.perPercent));
    PQ.audio.play('capture');
    if (percent() >= PQ.config.CLEAR_PERCENT) {
      g.clearBonus = Math.floor(percent() - PQ.config.CLEAR_PERCENT) * PQ.config.score.clearBonusPerPercent;
      addScore(g.clearBonus);
      setState('clear');
      PQ.audio.play('clear');
    }
  }

  // DEV モードの無敵が有効か。devMode は dev-tools.js が URL に ?dev があるときだけ立てるので、通常プレイでは必ず false
  function devInvincible() {
    return !!(g.devMode && g.devInvincible);
  }

  // DEV モードの C キー: プレイ中ならクリアしたことにする(ボーナスなし。クリアの演出のあと次の面へ)
  function devClear() {
    if (!g.devMode || g.state !== 'playing') return;
    const p = g.player;
    if (p.drawing) PQ.player.resetTrail(p, g.field);
    g.clearBonus = 0;
    setState('clear');
    PQ.audio.play('clear');
  }

  function miss() {
    setState('dying');
    PQ.audio.play('miss');
  }

  function updatePlaying() {
    const inp = PQ.input;
    const p = g.player;
    const events = PQ.player.update(p, g.field, inp.dirs(), inp.isHeld('draw'));
    for (const ev of events) {
      if (ev === 'trail' || ev === 'start') {
        if (++g.drawTick % 3 === 0) PQ.audio.play('draw');
      }
      if (ev === 'close') closeArea();
    }
    if (g.state !== 'playing') return;

    // 群衆を動かし(群衆ごとに独立)、どれかが描画中の線・線を引いている主人公に触れたらミス
    for (const cr of g.crowds) {
      if (g.crowdFrozen) cr.hit = false; // テスト補助で止めているとき
      else PQ.crowd.update(cr, g.field);
    }
    if (p.drawing) {
      const c = PQ.player.center(p);
      const r = PQ.config.player.hitRadius;
      const touched = g.crowds.some((cr) => cr.hit || PQ.crowd.touchesPoint(cr, c.x, c.y, r));
      if (touched && !devInvincible()) miss(); // DEV モードの無敵中はミスにしない(通常プレイでは常にミスの判定どおり)
    }
    if (g.gainTimer > 0) g.gainTimer--;
  }

  // 1 ステップ
  function update() {
    const inp = PQ.input;
    const T = PQ.config.timing;
    g.frame++;
    g.timer++;
    if (g.oneUpTimer > 0) g.oneUpTimer--; // 「1UP」の表示はどの状態でも約 1 秒で消える
    if (inp.consume('sound')) PQ.audio.toggle();

    switch (g.state) {
      case 'title':
      case 'gameover':
        if (inp.consume('start')) newGame();
        break;
      case 'ready':
        if (g.timer >= T.ready) setState('playing');
        break;
      case 'playing':
        updatePlaying();
        break;
      case 'dying':
        if (g.timer >= T.dying) {
          // 描画中の線を消して、引き始めた場所から再開(獲得済みの陣地は残る)
          PQ.player.resetTrail(g.player, g.field);
          g.lives--;
          if (g.lives <= 0) {
            setState('gameover');
            PQ.audio.play('over');
          } else {
            setState('ready');
          }
        }
        break;
      case 'clear':
        if (g.timer >= T.clear) {
          g.stage++;
          setupStage();
          setState('ready');
        }
        break;
    }
    // BGM: READY とプレイ中だけ流す(ミス・クリア・ゲームオーバー・タイトルでは止める)
    PQ.audio.setMusic(g.state === 'ready' || g.state === 'playing');
    inp.endStep();
  }

  return { data: g, update, newGame, setupStage, closeArea, percent, miss, devClear, devInvincible, addScore };
})();
