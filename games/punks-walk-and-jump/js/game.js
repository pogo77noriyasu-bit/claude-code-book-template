// ゲーム進行: 状態遷移・当たり判定・ゴール・得点・制限時間・残機
// 状態: 'title' | 'ready' | 'playing' | 'dying' | 'goal' | 'clear' | 'gameover'
PW.game = (function () {
  const g = {
    state: 'title',
    timer: 0, // 今の状態になってからのステップ数
    frame: 0, // 通算ステップ
    score: 0,
    hiScore: 0,
    lives: 0,
    stage: 1,
    lanes: null,
    player: null,
    doors: [false, false, false, false, false], // 入口ごとにゴール済みか
    doorColors: [null, null, null, null, null], // 入口ごとに、入った主人公のモヒカンの色(HAIR_COLORS の名前)
    heroIndex: 0, // この面で何人目の主人公か(0 から)。入口に入るたびに 1 増える。ミスでは変わらない
    heroColor: 'green', // いまの主人公のモヒカンの色(HERO_ORDER[heroIndex])
    timeLeft: 0, // 残り時間(ステップ)
    death: null, // ミスの理由 'car' | 'water' | 'swept' | 'time' | 'wall' | 'occupied'
    lastBonus: 0, // 直前のゴールの得点(画面に一瞬出す)
    lastDoor: -1, // 直前にゴールした入口
    extendCount: 0, // 得点で 1UP した回数(新しいゲームでリセット)
    nextExtend: 0, // 次に 1UP する得点(config.extend)
    oneUpTimer: 0, // 画面に「1UP」を出している残りステップ
  };

  try {
    g.hiScore = parseInt(localStorage.getItem(PW.config.HI_KEY), 10) || 0;
  } catch (e) {
    g.hiScore = 0;
  }

  const C = () => PW.config;
  const isRiver = (row) => C().RIVER_ROWS.includes(row);
  const isRoad = (row) => C().ROAD_ROWS.includes(row);

  function setState(s) {
    g.state = s;
    g.timer = 0;
  }

  // 主人公をスタート地点へ戻し、制限時間を最初に戻す(ゴール・ミスのたび)
  function respawn() {
    PW.player.reset(g.player);
    g.timeLeft = C().TIME_LIMIT * 60;
    g.death = null;
    PW.input.clear();
  }

  // n 人目(0 から)の主人公にする。色は config の HERO_ORDER の順
  function setHero(n) {
    g.heroIndex = n;
    g.heroColor = PW.hero.colorAt(n);
  }

  // ステージを組み立てる
  function setupStage() {
    g.lanes = PW.lanes.create(g.stage);
    g.player = PW.player.create();
    g.doors = C().DOOR_COLS.map(() => false);
    g.doorColors = C().DOOR_COLS.map(() => null);
    g.lastDoor = -1;
    setHero(0); // 新しいゲームも次の面も、登場順の先頭(緑)から
    respawn();
  }

  // 新しいゲーム。stage は始める面(省略すると 1 面。DEV モードが使う)
  function newGame(stage) {
    g.score = 0;
    g.lives = C().hero.lives;
    g.extendCount = 0; // 1UP の判定をリセット
    g.nextExtend = extendAt(0);
    g.oneUpTimer = 0;
    g.stage = stage || 1;
    setupStage();
    setState('ready');
    PW.audio.play('start');
  }

  // k 回目(0 から)の 1UP の得点。at の表のあとは、最後の得点から every 点ごと(1,000 → 2,000 → 4,000 → 6,000 …)
  function extendAt(k) {
    const ex = C().extend;
    if (k < ex.at.length) return ex.at[k];
    return ex.at[ex.at.length - 1] + ex.every * (k - ex.at.length + 1);
  }

  // 得点による 1UP。次の 1UP の得点に届いていたら残機を 1 人増やし、次の得点へ進める(PUNKS QIX と同じやり方)。
  // 一度の加算で 2 つ以上の得点を超えたときは、超えた数だけ増やす(同じ得点で 2 回は増やさない)
  function checkExtend() {
    let n = 0;
    while (g.score >= g.nextExtend) {
      g.lives++;
      g.extendCount++;
      g.nextExtend = extendAt(g.extendCount);
      n++;
    }
    if (n) {
      g.oneUpTimer = C().extend.showSteps;
      PW.audio.play('oneUp'); // 一度に何人増えても音は 1 回
    }
    return n;
  }

  function addScore(n) {
    g.score += n;
    checkExtend();
    // DEV モード(URL に ?dev)のときはハイスコアを保存せず、画面の HI も変えない
    if (g.devMode) return;
    if (g.score > g.hiScore) {
      g.hiScore = g.score;
      try {
        localStorage.setItem(C().HI_KEY, String(g.hiScore));
      } catch (e) {
        /* 保存できなくても続ける */
      }
    }
  }

  // DEV モードの無敵が有効か(devMode は dev-tools.js が ?dev のときだけ立てる)
  function devInvincible() {
    return !!(g.devMode && g.devInvincible);
  }

  // ミス。reason: 'car'(車)/ 'water'(水に落ちた)/ 'swept'(流された)/ 'time'(時間切れ)/ 'wall'(入口でない所)/ 'occupied'(ゴール済みの入口)
  // 返り値: 本当にミスになったか(DEV の無敵中は false)
  function die(reason) {
    if (devInvincible()) {
      // 無敵中: 時間切れは時間を戻す、画面の外へ流されそうなら画面の中に止める、入口の行で入れなければ川の一番上へ戻す
      if (reason === 'time') g.timeLeft = C().TIME_LIMIT * 60;
      if (reason === 'swept') g.player.x = Math.min(C().WIDTH - 6, Math.max(6, g.player.x));
      if (reason === 'wall' || reason === 'occupied') g.player.row = C().RIVER_ROWS[0];
      return false;
    }
    g.death = reason;
    setState('dying');
    PW.audio.play(reason === 'car' ? 'crash' : reason === 'water' || reason === 'swept' ? 'splash' : 'crash');
    return true;
  }

  // 入口の行に着地したとき: 入口に入れたらゴール
  function reachGoalRow() {
    const p = g.player;
    const T = C().TILE;
    const i = C().DOOR_COLS.findIndex((col) => Math.abs(p.x - (col * T + T / 2)) <= C().DOOR_TOLERANCE);
    if (i < 0) return die('wall');
    if (g.doors[i]) return die('occupied');
    g.doors[i] = true;
    g.doorColors[i] = g.heroColor; // 入口のパンクスは、入ったときの色のまま
    g.lastDoor = i;
    setHero(g.heroIndex + 1); // 次にスタート地点から出るのは次の色の主人公
    const bonus = C().score.goal; // 一律(残り時間のボーナスはない)
    g.lastBonus = bonus;
    addScore(bonus);
    p.x = C().DOOR_COLS[i] * T + T / 2;
    PW.audio.play('goal');
    setState('goal');
    return true;
  }

  // 着地したときの判定
  function landed() {
    const p = g.player;
    // まだ来ていない行へ進んだら前進の得点(往復しても、その回のいちばん前の行を超えるまでは入らない)
    if (p.row < p.bestRow && p.row !== C().GOAL_ROW) {
      p.bestRow = p.row;
      addScore(C().score.forward);
    }
    if (p.row === C().GOAL_ROW) return reachGoalRow();
    return false;
  }

  // 主人公がいる場所の危険を調べる(毎ステップ)。ミスになったら true
  function checkHazards() {
    const p = g.player;
    const L = g.lanes;
    // 車: 跳んでいる途中も、いちばん近い行の車とぶつかる
    const r = Math.round(PW.player.rowF(p));
    if (isRoad(r) && PW.lanes.vehicleAt(L, r, p.x, C().hero.hitHalfWidth)) return die('car');
    // 川: 着地している間は、乗れる浮遊物がなければ水に落ちる。画面の外へ流されてもミス
    if (!p.hop && isRiver(p.row)) {
      if (p.x < 4 || p.x > C().WIDTH - 4) return die('swept');
      if (!PW.lanes.floatAt(L, p.row, p.x)) return die('water');
    }
    return false;
  }

  function updatePlaying() {
    const p = g.player;
    // 入力: 跳んでいなければ、覚えている向きへ跳ぶ
    if (!p.hop) {
      const m = PW.input.takeMove();
      if (m && PW.player.tryHop(p, m)) PW.audio.play('hop');
    }
    PW.lanes.update(g.lanes);
    if (PW.player.update(p, g.lanes) === 'landed') {
      if (landed()) return;
    }
    if (g.state !== 'playing') return;
    if (checkHazards()) return;
    // 制限時間
    if (--g.timeLeft <= 0) die('time');
  }

  // DEV モードの C キー: プレイ中ならステージをクリアしたことにする
  function devClear() {
    if (!g.devMode || g.state !== 'playing') return;
    g.doors.forEach((done, i) => {
      if (done) return;
      g.doors[i] = true;
      g.doorColors[i] = g.heroColor;
      setHero(g.heroIndex + 1);
    });
    stageClear();
  }

  function stageClear() {
    addScore(C().score.clear);
    setState('clear');
    PW.audio.play('clear');
  }

  // 1 ステップ
  function update() {
    const inp = PW.input;
    const T = C().timing;
    g.frame++;
    g.timer++;
    if (inp.consume('sound')) PW.audio.toggle();
    if (g.oneUpTimer > 0) g.oneUpTimer--; // 「1UP」の表示はどの状態でも約 1 秒で消える

    switch (g.state) {
      case 'title':
      case 'gameover':
        if (g.lanes) PW.lanes.update(g.lanes); // 背景の車と浮遊物は動かしておく
        if (inp.consume('start')) newGame();
        inp.takeMove(); // タイトルで押した向きは捨てる
        break;
      case 'ready':
        PW.lanes.update(g.lanes);
        inp.takeMove();
        if (g.timer >= T.ready) setState('playing');
        break;
      case 'playing':
        updatePlaying();
        break;
      case 'dying':
        PW.lanes.update(g.lanes);
        inp.takeMove();
        if (g.timer >= T.dying) {
          g.lives--;
          if (g.lives <= 0) {
            setState('gameover');
            PW.audio.play('over');
          } else {
            respawn();
            setState('playing');
          }
        }
        break;
      case 'goal':
        PW.lanes.update(g.lanes);
        inp.takeMove();
        if (g.timer >= T.goal) {
          if (g.doors.every(Boolean)) stageClear();
          else {
            respawn();
            setState('playing');
          }
        }
        break;
      case 'clear':
        inp.takeMove();
        if (g.timer >= T.clear) {
          g.stage++;
          setupStage();
          setState('ready');
        }
        break;
    }
    // BGM: READY とプレイ中(ゴールの間も)だけ流す
    PW.audio.setMusic(g.state === 'ready' || g.state === 'playing' || g.state === 'goal');
    inp.endStep();
  }

  // タイトル画面の背景用に、1 面のレーンを作っておく。主人公の色は登場順の先頭
  setHero(0);
  g.lanes = PW.lanes.create(1);

  return { data: g, update, newGame, setupStage, respawn, die, addScore, devClear, devInvincible };
})();
