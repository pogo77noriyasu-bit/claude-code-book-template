# きこりのモク太 設計書

`games/kikori-mokuta/index.html`、`main.js`、`SPEC.md` を読んで作成した設計書です。ゲームの「仕様」は `SPEC.md` にあります。この文書は、それを実現するコードの構造をまとめたものです。

- 実際のソースコードにある関数名・変数名・定数名だけを記載しています。
- 括弧内の `main.js:数値` は行番号の目安です。コードを編集すると、ずれます。
- コードから判断できない点は「要確認」と明記しています。
- 速度の単位は px/秒、時間の単位は秒です。

---

## 1. システム全体構成

- ブラウザ上で動く単体のクライアントアプリです。サーバー、ビルド、外部ライブラリ、画像・音声ファイルはありません。
- 構成は HTML 1 ファイルと JavaScript 1 ファイルです。`index.html` が `<script src="main.js"></script>` で `main.js` を読み込みます(モジュールは使っていません)。
- 描画は `<canvas id="game" width="640" height="480">` の 2D コンテキスト(`ctx`)に行います。
- 効果音は Web Audio API で合成します。
- 永続化は `localStorage`(ハイスコアと効果音設定)だけです。
- ゲームは次の流れで動きます。入力イベントがグローバル変数(`state`、`keys`、`player` など)を書き換えます。`requestAnimationFrame` のループが、毎フレーム `update(dt)` と `draw()` を呼びます。

```
 入力イベント(keydown / keyup / pointerdown / click / visibilitychange)
        │  keys・state・player を書き換え / chop() を呼ぶ
        ▼
 グローバル状態(state, player, trees, enemies, branches, birds, drops, ...)
        ▲                                   │
        │ update(dt)                        │ draw()
        └──────────── loop(now) ◄───────────┘  requestAnimationFrame
```

---

## 2. ファイル構成と役割

| ファイル | 役割 |
| --- | --- |
| `index.html` | ページのレイアウトと CSS、`<canvas id="game">`、タッチ用ボタン(`.pad`)、効果音ボタン(`#sound-toggle`)、操作説明文(`.bar`)。 |
| `main.js` | ゲーム全体のロジックと描画(1044 行)。 |
| `SPEC.md` | 仕様書。 |
| `CLAUDE.md` | このプロジェクト専用の開発ガイド。 |

### 2.1 `index.html` のうち JavaScript と関係する要素

| 要素 | 使われ方 |
| --- | --- |
| `#game`(`<canvas>`) | `main.js` 冒頭で `document.getElementById('game')` として取得。`W`、`H` は `canvas.width`、`canvas.height` から取る。 |
| `.pad button[data-key]` | `data-key` は `left` / `down` / `right` / `axe`。`main.js` が `btn.dataset.key` で読む。 |
| `#sound-toggle` | `soundButton` として取得。文言の更新と click 処理は `main.js` が行う。 |
| `.bar` の `<span>` | 静的な操作説明文。JavaScript からは触らない。 |

CSS で `canvas` の表示幅を `min(640px, 100%, calc((100vh - 200px) * 4 / 3))` にして縮小表示します。内部解像度は 640×480 のままなので、`main.js` の座標系は変わりません。`@media (hover: hover) and (pointer: fine)` では `.pad` を非表示にします。

### 2.2 `main.js` の節構成

ファイルは `// ====` のコメントで次の節に分かれています。上から順に並んでいます。

| 節 | 内容 |
| --- | --- |
| 設定 | `canvas`、`ctx`、`W`、`H` と、ゲーム定数 |
| 状態 | `state` などのグローバル変数、`player`、`keys` |
| 保存 | `loadStorage()`、`saveStorage()`、`addScore()` |
| 効果音 | `tone()`、`melody()`、`SOUNDS`、`playSound()`、効果音ボタンの処理 |
| 初期化・状態遷移 | `resetGame()`、`setupStage()`、`resetActors()`、`launch()`、`togglePause()` |
| 入力 | `KEYMAP`、各種イベントリスナー、`pressAction()` |
| 行動(オノ) | `treeInFront()`、`chop()`、`killEnemy()` |
| 生成 | `spawnEnemy()`、`spawnBranch()`、`spawnBird()`、`burst()` |
| 更新 | `update()` と `update*()` 系、`touchesPlayer()`、`miss()` |
| 描画 | `draw()` と `draw*()` 系 |
| ループ | `loop()`、起動処理 |

`addScore()` は節としては「保存」にあります。得点の加算とハイスコアの保存を一緒に行うためです。

---

## 3. ゲームの初期化・実行・終了までの処理フロー

### 3.1 ページ読み込み時(`main.js` の評価順)

1. `canvas`、`ctx`、`W`、`H`、各種定数を定義する。
2. 状態変数を初期化する。`highScore` は `loadStorage(KEY_HIGH, '0')`、`soundOn` は `loadStorage(KEY_SOUND, 'on') !== 'off'` で復元する。`state` は `'ready'`。
3. 入力イベントリスナーを登録し、効果音ボタンの文言を `updateSoundButton()` で更新する。
4. 末尾で `setupStage()` を呼ぶ(`main.js:1043`)。タイトル画面の背景に木が表示されるようにするためと思われる(コメントなし)。
5. `requestAnimationFrame(loop)` でループを開始する。

