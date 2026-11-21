// 描画だけ(状態は変更しない)
// ドット絵はドンキーパンクのデータ(DP.sprites.DATA / PALETTE)をそのまま使う
PQ.renderer = (function () {
  const cfg = PQ.config;
  let ctx = null;
  // フィールドは 1 マス = 1px のオフスクリーンに描いておき、CELL 倍に拡大して貼る
  let fieldCanvas = null;
  let fieldCtx = null;
  let fieldImage = null;
  let fieldVersion = -1;
  let fieldRef = null;
  let fullCanvas = null;
  let fullCtx = null;

  // 色文字列 → [r, g, b]
  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const LINE = rgb(cfg.LINE_COLOR);
  const EMPTY = rgb(cfg.EMPTY_COLOR);
  const COLORS = cfg.CAPTURE_COLORS.map(rgb);

  function init(canvas) {
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    fieldCanvas = document.createElement('canvas');
    fieldCanvas.width = cfg.COLS;
    fieldCanvas.height = cfg.ROWS;
    fieldCtx = fieldCanvas.getContext('2d');
    fieldImage = fieldCtx.createImageData(cfg.COLS, cfg.ROWS);
    // 線まで描き込んだ実寸のフィールド(変わったときだけ作り直す)
    fullCanvas = document.createElement('canvas');
    fullCanvas.width = cfg.COLS * cfg.CELL;
    fullCanvas.height = cfg.ROWS * cfg.CELL;
    fullCtx = fullCanvas.getContext('2d');
  }

  // 線のマスか(外周・境界線・描画中の線・獲得済みの中に残った昔の線)
  function isLineCell(f, x, y, i) {
    const F = PQ.field;
    const v = f.cells[i];
    if (v === F.TRAIL) return true;
    return v === F.FILLED && (f.color[i] < 0 || F.isEdge(f, x, y));
  }

  // 線のマスの下地の塗り方
  // 線のマスを 3×3 の小さな区画に分けて考える(真ん中の行・列が LINE_WIDTH の線、まわりが余白)。
  // 余白の区画は、その向きにある隣のマスの塗りに合わせる:
  //   - 向いている隣に未獲得のマス(黒)・描画中の線・画面の外が 1 つでもあれば黒
  //   - そうでなく、獲得色のマス(線でない)があればその色
  //   - 隣がすべて線のマスなら黒(線どうしのつなぎ目で白に塗られる)
  // 以前はマス全体を獲得色で塗っていたため、未獲得側の余白 1px に色がはみ出していた。
  // 返り値: 色([r,g,b])か null(黒)
  //   - 向いている隣がすべて獲得済みの線のマス(平行に隣り合った線のすき間)なら、近くの獲得色
  //     (近くに獲得色がなければ黒)。すき間は獲得済みの中なので、黒く残すと「黒い点」に見える
  function marginColor(f, x, y, line, dxs, dys) {
    const F = PQ.field;
    let color = null;
    for (const dy of dys) {
      for (const dx of dxs) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= f.cols || ny >= f.rows) return null;
        const j = ny * f.cols + nx;
        if (f.cells[j] !== F.FILLED) return null; // 未獲得・描画中の線
        if (line[j]) continue; // 線のマスはどちらでもない
        // 斜めより上下左右の色を優先(同じ領域なら同じ色)
        if (!color || !(dx && dy)) color = COLORS[f.color[j]];
      }
    }
    if (color) return color;
    if (f.cells[y * f.cols + x] !== F.FILLED) return null; // 描画中の線のすき間は黒
    return nearColor(f, x, y, line);
  }

  // (x, y) のまわり 5×5 マスで、いちばん近い獲得色のマス(線でない)の色。なければ null
  function nearColor(f, x, y, line) {
    let best = null;
    let bestD = 99;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= f.cols || ny >= f.rows) continue;
        const j = ny * f.cols + nx;
        if (line[j] || f.cells[j] !== PQ.field.FILLED || f.color[j] < 0) continue;
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < bestD) {
          bestD = d;
          best = COLORS[f.color[j]];
        }
      }
    }
    return best;
  }

  // 隣り合う線のマス a・b をつなぐ線を描くか。
  // 平行に並んだ 2 本の線(a と b の両側の隣も線のマス)の間はつながない。
  // つなぐと 4px ごとに「はしご」ができ、そのすき間が等間隔の黒い点に見えていた。
  //   vertical: a の真下が b(縦につなぐ)。横につなぐときは false
  function shouldConnect(f, line, ax, ay, vertical) {
    const isLine = (x, y) => x >= 0 && y >= 0 && x < f.cols && y < f.rows && line[y * f.cols + x] === 1;
    if (vertical) {
      // a・b の左右がどちらも線なら、横に走る 2 本の線が平行に並んでいるだけ
      const left = isLine(ax - 1, ay) && isLine(ax - 1, ay + 1);
      const right = isLine(ax + 1, ay) && isLine(ax + 1, ay + 1);
      return !(left && right);
    }
    const up = isLine(ax, ay - 1) && isLine(ax + 1, ay - 1);
    const down = isLine(ax, ay + 1) && isLine(ax + 1, ay + 1);
    return !(up && down);
  }

  // フィールドの画像を作り直す(変わったときだけ)。
  // 1. 塗り(未獲得 = 黒、獲得 = 色、線のマス = いったん黒)を 1 マス 1px の画像に描いて CELL 倍に拡大
  // 2. 線のマスの余白を、隣の塗りに合わせて塗る(marginColor)
  // 3. その上に、線のマスの中心を通る LINE_WIDTH px の白い線を描く(隣の線のマスとつなぐ)
  // 線の太さは見た目だけで、陣取り・当たり判定はマス単位のまま
  function rebuildField(f) {
    if (f === fieldRef && f.version === fieldVersion) return;
    fieldRef = f;
    fieldVersion = f.version;
    const d = fieldImage.data;
    const line = new Uint8Array(f.cols * f.rows);
    for (let y = 0; y < f.rows; y++) {
      for (let x = 0; x < f.cols; x++) {
        const i = y * f.cols + x;
        let c = EMPTY;
        if (isLineCell(f, x, y, i)) line[i] = 1;
        else if (f.cells[i] === PQ.field.FILLED) c = COLORS[f.color[i]];
        d[i * 4] = c[0];
        d[i * 4 + 1] = c[1];
        d[i * 4 + 2] = c[2];
        d[i * 4 + 3] = 255;
      }
    }
    fieldCtx.putImageData(fieldImage, 0, 0);

    const C = cfg.CELL;
    const w = cfg.LINE_WIDTH;
    // マスの中で線をどこから描くか(中央寄せ。小数になると線がにじむので整数に切り捨てる。
    // 4px のマスに 1px の線なら 1px 目 = 左の余白 1px・右の余白 2px)
    const off = Math.floor((C - w) / 2);
    fullCtx.imageSmoothingEnabled = false;
    fullCtx.drawImage(fieldCanvas, 0, 0, f.cols * C, f.rows * C);

    // 線のマスの余白(3×3 の区画のうち真ん中以外)。区画の位置・大きさと、向いている隣の方向
    const parts = [
      { o: 0, n: off, d: [-1] }, // 左(上)の余白
      { o: off, n: w, d: [0] }, // 真ん中(線の幅)
      { o: off + w, n: C - off - w, d: [1] }, // 右(下)の余白
    ];
    for (let y = 0; y < f.rows; y++) {
      for (let x = 0; x < f.cols; x++) {
        const i = y * f.cols + x;
        if (!line[i]) continue;
        for (const py of parts) {
          for (const px of parts) {
            if (px.d[0] === 0 && py.d[0] === 0) continue; // 真ん中は線
            // 角の区画は 3 方向(横・縦・斜め)、辺の区画は 1 方向を見る
            const dxs = px.d[0] === 0 ? [0] : [0, px.d[0]];
            const dys = py.d[0] === 0 ? [0] : [0, py.d[0]];
            const col = marginColor(f, x, y, line, dxs, dys);
            if (!col) continue; // 黒のまま
            fullCtx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
            fullCtx.fillRect(x * C + px.o, y * C + py.o, px.n, py.n);
          }
        }
      }
    }

    fullCtx.fillStyle = cfg.LINE_COLOR;
    for (let y = 0; y < f.rows; y++) {
      for (let x = 0; x < f.cols; x++) {
        const i = y * f.cols + x;
        if (!line[i]) continue;
        const px = x * C + off;
        const py = y * C + off;
        fullCtx.fillRect(px, py, w, w);
        // 右・下の隣が線なら、そこまでつなぐ(平行に並んだ線どうしはつながない)
        if (x + 1 < f.cols && line[i + 1] && shouldConnect(f, line, x, y, false)) fullCtx.fillRect(px, py, C + w, w);
        if (y + 1 < f.rows && line[i + f.cols] && shouldConnect(f, line, x, y, true)) fullCtx.fillRect(px, py, w, C + w);
      }
    }
  }

  // ドット絵のキャッシュ(名前と左右反転ごと)
  // 主人公の絵は髪を黄色に色替えしたコピー(js/hair.js)、それ以外はドンキーパンクのまま
  const cache = {};
  let playerSet = null;
  function spriteData(name) {
    if (!playerSet) playerSet = PQ.hair.buildPlayerSprites();
    if (playerSet.sprites[name]) return { s: playerSet.sprites[name], pal: playerSet.palette };
    return { s: DP.sprites.DATA[name], pal: DP.sprites.PALETTE };
  }
  function bake(name, flip) {
    const key = name + (flip ? ':f' : '');
    if (cache[key]) return cache[key];
    const { s, pal } = spriteData(name);
    const cv = document.createElement('canvas');
    cv.width = s.w;
    cv.height = s.h;
    const c = cv.getContext('2d');
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const ch = s.rows[y][x];
        if (ch === '.' || !pal[ch]) continue;
        c.fillStyle = pal[ch];
        c.fillRect(flip ? s.w - 1 - x : x, y, 1, 1);
      }
    }
    cache[key] = cv;
    return cv;
  }

  // (cx, cy) を中心として描く
  function sprite(name, cx, cy, scale, flip) {
    const s = spriteData(name).s;
    const w = s.w * scale;
    const h = s.h * scale;
    ctx.drawImage(bake(name, flip), Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
  }

  function text(str, x, y, color, size, align, font) {
    ctx.fillStyle = color;
    ctx.font = `${size}px ${font || '"Press Start 2P", monospace'}`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(str, x, y);
  }

  function drawHud(g) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cfg.WIDTH, cfg.HUD_H);
    text('SCORE', 8, 6, '#ff3c3c', 8);
    text(String(g.score).padStart(6, '0'), 8, 20, '#fff', 10);
    text('HI', 120, 6, '#ffe83c', 8);
    text(String(g.hiScore).padStart(6, '0'), 120, 20, '#fff', 10);
    const pct = PQ.game.percent();
    text('AREA', 232, 6, '#3cf0ff', 8);
    text(`${pct.toFixed(1)}%/${cfg.CLEAR_PERCENT}%`, 232, 20, pct >= cfg.CLEAR_PERCENT ? '#3cff6e' : '#fff', 8);
    text(`ST${g.stage}`, 360, 6, '#ff3cc8', 8);
    // 残機: プレイ中の 1 人を除いた予備の数(残機 - 1)だけ、モヒカンの頭のアイコンを描く。
    // 内部の残機 g.lives は変えない(表示だけ)。開始時 2 個 → 1 回ミス 1 個 → 2 回ミス 0 個
    // 1UP で増えても画面の幅に収まるよう、アイコンは 3 個まで。4 人以上は「アイコン 1 個 + x人数」
    const spare = Math.max(0, g.lives - 1);
    const icons = spare > 3 ? 1 : spare;
    for (let i = 0; i < icons; i++) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(398 + i * 22, 2, 20, 26);
      ctx.clip();
      sprite('punkStand', 408 + i * 22, 22, 1, false);
      ctx.restore();
    }
    if (spare > 3) text(`x${spare}`, 422, 14, "#fff", 10); // ドット絵のフォントにある「x」
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, cfg.HUD_H - 2, cfg.WIDTH, 1);
  }

  function drawCrowd(crowds, ox, oy, g) {
    // 小さい(外側の)隊員から描き、中心の大きい隊員を手前にする(群衆が 2 つなら、まとめて大きさ順)
    const list = [].concat(...crowds.map((c) => c.members)).sort((a, b) => a.scale - b.scale);
    for (const m of list) {
      const step = Math.floor(m.walk / 8) % 2;
      const name = m.kind === 'cop' ? (step ? 'copWalkB' : 'copWalkA') : step ? 'riotB' : 'riotA';
      sprite(name, ox + m.x, oy + m.y, m.scale, m.dir < 0);
    }
  }

  let lastPlayerFrame = null; // 最後に描いた主人公の絵 { name, flip }
  function drawPlayer(p, ox, oy, g) {
    const c = PQ.player.center(p);
    // ミスの演出: 点滅しながらくるくる回る
    if (g.state === 'dying') {
      ctx.save();
      ctx.translate(ox + c.x, oy + c.y);
      ctx.rotate(g.timer * 0.3);
      if (Math.floor(g.timer / 4) % 2 === 0) sprite('punkJump', 0, 0, 1, p.dir < 0);
      ctx.restore();
      return;
    }
    // 上 = 背面、下 = 正面、左右 = 横向き(止まっているときは最後に動いた向きのまま)。js/punk-views.js
    const v = PunkViews.frameFor(p.face, { moving: p.walking, walkFrame: p.walkFrame, drawing: p.drawing });
    lastPlayerFrame = v; // テストで「どの絵を描いたか」を確かめるため(描画には使わない)
    // 足元が線の上に来るよう、少し上にずらして描く
    sprite(v.name, ox + c.x, oy + c.y - 6, 1, v.flip);
  }

  function center(str, y, color, size, font) {
    text(str, cfg.WIDTH / 2, y, color, size, 'center', font);
  }

  function draw(g) {
    const W = cfg.WIDTH;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, cfg.HEIGHT);
    drawHud(g);

    const ox = 0;
    const oy = cfg.HUD_H;
    if (g.field) {
      rebuildField(g.field);
      ctx.drawImage(fullCanvas, ox, oy);
      // 群衆はフィールドの中だけに描く(壁ぎわの大きな隊員の絵が上の HUD にはみ出さないように。見た目だけ)
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, cfg.COLS * cfg.CELL, cfg.ROWS * cfg.CELL);
      ctx.clip();
      drawCrowd(g.crowds, ox, oy, g);
      ctx.restore();
      drawPlayer(g.player, ox, oy, g);
      if (g.gainTimer > 0 && g.lastGain > 0) {
        center(`+${g.lastGain.toFixed(1)}%`, oy + 8, '#ffe83c', 10);
      }
      // 得点による 1UP の表示(約 1 秒。4 ステップごとに緑と白で点滅)
      if (g.oneUpTimer > 0) {
        center('1UP', oy + 26, Math.floor(g.oneUpTimer / 4) % 2 ? '#ffffff' : '#3cff6e', 14);
      }
    }

    const mid = oy + (cfg.ROWS * cfg.CELL) / 2;
    if (g.state === 'title') {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, oy, W, cfg.HEIGHT - oy);
      center('PUNKS QIX', mid - 90, '#ff2f6e', 28);
      center('パンクス・クイックス', mid - 48, '#3cf0ff', 18, '"DotGothic16", sans-serif');
      center('機動隊の群衆をかわして陣地を広げろ!', mid - 10, '#fff', 14, '"DotGothic16", sans-serif');
      center(`${cfg.CLEAR_PERCENT}% 獲得でステージクリア`, mid + 12, '#ffe83c', 14, '"DotGothic16", sans-serif');
      if (Math.floor(g.frame / 30) % 2 === 0) center('PUSH ENTER', mid + 56, '#fff', 12);
    } else if (g.state === 'ready') {
      center(`STAGE ${g.stage}`, mid - 20, '#ffe83c', 16);
      center('READY!', mid + 6, '#fff', 12);
    } else if (g.state === 'clear') {
      center('STAGE CLEAR!', mid - 30, '#3cff6e', 18);
      center(`${PQ.game.percent().toFixed(1)}%`, mid, '#fff', 12);
      if (g.clearBonus > 0) center(`BONUS +${g.clearBonus}`, mid + 22, '#ffe83c', 10);
    } else if (g.state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, oy, W, cfg.HEIGHT - oy);
      center('GAME OVER', mid - 20, '#ff3c3c', 20);
      if (Math.floor(g.frame / 30) % 2 === 0) center('PUSH ENTER', mid + 16, '#fff', 12);
    }
    if (!PQ.audio.isOn()) text('SOUND OFF', W - 6, cfg.HEIGHT - 12, '#888', 8, 'right');
    if (g.devMode) drawDev(g);
  }

  // DEV モード(URL に ?dev)のときだけ: フィールドの左上に今の面と使えるキー、無敵中は右上に INVINCIBLE
  function drawDev(g) {
    const oy = cfg.HUD_H;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(2, oy + 2, 232, 13);
    text(`DEV ST${g.stage}  1-9:面 C:クリア I:無敵`, 5, oy + 3, '#ffd23c', 10, 'left', '"DotGothic16", sans-serif');
    if (g.devInvincible) {
      const blink = Math.floor(g.frame / 15) % 2 === 0;
      text('INVINCIBLE', cfg.WIDTH - 6, oy + 5, blink ? '#ffd23c' : '#ff3c3c', 8, 'right');
    }
  }

  // テスト用: 線まで描き込んだフィールドの画像(キャラクターを重ねる前)
  function fieldImageCanvas(f) {
    rebuildField(f);
    return fullCanvas;
  }

  return { init, draw, fieldImageCanvas, lastPlayerFrame: () => lastPlayerFrame };
})();
