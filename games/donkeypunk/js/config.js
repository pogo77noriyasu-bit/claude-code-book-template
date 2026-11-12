// ドンキーパンク — 共通設定
// すべてのファイルはグローバルの名前空間 DP にぶら下げる。
// (ES モジュールは file:// で開くと動かないため、素の <script> で順番に読み込む)
window.DP = window.DP || {};

DP.config = {
  // 論理解像度(キャンバスの内部サイズ)。CSS で拡大表示する
  WIDTH: 480,
  HEIGHT: 560,
  // 物理は 1 秒 60 回の固定ステップ。速度の単位は「px / ステップ」
  STEP_MS: 1000 / 60,

  // ドット絵の 1 ドットの大きさ(論理 px)
  PIXEL: 2,

  // 鉄骨の厚み
  GIRDER_THICKNESS: 8,

  player: {
    // 当たり判定(見た目 24x32 より少し小さめ)
    width: 14,
    height: 26,
    walkSpeed: 1.4,
    climbSpeed: 1.1,
    jumpVelocity: 4.2, // 上向きの初速(最高到達点は約 40px)
    gravity: 0.22,
    maxFallSpeed: 6,
    // この高さ以上を落下するとミス(段差からの転落)
    fatalFall: 48,
    // ハシゴをつかめる横方向のずれ
    ladderGrab: 6,
    // 足音の間隔(ステップ数)。歩きアニメ(6 ステップで足が入れ替わる)の 2 コマ分
    stepInterval: 12,
  },

  // 途中で切れているハシゴ(ステージデータで broken: true)
  brokenLadder: {
    // 登れる部分の上端を「上の段の上面 + この値」にする。
    // 鉄骨の厚み 8px + 主人公のドット絵の高さ 32px + すき間 4px なので、頭も見た目も上の段に届かない
    headroom: 44,
    // 上の段からぶら下がっている切れ端の長さ(見た目だけ。つかまれない)。鉄骨の厚み 8px の下に 16px 見える
    stub: 24,
  },

  hazard: {
    // 障害物の種類ごとの性質。見た目で区別できるよう大きさと速さも変える
    bottle: { width: 18, height: 9, speed: 1.5 },
    can: { width: 12, height: 12, speed: 1.15 },
    gravity: 0.22,
    maxFallSpeed: 5,
    ladderSpeed: 1.0,
    // ハシゴの上を通ったときに降りてくる確率
    ladderChance: 0.25,
  },

  // クリア後の逃走演出(速さは px/ステップ、長さはステップ数)
  escape: {
    walkSpeed: 1.2, // ガールの下へ歩く
    reachFrames: 30, // 腕を振り上げてガールを引き寄せる
    liftFrames: 18, // 担ぎ上げる
    struggleFrames: 60, // ガールがジタバタ
    carrySpeed: 1.0, // 担いでハシゴへ歩く
    climbSpeed: 1.0, // ハシゴを登る
  },

  // 釘バット(取ると一定時間ビールを叩き割れる)
  bat: {
    duration: 600, // 使える時間(ステップ)。10 秒
    warnAt: 180, // 残りがこれ以下になると点滅・警告音(3 秒)
    swingHalf: 8, // 上・下それぞれの姿勢を続けるステップ数
    // 置き場所の高さ: アイテムの下端を鉄骨の上面からこれだけ浮かせる。
    // 立っているときの頭(player.height = 26px)より上で、ジャンプ(最高点 約 40px)なら届く高さ
    itemFloat: 34,
    // 取得判定の大きさ(x は中心、y は下端)。ドット絵 batSide(18x9 ドット)× PIXEL(2)と同じにして、
    // 見た目と当たり判定を一致させる
    itemWidth: 36,
    itemHeight: 18,
  },

  score: {
    jumpOver: 100,
    smash: 300, // 釘バットでビールを割ったとき
    clearBase: 1000,
    bonusStart: 5000,
    bonusStep: 100,
    bonusIntervalFrames: 120, // 2 秒ごとにボーナスが減る
  },

  lives: 3,

  // 状態ごとの演出時間(ステップ数)
  timing: {
    dying: 120,
    clearWait: 150, // この時間が過ぎたら ENTER で次へ進める
  },

  storageKeys: {
    highScore: 'pachiDonkey.highScore',
    sound: 'pachiDonkey.sound',
  },
};