`loadStorage()` を使う `let highScore` の宣言(46 行目)は、関数宣言(78 行目)より前にあります。関数宣言は巻き上げられるため動作します。

### 3.2 状態遷移

`state` は `'ready' | 'playing' | 'dying' | 'clear' | 'paused' | 'gameover'` の文字列です。

```
              pressAction()→launch()
  ready ─────────────────────────────► playing ◄──────────────────────────┐
                                         │  ▲                              │
                      miss()             │  │ lives>0                      │
                                         ▼  │ (resetActors・無敵2秒)        │
                                       dying ──── lives<=0 ──► gameover ──┤ pressAction()→launch()
                                                                           │
   全木が倒れ終わる(update 内)             ▼                                 │
   playing ─────────────────────────► clear ── stateTimer<=0 ──────────────┘
                                         (stage++ → setupStage() → playing)

  playing / dying / clear ──(P キー・タブ非表示)──► paused ──(P・オノ操作・クリック)──► pausedFrom の状態
```

| 遷移 | 契機 | 該当箇所 |
| --- | --- | --- |
| `ready` / `gameover` → `playing` | スペース等・クリック・タッチ | `pressAction()` → `launch()` → `resetGame()` |
| `playing` → `dying` | ヘビ・イノシシ・枝に当たる | `miss()`(`stateTimer = 2`) |
| `dying` → `playing` | `stateTimer <= 0` かつ `lives > 0` | `update()` 内。`resetActors()` と `player.invincible = RESPAWN_INVINCIBLE` |
| `dying` → `gameover` | `stateTimer <= 0` かつ `lives <= 0` | `update()` 内。`playSound('over')` |
| `playing` → `clear` | 全部の木を倒し終える | `update()` 末尾(`stateTimer = 2.6`) |
| `clear` → `playing` | `stateTimer <= 0` | `update()` 内。`stage++`、`setupStage()`、`playSound('start')` |
| 各状態 ⇄ `paused` | P キー、タブ非表示、`pressAction()` | `togglePause()`(`pausedFrom` に元の状態を保存) |

### 3.3 プレイ中の 1 フレームの流れ

`loop(now)` が `dt = Math.min(0.05, (now - last) / 1000)` を計算し、`update(dt)`、`draw()` の順に呼びます。`update(dt)` の中身は次のとおりです。

1. 画面揺れ `shake` を減らす(`dt * 20`)。`updateParticles(dt)` を呼ぶ。この 2 つは状態を問わず毎フレーム実行される。
2. `state === 'dying'` なら、`stateTimer` と `player.ghostY` を進め、タイマー切れで次の状態へ移して `return`。
3. `state === 'clear'` なら、`stateTimer` を減らし、`updateTrees(dt)` だけ呼んで `return`。
4. `state !== 'playing'` なら `return`(`ready`、`paused`、`gameover` はここで止まる)。
5. `updatePlayer`、`updateTrees`、`updateEnemies`、`updateBranches`、`updateBirds` を順に呼ぶ。
6. `enemyTimer`、`birdTimer` を減らし、0 以下になったら `spawnEnemy()`、`spawnBird()` を呼んで次の間隔を設定する。
7. クリア条件を判定する(7.2 参照)。

### 3.4 終了

- 終了条件はゲームオーバー(`lives` が 0)のみです。最終面やエンディングの処理は見当たりません(`SPEC.md` 4.3 と同じ。要確認)。
- ゲームオーバー画面でスペース等・クリック・タッチを入力すると、`launch()` → `resetGame()` で最初から始まります。
- `requestAnimationFrame` のループを止める処理はありません。ページを閉じるまでループは動き続けます。

---

## 4. 主要な変数・データ構造

### 4.1 定数(設定)

| 定数 | 値 | 意味 |
| --- | --- | --- |
| `W`、`H` | 640、480 | キャンバスの幅と高さ |
| `GROUND` | 400 | 地面の y 座標 |
| `CANOPY_Y` | 150 | 木の葉っぱの中心の高さ |
| `TREES_PER_STAGE` | 3 | 1 面の木の本数 |
| `TREE_HP` | 8 | 木を倒すのに必要なオノの回数 |
| `PLAYER_SPEED` | 170 | 移動速度 |
| `PLAYER_HALF` | 10 | プレイヤーの当たり判定の半幅 |
| `CHOP_COOLDOWN` | 0.24 | オノの間隔 |
| `SWING_TIME` | 0.16 | オノを振る動作の長さ |
| `STUN_TIME` | 1.4 | しびれる時間 |
| `RESPAWN_INVINCIBLE` | 2 | 面開始・復活直後の無敵時間 |
| `MAX_LIVES` | 3 | 初期の残機 |
| `SCORE_CHOP` / `SCORE_TREE` / `SCORE_SNAKE` / `SCORE_BOAR` / `SCORE_CRUSH` / `SCORE_STAGE` | 10 / 500 / 100 / 200 / 300 / 1000 | 得点 |
| `KEY_HIGH`、`KEY_SOUND` | `'kikoriMokuta.highScore'`、`'kikoriMokuta.sound'` | `localStorage` のキー |
| `KEYMAP` | 下記 | `KeyboardEvent.code` から `keys` のプロパティ名への対応 |
| `SOUNDS` | 効果音の関数の表 | `playSound(name)` が参照する |

