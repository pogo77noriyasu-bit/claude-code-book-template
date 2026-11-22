// PUNKS & SKINS RESCUE: 窓の HELP! 演出(背景の飾り。2026-11-22)
// 左の燃えているビルの「炎が出ていない窓」の中で、パンクス・スキンズが左右にちょこちょこ動き、ときどき HELP! を点滅させる。
// 窓の人は窓ごとに 3〜5 秒の間隔で、味方 8 人の中から直前と違う人へ入れ替わる。
// - 背景の飾りだけ: 飛び降りない・救助の対象ではない・得点・MISS・当たり判定・ゲームの進行には一切かかわらない
//   (ゲームの状態は読むだけ。動きは描画の時刻 g.frame から計算するので、状態を書き換えない)
// - 8 ビット風(標準)のときだけ動く。URL に ?help=0 を付けると止まる(元の状態に戻る)。?gfx=original でも出さない
// - 背景画像は変えない。人を窓の中に重ねて描き、そのあと窓の桟(背景の窓の中の暗くない画素)を上から描き直す(人が窓の奥にいるように見える)
// - ドットの大きさはほかのキャラクターと同じ(20×20 ドットを 5 倍)。HELP! も 5px のドット文字
window.PSR = window.PSR || {};

PSR.windowHelp = (function () {
  const gfx8 = PSR.gfx8 && PSR.gfx8.enabled;
  const enabled = !!gfx8 && !/[?&]help=0(&|$)/.test(location.search);
  const S = PSR.config.SPRITE_SCALE; // 5
  const D = S; // 1 ドット = 5px

  // 炎が出ていない窓の中(背景のピクセル座標。窓の内側の暗い部分の外枠)。tools で調べた値
  // 3 階の右の窓(320, 462)は飛び降りる人が現れる窓なので、まぎらわしくならないよう使わない
  const WINDOWS = [
    // char = 最初に出す人(共通キャラクターの ID@バージョン。CHARS のどれか)。そのあとは CHARS の中で 3〜5 秒ごとに入れ替わる
    { x: 40, y: 30, w: 85, h: 130, char: 'punk_011@4', phase: 0 }, // 最上階・左: 青モヒカン
    { x: 160, y: 210, w: 85, h: 135, char: 'skin_002@1', phase: 97 }, // 2 階・中央: スキンズ
    { x: 40, y: 390, w: 85, h: 130, char: 'punk_009@1', phase: 181 }, // 3 階・左: 緑スパイキー
    { x: 40, y: 575, w: 85, h: 120, char: 'skin_002@1', phase: 53 }, // 1 階・左: スキンズ
    { x: 160, y: 575, w: 85, h: 120, char: 'punk_011@4', phase: 233 }, // 1 階・中央: 青モヒカン
  ];

  // 窓に出す人: 落ちてくるキャラクターの一覧(js/characters.js の PSR.CHARACTERS)のうち、味方(side: 'ally')全員(8 人)。
  // 一覧はここに重複して持たず、味方を増やせば窓にも自動で出る。警官・機動隊員(敵)は窓には出さない。
  // 窓では立ち姿('stand' のコマ)を使う(味方 8 人とも共通素材に 'stand' がある)
  const CHARS = PSR.CHARACTERS.filter((c) => c.side === 'ally').map((c) => c.ref);
  // 人の入れ替え(2026-11-22): 窓ごとに 3〜5 秒(180〜300 ステップ)の間隔で、直前と違う人へ瞬時に替える。
  // 間隔と次の人は、窓の番号と何回目かから決まる式(hash)で選ぶ。ゲームの乱数(g.rand)は使わないので、ゲームの進行には影響しない
  const SWAP_MIN = 180;
  const SWAP_MAX = 300;

  // 動きの間隔(ステップ = 1/60 秒)
  const MOVE_EVERY = 14; // ちょこちょこ動く間隔(約 0.23 秒)
  const STEPS = [0, 1, 2, 2, 1, 0, -1, -2, -2, -1, 0, 0]; // 左右の動き(ドット。止まる時間も入れる)
  const HELP_CYCLE = 300; // HELP! を出す周期(5 秒)
  const HELP_SHOW = 110; // そのうち HELP! を出している時間
  const HELP_BLINK = 10; // 点滅の間隔

  // HELP! のドット文字(3×5。'X' = ドット)
  const GLYPHS = {
    H: ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'],
    E: ['XXX', 'X..', 'XXX', 'X..', 'XXX'],
    L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
    P: ['XXX', 'X.X', 'XXX', 'X..', 'X..'],
    '!': ['X', 'X', 'X', '.', 'X'],
  };
  const HELP_COLOR = '#f8d878'; // パレットの明るい黄色(炎の色と同じ)
  const FOOT_SINK = 3; // 足元を窓の下枠より何ドット下に置くか(膝から上が見え、頭の上に HELP! の場所ができる)

  let bars = null; // 窓の桟(窓の中の暗くない画素だけを残した画像)
  // 窓ごとの入れ替えの状態(描画のための状態だけ。ゲームの状態 g には書き込まない)
  const swap = WINDOWS.map(() => ({ cur: null, seg: 0, start: 0, end: null }));

  // 0 以上 1 未満の決まった値(同じ a・b なら毎回同じ)
  function hash(a, b) {
    const v = Math.sin(a * 127.1 + b * 311.7 + 0.5) * 43758.5453;
    return v - Math.floor(v);
  }
  const swapLen = (i, seg) => SWAP_MIN + Math.floor(hash(i + 17, seg) * (SWAP_MAX - SWAP_MIN + 1));

  // 窓 i の今の人を決める(時刻 frame まで入れ替えを進める)
  function currentChar(i, frame) {
    const st = swap[i];
    // 最初の 1 回、または時刻が戻ったとき(新しいページ・テストで時刻を戻したとき)は最初の人から
    if (st.end === null || frame < st.start) {
      st.cur = WINDOWS[i].char;
      st.seg = 0;
      st.start = frame;
      st.end = frame + swapLen(i, 0);
    }
    while (frame >= st.end) {
      st.seg++;
      const others = CHARS.filter((c) => c !== st.cur); // 直前と同じ人は選ばない
      st.cur = others[Math.floor(hash(i, st.seg) * others.length)];
      st.start = st.end;
      st.end += swapLen(i, st.seg);
    }
    return st.cur;
  }
  const spriteBox = {}; // 人の絵の不透明な範囲(ドット)。窓からはみ出さない動きの幅を決める

  // 絵の不透明な範囲(左端・右端・上端)を調べる
  // 元の絵(ローダーが焼いて落下キャラクターの描画にも使うキャンバス)から直接画素を読むと、そのキャンバスが遅い描き方に切り替わり、
  // 落下キャラクターの描画まで重くなる。そのため一時的な写しに描いてから読む
  function opaqueBox(src) {
    const cv = document.createElement('canvas');
    cv.width = src.width;
    cv.height = src.height;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(src, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    let x0 = cv.width, x1 = -1, y0 = cv.height;
    for (let y = 0; y < cv.height; y++)
      for (let x = 0; x < cv.width; x++)
        if (d[(y * cv.width + x) * 4 + 3] > 0) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
        }
    return { x0, x1, y0 };
  }

  function init(bg) {
    if (!enabled) return;
    // 窓の桟: 背景の窓の中で、暗い(ほぼ黒)以外の画素を残す。画素の読み書きは作業用のキャンバスで行い、
    // 毎回の描画に使う bars には写すだけにする(読み書きしたキャンバスを毎回描くと、ほかの描画まで重くなるため)
    const work = document.createElement('canvas');
    work.width = bg.width;
    work.height = bg.height;
    const c = work.getContext('2d', { willReadFrequently: true });
    for (const w of WINDOWS) c.drawImage(bg, w.x, w.y, w.w, w.h, w.x, w.y, w.w, w.h);
    const img = c.getImageData(0, 0, work.width, work.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 60) d[i + 3] = 0;
    c.putImageData(img, 0, 0);
    bars = document.createElement('canvas');
    bars.width = bg.width;
    bars.height = bg.height;
    bars.getContext('2d').drawImage(work, 0, 0);
    for (const ref of CHARS) spriteBox[ref] = opaqueBox(POGO77.characters.get(ref).bake('stand', {}));
  }

  function drawPerson(ctx, ref, cx, footY, flip) {
    POGO77.characters.get(ref).drawFrame(ctx, 'stand', cx, footY, { scale: S, flip });
  }

  function drawHelp(ctx, cx, top) {
    const text = 'HELP!';
    const width = text.split('').reduce((n, ch) => n + GLYPHS[ch][0].length + 1, -1); // ドット(文字の間 1)
    let x = Math.round(cx - (width * D) / 2);
    ctx.fillStyle = HELP_COLOR;
    for (const ch of text) {
      const g = GLYPHS[ch];
      for (let r = 0; r < g.length; r++) for (let k = 0; k < g[r].length; k++) if (g[r][k] === 'X') ctx.fillRect(x + k * D, top + r * D, D, D);
      x += (g[0].length + 1) * D;
    }
  }

  // 描く(背景と炎のあと、道路の印・キャラクターより前)。ゲームの状態 g は読むだけ
  function draw(ctx, g) {
    if (!enabled || !bars) return;
    WINDOWS.forEach((w, wi) => {
      const t = g.frame + w.phase;
      const ref = currentChar(wi, g.frame); // 今この窓にいる人(3〜5 秒ごとに入れ替わる)
      const box = spriteBox[ref];
      // 窓の中に収まる左右の動きの幅(ドット): 窓の幅 − 絵の不透明な幅、を左右に分ける
      const slack = Math.max(0, Math.floor(w.w / D) - (box.x1 - box.x0 + 1));
      // 幅の広い髪型(赤モヒカン・緑スパイキー・黄色リバティスパイク)は余りがないが、ちょこちょこ動きを残すため最低 ±1 ドットは動かす
      // (窓の外へは描かないので、はみ出た髪の先は窓枠に隠れる)
      const reach = Math.max(1, Math.floor(slack / 2));
      const i = Math.floor(t / MOVE_EVERY) % STEPS.length;
      const off = Math.max(-reach, Math.min(reach, STEPS[i]));
      const prev = Math.max(-reach, Math.min(reach, STEPS[(i + STEPS.length - 1) % STEPS.length]));
      const flip = off < prev || (off === prev && off < 0); // 左へ動いたら左向き
      // 絵の不透明な範囲の中心が窓の中心に来るように置き、そこから左右に動かす(20 ドットの絵の中心 = 10)
      const center = w.x + w.w / 2;
      const boxMid = (box.x0 + box.x1 + 1) / 2;
      const cx = Math.round(center + (10 - (flip ? 20 - boxMid : boxMid)) * D + off * D);
      ctx.save();
      ctx.beginPath();
      ctx.rect(w.x, w.y, w.w, w.h); // 窓の外にはみ出さない
      ctx.clip();
      drawPerson(ctx, ref, cx, w.y + w.h + FOOT_SINK * D, flip);
      ctx.restore();
      // 窓の桟をこの窓の分だけ上から描き直す(人が窓の奥にいるように見える。HELP! は桟より手前)
      ctx.drawImage(bars, w.x, w.y, w.w, w.h, w.x, w.y, w.w, w.h);
      // ときどき HELP!(点滅。窓の中の頭の上)
      const ht = t % HELP_CYCLE;
      if (ht < HELP_SHOW && Math.floor(ht / HELP_BLINK) % 2 === 0) {
        const headTop = w.y + w.h + FOOT_SINK * D - (20 - box.y0) * D; // 頭のてっぺん
        drawHelp(ctx, center, Math.max(w.y + D, headTop - 6 * D));
      }
    });
  }

  // 確認用: 各窓の今の人と、次に入れ替わる時刻(読むだけ)
  const snapshot = () => swap.map((st) => ({ char: st.cur, seg: st.seg, start: st.start, end: st.end }));

  // テスト・確認用: 入れ替えの状態そのもの(描画のための状態。ゲームの状態ではない)
  const _swapState = () => swap;
  return { enabled, WINDOWS, CHARS, init, draw, snapshot, _swapState };
})();