`KEYMAP` の内容: `ArrowLeft` / `KeyA` → `'left'`、`ArrowRight` / `KeyD` → `'right'`、`ArrowDown` / `KeyS` → `'down'`。

### 4.2 ゲーム全体の状態(グローバル `let`)

| 変数 | 意味 |
| --- | --- |
| `state` | ゲームの状態(3.2 参照) |
| `pausedFrom` | 一時停止を解除したときに戻る状態。初期値 `'playing'` |
| `stateTimer` | `dying`、`clear` の残り時間 |
| `score`、`lives`、`stage` | 得点、残機、面数(1 始まり) |
| `highScore`、`newRecord` | ハイスコア、このゲームで更新したか |
| `soundOn` | 効果音の ON/OFF |
| `trees`、`enemies`、`branches`、`birds`、`drops`、`particles`、`popups` | 各オブジェクトの配列 |
| `enemyTimer`、`birdTimer` | 次の敵・鳥の出現までの時間 |
| `shake` | 画面揺れの強さ |
| `audioCtx` | Web Audio の `AudioContext`。最初に音を鳴らすときに作る(初期値 `null`) |
| `last` | 前フレームの時刻(`loop` 用) |

### 4.3 `keys` オブジェクト

`const keys = { left: false, right: false, down: false }`。キーボードの押下状態と、タッチ用ボタンの押下状態の両方を、同じオブジェクトに書き込みます。オノは押している間の状態を持たず、押した瞬間に `pressAction()` を呼ぶ方式です。

### 4.4 `player` オブジェクト

| プロパティ | 意味 |
| --- | --- |
| `x` | 横位置(y は `GROUND` 固定で、変数としては持たない) |
| `dir` | 向き(1: 右、-1: 左) |
| `chopCool` | 次にオノを振れるまでの時間 |
| `swing` | オノを振るアニメーションの残り時間 |
| `stun` | しびれの残り時間 |
| `invincible` | 無敵の残り時間 |
| `hiding` | 木の陰にかくれているか |
| `walk` | 歩きアニメーション用の値 |
| `ghostY` | やられたときに魂が浮かんだ量 |

### 4.5 各オブジェクトのデータ構造

**木**(`setupStage()` で生成)

```js
{ x, hp: TREE_HP, state: 'stand', angle: 0, fallDir: 1, fade: 1, shake: 0, crushed: false }
```

- `state` は `'stand' → 'falling' → 'down' → 'gone'` と進む。
- `angle` は倒れた角度(ラジアン、最大 `Math.PI / 2`)。`fallDir` は倒れる向き。
- `fade` は `down` になってから薄くなる値(1 から減る)。`crushed` は下敷き判定を行ったか。

**敵**(`spawnEnemy()` で生成。ヘビとイノシシは `type` で区別)

```js
// イノシシ
{ type: 'boar',  x, dir, speed: 190 + stage * 15, half: 20, warn: 1.0, dead: false, anim: 0 }
// ヘビ
{ type: 'snake', x, dir, speed: 45 + stage * 8,  half: 16, warn: 0,   dead: false, anim: 0,
  turnTimer: 2 + Math.random() * 3, turns: 0 }
```

- `warn` が 0 より大きい間は出現予告中。動かず、当たり判定もなく、オノも当たらない。
- `dead` が `true` の敵は、次の `updateEnemies()` で配列から取り除かれる。

**枝**(`spawnBranch(tree)`): `{ x, y: CANOPY_Y + 20, vy: 0, warn: 0.65, rot }`。落ちて地面に着くと `done: true` が付いて取り除かれる。

**鳥**(`spawnBird()`): `{ x, y, dir, speed, dropsLeft, dropCool: 0, flap: 0 }`。`dropsLeft` は 1(`stage >= 3` で 2)。

**フン**(`updateBirds()` 内で生成): `{ x, y, vy: 60 }`。当たるか地面に着くと `done: true` が付いて取り除かれる。

**パーティクル**(`burst()`): `{ x, y, vx, vy, life, color }`。
**得点ポップアップ**(`addScore()`): `{ x, y, text, life: 0.9 }`。

---

## 5. 主要な関数と役割

### 5.1 保存・得点

| 関数 | 役割 |
| --- | --- |
| `loadStorage(key, fallback)` | `localStorage.getItem` を `try/catch` で包む。値がない(`null`)ときや例外のときは `fallback` を返す。 |
| `saveStorage(key, value)` | `localStorage.setItem(key, String(value))` を `try/catch` で包む。失敗しても続行する。 |
| `addScore(n, x, y)` | `score` を加算する。`x` が渡されたときだけ得点ポップアップを出す。`highScore` を超えたら更新して `newRecord = true` にし、`KEY_HIGH` へ保存する。 |

### 5.2 効果音

| 関数 | 役割 |
| --- | --- |
| `tone(freq, duration, type, volume, slideTo, delay)` | オシレーターで 1 音鳴らす。`audioCtx` がなければここで作る(`AudioContext` がない環境では何もしない)。 |
| `melody(notes, type, volume)` | `[周波数, 長さ]` の配列を順に鳴らす。周波数が 0 なら休符。 |
| `playSound(name)` | `soundOn` が `false` なら何もしない。`SOUNDS[name]` があれば呼ぶ。 |
| `updateSoundButton()` | ボタンの文言を「音: ON」「音: OFF」に更新する。 |
| `toggleSound()` | `soundOn` を反転し、`KEY_SOUND` へ保存して、ボタンの文言を更新する。 |

`SOUNDS` のキーは `start`、`chop`、`fall`、`whiff`、`kill`、`crush`、`stun`、`warn`、`miss`、`clear`、`over` です。

### 5.3 初期化・状態遷移

| 関数 | 役割 |
| --- | --- |
| `resetGame()` | `score`、`lives`、`stage`、`newRecord` を初期値に戻し、`setupStage()` を呼ぶ。 |
| `setupStage()` | 木を `TREES_PER_STAGE` 本並べ直す。`resetActors()` を呼び、`player.x = 50`、`player.dir = 1`、無敵時間を設定する。 |
| `resetActors()` | 敵・枝・鳥・フンを消し、`enemyTimer = 2.5`、`birdTimer = 5` に戻す。プレイヤーのオノ・しびれ・かくれる・魂の状態も戻す。 |
| `launch()` | `resetGame()` を呼び、`state = 'playing'` にして `playSound('start')`。 |
| `togglePause()` | `paused` なら `pausedFrom` に戻す。`playing`、`dying`、`clear` なら `pausedFrom` に保存して `paused` にする。それ以外の状態では何もしない。 |

### 5.4 入力

`pressAction()`: `ready` / `gameover` なら `launch()`、`playing` なら `chop()`、`paused` なら `togglePause()`。`dying`、`clear` では何もしません。

### 5.5 行動(オノ)

| 関数 | 役割 |
| --- | --- |
| `treeInFront()` | `trees.find` で、立っている(`stand`)木のうち、向いている方向への距離が 8 より大きく 42 より小さいものを返す。 |
| `chop()` | オノを振る処理(7.1 参照)。 |
| `killEnemy(e, points)` | `e.dead = true` にし、得点とポップアップ、パーティクルを出す。 |

### 5.6 生成

| 関数 | 役割 |
| --- | --- |
| `spawnEnemy()` | 生存している敵が上限(`Math.min(4, 2 + Math.floor(stage / 2))`)以上なら何もしない。そうでなければ、確率 `Math.min(0.5, 0.2 + stage * 0.05)` でイノシシ、それ以外でヘビを出す。左右は 50%。イノシシのときは `playSound('warn')`。 |
| `spawnBranch(tree)` | 枝を作る。x は木とプレイヤーの中間を中心に ±35 のランダム。 |
| `spawnBird()` | 鳥を作る。y は 50〜100 のランダム。 |
| `burst(x, y, color, count, speed)` | パーティクルを `count` 個作る。 |

### 5.7 更新

| 関数 | 役割 |
| --- | --- |
| `update(dt)` | 3.3 のとおり、状態に応じた更新の入口。 |
| `updatePlayer(dt)` | タイマー類を減らす。しびれ中は `hiding = false` にして `return`。かくれる判定、移動、画面端への制限を行う。 |
| `updateTrees(dt)` | 木が倒れる動き、下敷き判定、倒れた後のフェードアウトを行う。 |
| `touchesPlayer(x, half)` | `Math.abs(x - player.x) < half + PLAYER_HALF`。左右方向だけの判定。 |
| `updateEnemies(dt)` | 敵の移動・向き変更・プレイヤーとの接触判定。死んだ敵や画面外の敵を配列から外す。 |
| `updateBranches(dt)` | 枝の落下と接触判定。 |
| `updateBirds(dt)` | 鳥の移動、フンを落とす判定、フンの落下と接触判定。 |
| `miss()` | `state` が `playing` のときだけ、`dying` へ移す(`stateTimer = 2`、`shake = 10`、`playSound('miss')`)。 |
| `updateParticles(dt)` | パーティクルとポップアップの移動、寿命による削除。 |

### 5.8 描画・ループ

6 節と 8 節を参照してください。ループは `loop(now)` です。

---

## 6. キーボード入力・イベント処理

イベントリスナーはすべて `main.js` の「入力」節と「効果音」節にあります。`keydown` と `keyup` は `window` に登録されています。

| イベント | 対象 | 処理 |
| --- | --- | --- |
| `keydown` | `window` | `KEYMAP` にあるキー(←→↓ / A D S)は `keys[...] = true` にして `preventDefault()`。`Space` / `Enter` / `KeyZ` / `KeyJ` は `preventDefault()` し、`e.repeat` なら無視、そうでなければ `pressAction()`。`KeyP` は `togglePause()`、`KeyM` は `toggleSound()`。 |
| `keyup` | `window` | `KEYMAP` にあるキーなら `keys[...] = false`。 |
| `pointerdown` | `canvas` | `preventDefault()`。`state !== 'playing'` のときだけ `pressAction()`。プレイ中のクリック・タップでは何も起きない(`SPEC.md` の要確認事項 3)。 |
| `pointerdown` | `.pad button` | `data-key="axe"` なら `pressAction()`、それ以外は `keys[k] = true`。 |
| `pointerup` / `pointercancel` / `pointerleave` | `.pad button` | `axe` 以外は `keys[k] = false`。 |
| `click` | `#sound-toggle` | `toggleSound()` を呼び、`blur()` でフォーカスを外す(スペースキーでボタンが反応しないようにするため)。 |
| `visibilitychange` | `document` | タブが非表示で `state !== 'paused'` なら `togglePause()`。その後 `keys.left`、`keys.right`、`keys.down` を `false` にする。 |

補足:

- `keydown` の `preventDefault()` は、`KEYMAP` のキーと、オノのキー(Space / Enter / Z / J)にだけ掛かります。P と M には掛かりません。
- `keys` の値は `updatePlayer()` が毎フレーム読みます。移動とかくれるは、押している間だけ有効です。
- オノは `keydown` の瞬間に `chop()` を呼びます。連続して振る間隔は `chopCool`(0.24 秒)で制限されます。
- 一時停止中も `keydown` / `keyup` は `keys` を更新します。したがって、一時停止中にキーを離しても `keys` は正しく更新されます。
- フォーカスが外れたとき(`blur`)にキー状態を解除する処理はありません。解除するのは `visibilitychange` のときだけです(要確認: 意図した範囲か)。

---

## 7. 衝突判定・ステージクリア判定

当たり判定はすべて「左右方向の距離」と「高さの範囲」で行う簡易な方式です。矩形やピクセルの判定は使っていません。プレイヤーは地面を歩くだけなので、縦方向は枝とフンにだけ範囲を使っています。

### 7.1 オノの判定(`chop()`)

1. `player.chopCool > 0`、`player.stun > 0`、`player.hiding` のいずれかなら、何もせず `return`。
2. `chopCool = CHOP_COOLDOWN`、`swing = SWING_TIME` を設定する。
3. 前方の範囲を `player.x + player.dir * 6` から `player.x + player.dir * 52` までとし、小さい側を `lo`、大きい側を `hi` とする。
4. `enemies` を順に見て、`e.warn > 0` または `e.dead` を除き、`e.x + e.half > lo && e.x - e.half < hi` なら `killEnemy()`(イノシシ `SCORE_BOAR`、ヘビ `SCORE_SNAKE`)。1 体でも倒したら `playSound('kill')` をして `return`(木は切らない)。
5. 敵がいなければ `treeInFront()` を調べる。なければ `playSound('whiff')` をして `return`。
6. 木があれば、`hp--`、`shake = 0.15`、`playSound('chop')`、`addScore(SCORE_CHOP)`、パーティクルを出す。
7. `t.hp > 0` のとき、確率 `Math.min(0.5, 0.18 + stage * 0.04)` で `spawnBranch(t)`。
8. `t.hp <= 0` になったら `state = 'falling'`、`fallDir = player.dir`、`addScore(SCORE_TREE, ...)`、`playSound('fall')`、`shake = 6`。

注意: 8 のコードコメントは「自分と反対側へ倒れる」ですが、実際のコードは `fallDir = player.dir`(プレイヤーの向いている方向)です。向いている方向の木を切るので、結果として「プレイヤーから見て木の向こう側」に倒れます。コメントの意味は要確認です。

### 7.2 ステージクリア判定(`update()` 末尾)

```js
if (trees.every((t) => t.state !== 'stand') &&
    trees.every((t) => t.state === 'gone' || t.angle >= Math.PI / 2)) {
  state = 'clear';
  stateTimer = 2.6;
  addScore(SCORE_STAGE * stage);
  playSound('clear');
}
```

- 条件は、立っている木が 0 本、かつ、すべての木が倒れ切っているか消えているかです。
- この判定は `state === 'playing'` のときだけ実行されます(`update()` の途中で `return` されない場合)。
- `updateEnemies()` と `updateBranches()` は `miss()` を呼ぶと、その関数だけ `return` します。`update()` はそのまま最後まで実行されるため、同じフレームでクリア条件も満たしていると、`dying` になった `state` が `clear` に上書きされます。要確認: 最後の木が倒れ切るフレームに敵・枝に当たったときの挙動が意図どおりか。

### 7.3 プレイヤーと危険物の判定

| 対象 | 判定場所 | 条件 | 結果 |
| --- | --- | --- | --- |
| ヘビ・イノシシ | `updateEnemies()` | `!player.hiding && player.invincible <= 0 && touchesPlayer(e.x, e.half - 4)`。予告中(`warn > 0`)と死んだ敵は判定しない。 | `miss()` |
| 枝 | `updateBranches()` | `b.y > GROUND - 56 && b.y < GROUND - 10 && player.invincible <= 0 && touchesPlayer(b.x, 12)`。`hiding` は見ない。`warn > 0` の間は落下しない。 | `miss()` |
| フン | `updateBirds()` | `d.y > GROUND - 56 && d.y < GROUND - 10 && !player.hiding && player.stun <= 0 && touchesPlayer(d.x, 6)`。`invincible` は見ない。 | `player.stun = STUN_TIME`、`player.swing = 0`、`playSound('stun')` |

- 地面に着いた枝(`b.y >= GROUND - 6`)とフン(`d.y >= GROUND - 2`)は消えます。
- 倒れる木がプレイヤーに当たる判定は、コード上に見当たりません。

### 7.4 かくれる判定(`updatePlayer()`)

`const nearTree = trees.find((t) => t.state === 'stand' && Math.abs(t.x - player.x) < 22)` として、`player.hiding = keys.down && !!nearTree`。かくれている間は移動できず、`chop()` も何も起きません。

### 7.5 木による下敷き判定(`updateTrees()`)

`t.state === 'falling'` で `t.angle > 0.9 && !t.crushed` になったとき、1 回だけ実行されます。敵のうち、予告中でなく死んでいないものについて、`d = (e.x - t.x) * t.fallDir` が `d > 10 && d < GROUND - CANOPY_Y + 40` なら `killEnemy(e, SCORE_CRUSH)` と `playSound('crush')`。

### 7.6 画面外の削除

- 敵: `e.x > -60 && e.x < W + 60` の外に出たら削除。
- 鳥: `b.x > -40 && b.x < W + 40` の外に出たら削除。

---

## 8. 描画処理と画面更新

### 8.1 画面更新の方式

- `requestAnimationFrame` に毎フレーム `loop(now)` を登録します。固定フレームレートではなく、ブラウザの更新周期に従います。
- 時間は `dt`(秒)で進めます。`dt` は最大 0.05 秒に制限されます。これを超える長いフレーム落ちがあっても、ゲーム内の時間は 0.05 秒ずつしか進みません。
- `draw()` は毎フレーム、画面全体を描き直します。`clearRect` は呼ばず、`drawBackground()` が空を塗りつぶして上書きします。

### 8.2 `draw()` の描画順

1. `ctx.save()`。`shake > 0` なら `ctx.translate` でランダムにずらす。
2. `drawBackground()`
3. `player.hiding` のとき、`drawPlayer()`(木より奥に描くため先に呼ぶ)
4. `drawTree(t)`(全部の木)
5. `drawEnemy(e)`(全部の敵)
6. `!player.hiding` のとき、`drawPlayer()`
7. `drawBranch(b)`、`drawDrop(d)`、`drawBird(b)`
8. `drawParticles()`(パーティクルと得点ポップアップ)
9. `ctx.restore()`(ここまでが画面揺れの対象)
10. `drawHud()`(画面揺れの対象外)
11. `state` に応じて `drawCenterText()` を呼ぶ(`ready`、`paused`、`clear`、`gameover`)

### 8.3 各描画関数

| 関数 | 内容 |
| --- | --- |
| `drawBackground()` | 空のグラデーション、山、奥の森のシルエット、地面。すべて固定の図形で、時間では変化しない。 |
| `drawTree(t)` | `gone` なら `drawStump()` だけ。それ以外は `ctx.translate` と `ctx.rotate(t.angle * t.fallDir)` で根元を支点に回転して、幹と葉を描く。`down` のときは `t.fade` で透明度を変える。`stand` のときは切り込みを描き、それ以外は切り株を描く。 |
| `drawStump(x)` | 切り株。 |
| `drawPlayer()` | 無敵中の点滅(`playing` のときだけ)、やられ姿と魂(`dying` / `gameover`)、通常の姿(向きは `ctx.scale(player.dir, 1)` で反転)、オノの振り、しびれ中の星。 |
| `drawEnemy(e)` | 予告中は「!」を点滅させて `return`。それ以外はヘビまたはイノシシを描く。 |
| `drawBranch(b)`、`drawBird(b)`、`drawDrop(d)` | それぞれ枝(予告中は影を描く)、鳥、フン。 |
| `drawParticles()` | パーティクルと得点ポップアップ。 |
| `drawHud()` | 画面上部の帯と、`SCORE`、`HI`、`STAGE`、`木 n`、残機の帽子アイコン。 |
| `drawCenterText(title, sub, hint)` | 画面中央の半透明の帯とメッセージ。`hint` は `Math.floor(performance.now() / 500) % 2 === 0` のときだけ描く(0.5 秒ごとの点滅)。 |

### 8.4 状態ごとの更新と描画の違い

| 状態 | `update` で更新されるもの | `draw` |
| --- | --- | --- |
| `ready` | `shake`、パーティクルのみ | 通常の描画とタイトル文字 |
| `playing` | すべて | 通常の描画 |
| `dying` | `stateTimer`、`player.ghostY`、`shake`、パーティクル | 通常の描画(プレイヤーはやられ姿) |
| `clear` | `stateTimer`、木、`shake`、パーティクル | 通常の描画とクリア文字 |
| `paused` | `shake`、パーティクルのみ | 通常の描画と「一時停止」 |
| `gameover` | `shake`、パーティクルのみ | 通常の描画とゲームオーバー文字 |

---

## 9. SPEC.md との対応関係

`SPEC.md` の各節と、`main.js` の実装箇所の対応です。今回確認した範囲では、`SPEC.md` の記載と `main.js` の実装は一致していました。

| SPEC.md の節 | 内容 | 対応する実装 |
| --- | --- | --- |
| 1 ゲーム概要 | 画面サイズ、地面の高さ、保存、効果音 | `W`、`H`、`GROUND`、`KEY_HIGH`、`KEY_SOUND`、`SOUNDS` |
| 2 操作方法 | キー、マウス、タッチ、自動一時停止 | `KEYMAP`、`keydown` / `keyup`、`pressAction()`、`canvas` の `pointerdown`、`.pad button`、`visibilitychange` |
| 3.1 状態 | 6 つの状態 | `state`、`update()`、`togglePause()` |
| 3.2 プレイヤー | 速度、判定、無敵 | `player`、`PLAYER_SPEED`、`PLAYER_HALF`、`updatePlayer()` |
| 3.3 オノ | 敵優先、木の HP | `chop()`、`treeInFront()`、`killEnemy()` |
| 3.4 かくれる | 22 px 未満、枝は防げない | `updatePlayer()`、`updateBranches()` |
| 3.5 ミス | 敵・枝に当たる | `updateEnemies()`、`updateBranches()`、`miss()` |
| 3.6 しびれ | 1.4 秒 | `updateBirds()`、`STUN_TIME` |
| 4.1 面の開始 | 木の配置、初期化 | `setupStage()`、`resetActors()` |
| 4.2 / 4.3 クリア条件・流れ | 全部の木が倒れ切る → 2.6 秒 → 次の面 | `update()` の `clear` の処理と末尾の判定 |
| 4.4 難易度 | 面数による変化 | `spawnEnemy()`、`spawnBird()`、`chop()` の `branchChance`、`update()` の出現間隔 |
| 5 敵の動作 | ヘビ、イノシシ、枝、鳥とフン、下敷き | `spawnEnemy()`、`updateEnemies()`、`spawnBranch()`、`updateBranches()`、`spawnBird()`、`updateBirds()`、`updateTrees()` |
| 6 得点・残機 | 得点、ハイスコア、残機、ゲームオーバー | `SCORE_*`、`addScore()`、`lives`、`update()` の `dying` の処理 |
| 7.1 / 7.2 HUD・中央メッセージ | 表示内容 | `drawHud()`、`drawCenterText()`、`draw()` 末尾 |
| 7.3 / 7.4 背景・キャラ描画 | 見た目 | `drawBackground()` ほか `draw*()` |
| 7.5 効果音 | 効果音の一覧 | `SOUNDS`、`playSound()` |
| 7.6 メインループ | `dt` の上限 | `loop()` |

`SPEC.md` の「要確認事項のまとめ」7 項目は、この設計書の解析でも次のように確認できました。

1. 最終面がない: `stage++` の上限判定が見当たらない。
2. 速度の上限がない: ヘビ `45 + stage * 8`、イノシシ `190 + stage * 15`、鳥 `100 + stage * 8` に `Math.min` がない。
3. プレイ中のクリックでオノを振らない: `pointerdown` が `state !== 'playing'` のときだけ `pressAction()` を呼ぶ。
4. 保存済みハイスコアが 0 のとき、最初の得点で `newRecord` が `true` になる: `addScore()` が `score > highScore` だけで判定している。
5. `index.html` の説明文に A/D/S/J/Enter/M がない: 静的な `<span>` のみ。
6. `drawCenterText` の「木を3本」が固定文字列: `TREES_PER_STAGE` と連動していない(`draw()` 内)。
7. 倒れる木とプレイヤーの判定がない: `updateTrees()` にプレイヤーを参照する処理がない。

この設計書で新たに見つけた点は、7.1 の `chop()` のコメントと実装の食い違い(コメント「自分と反対側」/ コード `fallDir = player.dir`)と、7.2 の `clear` への上書きの可能性です。どちらも要確認です。

---

## 10. 今後の拡張時の注意点

コードの構造から読み取れる注意点です。実際に試したものではありません。

### 10.1 全般

- ルートの `CLAUDE.md` と `games/kikori-mokuta/CLAUDE.md` のルールを守ること。特に、スコアの保存は `loadStorage()` / `saveStorage()` を通すこと、効果音は `playSound(name)` を通すこと。
- 画面の文字とコードコメントは日本語で統一すること。
- 既存作品の名前・キャラクター・楽曲を使わないこと(`CLAUDE.md` のルール)。
- 仕様を変えたら `SPEC.md` を、構造を変えたら `DESIGN.md` を更新すること。

### 10.2 状態遷移を変えるとき

- `state` の文字列は複数の関数で直接比較されています(`update()`、`draw()`、`pressAction()`、`togglePause()`、`drawPlayer()`、キャンバスの `pointerdown`)。新しい状態を足すときは、これらをすべて確認すること。
- `togglePause()` は `playing`、`dying`、`clear` だけを一時停止の対象にしています。新しい状態を一時停止できるようにするなら、この条件の変更が必要です。
- `update()` は `dying` と `clear` で途中で `return` します。新しい処理(新しい敵など)を足すときは、どの状態で更新するかを意識すること。

### 10.3 敵・危険物を追加するとき

- 追加するオブジェクトは、配列、`spawn*()`、`update*()`、`draw*()` の組にする。`resetActors()` で配列を空にするのを忘れないこと(忘れると、面開始・復活時に残る)。
- `draw()` の描画順(8.2)で、どこに入れるかを決めること。
- 当たり判定は `touchesPlayer(x, half)` で左右方向だけを見ます。縦方向の判定が必要な場合は新しく設計が必要です。
- `miss()` は `state !== 'playing'` のとき何もしません。同じフレームで複数の危険物に当たっても、`dying` は 1 回だけです。
- 危険物には予告を付けるのが、このゲームの方針です(`CLAUDE.md`)。

### 10.4 難易度・バランス

- 面数による値の式は `spawnEnemy()`、`spawnBird()`、`chop()`、`update()` に分散しています。1 か所にまとまっていないので、変更するときは `SPEC.md` 4.4 の表も合わせて直すこと。
- 速度の上限がありません。面が進むと、プレイヤー(`PLAYER_SPEED` 170)より速い敵が出ます(ヘビは 16 面以降)。要確認: 上限を付けるか。
- 画面の中央文字「木を3本切り倒そう」は固定です。`TREES_PER_STAGE` を変えるなら、文言も直すこと。
- `setupStage()` の木の配置は、画面を `TREES_PER_STAGE` 個の区画に分けて 1 本ずつ植える方式です(`section = (W - 160) / TREES_PER_STAGE`)。本数を増やすと隣の木との間隔が狭くなります。

### 10.5 入力を変えるとき

- 新しいキーは `KEYMAP`(押している間有効にしたいもの)か、`keydown` の分岐(押した瞬間だけ有効にしたいもの)に足すこと。
- タッチ用ボタンを増やす場合は、`index.html` に `data-key` を持つボタンを足すこと。`axe` 以外のキーは `keys[k]` に直接書き込まれるので、`keys` にそのプロパティを追加する必要があります。
- タブを切り替えたときの処理は `keys.left`、`keys.right`、`keys.down` を個別に `false` にしています。`keys` に項目を足したら、ここも直すこと。

### 10.6 描画を変えるとき

- 内部の座標系は 640×480 の固定です(`W`、`H`)。キャンバスのサイズを変えると、背景の図形(`drawBackground()` の座標)、HUD、`setupStage()` の木の配置、敵・鳥の出現位置が固定値を使っている箇所があるため、広く修正が必要です。
- `draw()` は `clearRect` を使わず、背景で全面を上書きしています。背景が半透明になるような変更をするときは注意すること。
- 描画中の `ctx.globalAlpha` は `drawTree()` や `drawParticles()` で変更されます。`ctx.save()` / `ctx.restore()` で戻している箇所と、末尾で `globalAlpha = 1` に戻している箇所があります。新しい描画を足すときは、値が残らないようにすること。

### 10.7 保存・効果音

- `localStorage` が使えない環境でも遊べるようにするため、読み書きは `try/catch` で包まれています。この方針を保つこと。
- `audioCtx` は最初に音を鳴らすときに作られます(ブラウザの自動再生制限のため)。起動時に作る方式へ変えると、環境によっては鳴らなくなる可能性があります。
- `tone()` は毎回オシレーターを作って捨てます。同時に鳴る音の数に上限はありません(要確認: 大量に鳴らす場面を追加するときの負荷)。

### 10.8 テスト

- テストコードやビルド手順はありません(`CLAUDE.md`)。変更後はブラウザで開き、手で確認する必要があります。
- `main.js` は関数やグローバル変数が DOM に強く依存しており(`document.getElementById` が冒頭にある)、単体テストを導入する場合は構造の見直しが必要です(要確認)。
