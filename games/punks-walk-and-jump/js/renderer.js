// 描画だけ(状態は変更しない)
// 主人公はドンキーパンク・PUNKS QIX のドット絵のモヒカンの色を替えたもの(js/hero.js。色は g.heroColor)。
// 車・浮遊物・ライブハウスは、このゲーム用に新しく描いたドット絵(整数座標の四角を組み合わせて描く。
// 長さの違う車や浮遊物を同じ描き方で描けるように、文字列のドット絵ではなく描画の手順で持つ)。
PW.renderer = (function () {
  const cfg = PW.config;
  let ctx = null;
  const T = cfg.TILE;
  const rowY = (r) => cfg.ROW0_Y + r * T;

  function init(canvas) {
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function text(str, x, y, color, size, align, font) {
    ctx.fillStyle = color;
    ctx.font = `${size}px ${font || '"Press Start 2P", monospace'}`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(str, x, y);
  }
  const center = (str, y, color, size, font) => text(str, cfg.WIDTH / 2, y, color, size, 'center', font);
  const JA = '"DotGothic16", sans-serif';

  // ---- 主人公のドット絵。絵ごと・左右反転ごと・モヒカンの色ごとにオフスクリーンへ焼いておく ----
  const cache = {};
  function bake(name, flip, color) {
    const key = name + (flip ? ':f' : '') + ':' + color;
    if (cache[key]) return cache[key];
    const { sprites, palette } = PW.hero.build(color);
    const s = sprites[name];
    const cv = document.createElement('canvas');
    cv.width = s.w;
    cv.height = s.h;
    const c = cv.getContext('2d');
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const ch = s.rows[y][x];
        if (ch === '.' || !palette[ch]) continue;
        c.fillStyle = palette[ch];
        c.fillRect(flip ? s.w - 1 - x : x, y, 1, 1);
      }
    }
    cache[key] = cv;
    return cv;
  }
  // (cx, footY) を足元の中央として描く。color はモヒカンの色(HAIR_COLORS の名前)
  function sprite(name, cx, footY, flip, color) {
    const img = bake(name, flip, color);
    ctx.drawImage(img, Math.round(cx - img.width / 2), Math.round(footY - img.height));
  }

  // 向きと跳んでいるかで絵を選ぶ(上 = 背面、下 = 正面、左右 = 横向き。止まっているときは最後の向きのまま)
  function heroFrame(p) {
    const hopping = !!p.hop;
    const step = p.hops % 2;
    if (p.face === 'up') return { name: hopping ? (step ? 'punkBackWalkA' : 'punkBackWalkB') : 'punkBack', flip: false };
    if (p.face === 'down') return { name: hopping ? (step ? 'punkFrontWalkA' : 'punkFrontWalkB') : 'punkFront', flip: false };
    return { name: hopping ? 'punkWalk' : 'punkStand', flip: p.face === 'left' };
  }

  // ---- 背景 ----
  function drawHud(g) {
    rect(0, 0, cfg.WIDTH, cfg.HUD_H, '#000');
    text('SCORE', 6, 5, '#ff3c3c', 8);
    text(String(g.score).padStart(6, '0'), 6, 19, '#fff', 10);
    text('HI', 104, 5, '#ffe83c', 8);
    text(String(g.hiScore).padStart(6, '0'), 104, 19, '#fff', 10);
    text(`ST${g.stage}`, 204, 5, '#ff3cc8', 8);
    // 残機: プレイ中の 1 人を除いた予備の人数だけ、モヒカンの頭のアイコンを描く(3 個まで。4 人以上は数字)
    const spare = Math.max(0, g.lives - 1);
    const icons = spare > 3 ? 1 : spare;
    for (let i = 0; i < icons; i++) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(262 + i * 22, 2, 20, 24);
      ctx.clip();
      sprite('punkStand', 272 + i * 22, 30, false, g.heroColor); // 予備の人数のアイコンは、いまの主人公の色
      ctx.restore();
    }
    if (spare > 3) text(`x${spare}`, 286, 12, '#fff', 8);
  }

  // ライブハウスの建物(看板と、入口が 5 つ並んだ壁)
  function drawLiveHouse(g) {
    const top = cfg.HUD_H;
    // れんがの壁
    rect(0, top, cfg.WIDTH, cfg.ROW0_Y + T - top, '#4a1a1a');
    for (let y = top; y < cfg.ROW0_Y + T; y += 6) {
      const off = ((y - top) / 6) % 2 ? 6 : 0;
      for (let x = -off; x < cfg.WIDTH; x += 12) rect(x, y, 11, 5, '#5e2424');
    }
    // ネオンの看板「LIVE HOUSE」(ゆっくり点滅)
    const on = Math.floor(g.frame / 40) % 4 !== 3;
    rect(90, top + 6, 180, 26, '#101018');
    rect(90, top + 6, 180, 2, '#ff2f6e');
    rect(90, top + 30, 180, 2, '#ff2f6e');
    center('LIVE HOUSE', top + 13, on ? '#3cf0ff' : '#1a5a66', 12);
    // 入口
    cfg.DOOR_COLS.forEach((col, i) => {
      const x = col * T;
      const y = rowY(cfg.GOAL_ROW);
      rect(x - 3, y - 4, T + 6, T + 4, '#2a2a2a'); // 入口の枠
      rect(x, y, T, T, '#0a0a0a'); // 中は暗い
      rect(x + 4, y - 3, T - 8, 2, g.doors[i] ? '#3cff6e' : '#ffd23c'); // 入口の上の明かり(ゴール済みは緑)
      // ゴール済みの入口には、入ったときの色のパンクス
      if (g.doors[i]) sprite('punkFront', x + T / 2, y + T, false, g.doorColors[i] || PW.hero.colorAt(0));
    });
  }

  function drawGround(g) {
    // 川(5 レーン)。さざ波が流れる
    const r1 = cfg.RIVER_ROWS[0];
    rect(0, rowY(r1), cfg.WIDTH, T * cfg.RIVER_ROWS.length, '#0c2a6e');
    for (const r of cfg.RIVER_ROWS) {
      const lane = g.lanes.byRow[r];
      const shift = Math.floor((g.lanes.t * lane.speed * lane.dir) % 40);
      for (let x = -40; x < cfg.WIDTH + 40; x += 40) {
        rect(x + shift + ((r * 13) % 40), rowY(r) + 6 + (r % 2) * 8, 8, 1, '#2c5ab8');
      }
    }
    // 安全地帯(歩道)
    drawSidewalk(rowY(cfg.SAFE_ROW));
    // 道路(5 レーン)。レーンの区切りの白い破線
    const rr = cfg.ROAD_ROWS[0];
    rect(0, rowY(rr), cfg.WIDTH, T * cfg.ROAD_ROWS.length, '#24242c');
    for (let i = 1; i < cfg.ROAD_ROWS.length; i++) {
      const y = rowY(rr + i) - 1;
      for (let x = 4; x < cfg.WIDTH; x += 24) rect(x, y, 12, 2, '#d8d8d8');
    }
    // スタート地点(歩道)
    drawSidewalk(rowY(cfg.START_ROW));
  }

  function drawSidewalk(y) {
    rect(0, y, cfg.WIDTH, T, '#6a6a74');
    for (let x = 0; x < cfg.WIDTH; x += 24) {
      rect(x, y + 2, 23, T - 4, '#7c7c88');
    }
    rect(0, y, cfg.WIDTH, 2, '#9a9aa8'); // 縁石
    rect(0, y + T - 2, cfg.WIDTH, 2, '#4a4a54');
  }

  // ---- 車(右へ進む車は右が前) ----
  const CAR_COLORS = ['#d83030', '#3070e0', '#e8e8e8', '#30b050'];
  function drawVehicle(o, lane, t) {
    const x = Math.round(o.x);
    const y = rowY(lane.row) + 3;
    const w = o.len;
    const front = lane.dir > 0; // true なら右が前
    const fx = (dx, ww) => (front ? x + dx : x + w - dx - ww); // 前から dx の位置(前が右のとき)
    const wheels = () => {
      rect(x + 3, y + 14, 6, 4, '#000');
      rect(x + w - 9, y + 14, 6, 4, '#000');
    };
    const lights = () => {
      rect(fx(w - 2, 2), y + 8, 2, 3, '#fff6a0'); // 前のライト
      rect(fx(0, 2), y + 8, 2, 3, '#ff3030'); // 後ろのライト
    };
    if (o.kind === 'car' || o.kind === 'taxi' || o.kind === 'police') {
      let body = CAR_COLORS[o.index % CAR_COLORS.length];
      if (o.kind === 'taxi') body = '#f0c020';
      if (o.kind === 'police') body = '#f0f0f0';
      rect(x + 1, y + 6, w - 2, 9, body); // 車体
      if (o.kind === 'police') rect(x + 1, y + 11, w - 2, 4, '#141414'); // 白黒の車体
      if (o.kind === 'taxi') for (let k = x + 2; k < x + w - 2; k += 4) rect(k, y + 11, 2, 2, '#141414'); // 市松の帯
      rect(fx(w * 0.25, w * 0.5), y + 1, w * 0.5, 6, body); // 屋根
      rect(fx(w * 0.25 + 2, w * 0.5 - 4), y + 2, w * 0.5 - 4, 4, '#7ac8f0'); // 窓
      if (o.kind === 'taxi') rect(fx(w * 0.5 - 4, 8), y - 2, 8, 3, '#fff'); // 屋根の行灯
      if (o.kind === 'police') {
        const blink = Math.floor(t / 8) % 2;
        rect(fx(w * 0.5 - 6, 6), y - 2, 6, 3, blink ? '#ff2020' : '#601010'); // 赤色灯
        rect(fx(w * 0.5, 6), y - 2, 6, 3, blink ? '#102060' : '#3060ff');
      }
      lights();
      wheels();
    } else if (o.kind === 'truck') {
      const cab = T;
      rect(fx(w - cab, cab), y + 2, cab, 13, '#f08020'); // 運転席
      rect(fx(w - cab + 12, 9), y + 4, 9, 5, '#7ac8f0'); // 窓
      rect(fx(0, w - cab - 2), y, w - cab - 2, 15, '#c8ccd4'); // 荷台
      rect(fx(0, w - cab - 2), y + 6, w - cab - 2, 2, '#ff6060'); // 荷台の帯
      lights();
      wheels();
      rect(x + w / 2 - 3, y + 14, 6, 4, '#000');
    } else if (o.kind === 'riot') {
      // 機動隊の護送車: 紺色の箱型。窓に金網、屋根に赤色灯
      rect(x + 1, y, w - 2, 15, '#1d2c74');
      rect(x + 1, y + 11, w - 2, 2, '#c8ccd4'); // 白い帯
      for (let k = 6; k < w - 12; k += 10) {
        rect(fx(k, 8), y + 3, 8, 6, '#0a0a1a');
        for (let m = 0; m < 8; m += 2) rect(fx(k, 8) + m, y + 3, 1, 6, '#5a6aa0'); // 金網
      }
      rect(fx(w - 10, 7), y + 3, 7, 6, '#7ac8f0'); // 運転席の窓
      const blink = Math.floor(t / 10) % 2;
      rect(fx(w - 14, 5), y - 2, 5, 3, blink ? '#ff2020' : '#601010');
      lights();
      wheels();
      rect(x + w / 2 - 3, y + 14, 6, 4, '#000');
    }
  }

  // ---- 川の浮遊物 ----
  function drawFloat(o, lane, L, t) {
    const x = Math.round(o.x);
    const y = rowY(lane.row) + 3;
    const w = o.len;
    if (o.kind === 'log') {
      rect(x, y + 2, w, 15, '#7a4a22');
      rect(x, y + 2, w, 2, '#a06a36'); // 上の明るい面
      for (let k = 8; k < w - 6; k += 14) rect(x + k, y + 8, 6, 1, '#5a3416'); // 木目
      rect(x, y + 3, 4, 13, '#c89a5a'); // 切り口
      rect(x + w - 4, y + 3, 4, 13, '#c89a5a');
      rect(x + 1, y + 8, 2, 3, '#8a5a2a');
      rect(x + w - 3, y + 8, 2, 3, '#8a5a2a');
    } else if (o.kind === 'raft') {
      for (let k = 0; k < w; k += 6) rect(x + k, y + 1, 5, 17, (k / 6) % 2 ? '#9a6830' : '#b07a3a'); // 板
      rect(x, y + 5, w, 2, '#3a2a14'); // 縄
      rect(x, y + 12, w, 2, '#3a2a14');
    } else if (o.kind === 'drum') {
      const st = PW.lanes.floatState(L, o);
      if (st === 'down') {
        // 沈んでいる: 水面に波紋だけ
        for (let k = 0; k < w; k += T) rect(x + k + 4, y + 9, 16, 2, '#4a7ad8');
        return;
      }
      if (st === 'warn' && Math.floor(t / 6) % 2) {
        // 沈む前の予告: 点滅しながら半分沈んだ絵
        for (let k = 0; k < w; k += T) {
          rect(x + k + 3, y + 8, 18, 9, '#802010');
          rect(x + k + 3, y + 8, 18, 2, '#d8d8d8');
        }
        return;
      }
      rect(x + 2, y + 8, w - 4, 3, '#5a3a1a'); // つなぎの板
      for (let k = 0; k < w; k += T) {
        rect(x + k + 3, y + 1, 18, 16, '#c03020'); // ドラム缶
        rect(x + k + 3, y + 1, 18, 2, '#d8d8d8'); // 上下の輪
        rect(x + k + 3, y + 15, 18, 2, '#d8d8d8');
        rect(x + k + 3, y + 8, 18, 1, '#801810');
        rect(x + k + 6, y + 3, 2, 11, '#e06050'); // 光
      }
    }
  }

  // ---- 主人公 ----
  function drawHero(g) {
    const p = g.player;
    const foot = rowY(PW.player.rowF(p)) + T - 2;
    if (g.state === 'dying') {
      const k = g.timer;
      if (g.death === 'water' || g.death === 'swept') {
        // 水しぶきの輪が広がり、主人公が沈む
        const r = 4 + k * 0.4;
        ctx.strokeStyle = '#a8d8ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(Math.round(p.x), foot - 4, r, r * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (k < 30) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, cfg.WIDTH, foot - 2);
          ctx.clip();
          const f = heroFrame(p);
          sprite(f.name, p.x, foot + k * 0.6, f.flip, g.heroColor);
          ctx.restore();
        }
      } else {
        // 衝突: 点滅しながら星が飛び散る
        if (Math.floor(k / 4) % 2 === 0) {
          const f = heroFrame(p);
          sprite(f.name, p.x, foot, f.flip, g.heroColor);
        }
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 * i) / 8;
          const d = 4 + k * 0.5;
          rect(p.x + Math.cos(a) * d - 1, foot - 10 + Math.sin(a) * d - 1, 3, 3, i % 2 ? '#ffe83c' : '#fff');
        }
      }
      return;
    }
    if (g.state === 'goal' || g.state === 'clear') return; // ゴールした主人公は入口の中に描く(クリア中も)
    const f = heroFrame(p);
    sprite(f.name, p.x, foot - PW.player.lift(p), f.flip, g.heroColor);
  }

  // 残り時間のゲージ
  function drawTimer(g) {
    const y = rowY(cfg.START_ROW) + T;
    rect(0, y, cfg.WIDTH, cfg.HEIGHT - y, '#000');
    text('TIME', 8, y + 8, '#ffe83c', 8);
    const max = cfg.TIME_LIMIT * 60;
    const k = Math.max(0, Math.min(1, g.timeLeft / max));
    const w = 280;
    rect(56, y + 6, w + 4, 12, '#404048');
    rect(58, y + 8, w, 8, '#101014');
    const color = k > 0.5 ? '#3cff6e' : k > 0.2 ? '#ffd23c' : '#ff3c3c';
    rect(58, y + 8, Math.round(w * k), 8, color);
  }

  function draw(g) {
    rect(0, 0, cfg.WIDTH, cfg.HEIGHT, '#000');
    drawHud(g);
    drawLiveHouse(g);
    if (g.lanes) {
      drawGround(g);
      const t = g.frame;
      for (const lane of g.lanes.list) {
        for (const o of lane.objects) {
          if (o.x + o.len < 0 || o.x > cfg.WIDTH) continue;
          if (lane.type === 'river') drawFloat(o, lane, g.lanes, t);
          else drawVehicle(o, lane, t);
        }
      }
    }
    if (g.player && g.state !== 'title' && g.state !== 'gameover') drawHero(g);
    drawTimer(g);

    // ゴールしたときの得点
    if (g.state === 'goal' && g.lastDoor >= 0) {
      const x = cfg.DOOR_COLS[g.lastDoor] * T + T / 2;
      text(`+${g.lastBonus}`, Math.min(cfg.WIDTH - 40, Math.max(40, x)), rowY(1) + 4, '#ffe83c', 8, 'center');
    }
    // 得点による 1UP の表示(約 1 秒。4 ステップごとに緑と白で点滅)。STAGE CLEAR の文字と重ならないよう川の上に出す
    if (g.oneUpTimer > 0) {
      center('1UP', rowY(3) + 4, Math.floor(g.oneUpTimer / 4) % 2 ? '#ffffff' : '#3cff6e', 14);
    }

    const mid = rowY(cfg.SAFE_ROW);
    if (g.state === 'title') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, cfg.HUD_H, cfg.WIDTH, cfg.HEIGHT - cfg.HUD_H);
      center('PUNKS', mid - 110, '#3cdc3c', 20);
      center('WALK AND JUMP', mid - 82, '#ff2f6e', 16);
      center('パンクス・ウォーク・アンド・ジャンプ', mid - 52, '#3cf0ff', 14, JA);
      center('車と川をこえて、', mid - 18, '#fff', 14, JA);
      center('ライブハウスの入口 5 か所をめざせ!', mid + 2, '#fff', 14, JA);
      // スマホ(タッチボタンを出す画面)ではボタンとタップの案内にする
      const touch = document.documentElement.classList.contains('touch-ui');
      center(touch ? '▲▼◀▶ ボタンで 1 マスずつジャンプ' : '↑↓←→ で 1 マスずつジャンプ', mid + 30, '#a8a8c8', 12, JA);
      if (Math.floor(g.frame / 30) % 2 === 0) center(touch ? 'TAP TO START' : 'PUSH ENTER', mid + 62, '#ffe83c', 10);
    } else if (g.state === 'ready') {
      center(`STAGE ${g.stage}`, mid + 2, '#ffe83c', 14);
      center('READY!', mid + 26, '#fff', 10);
    } else if (g.state === 'clear') {
      center('STAGE CLEAR!', mid + 2, '#3cff6e', 16);
      center(`BONUS +${cfg.score.clear}`, mid + 28, '#ffe83c', 10);
    } else if (g.state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, cfg.HUD_H, cfg.WIDTH, cfg.HEIGHT - cfg.HUD_H);
      center('GAME OVER', mid - 10, '#ff3c3c', 20);
      if (Math.floor(g.frame / 30) % 2 === 0) center('PUSH ENTER', mid + 30, '#fff', 10);
    }
    if (g.devMode) {
      // DEV モード: 下の時間ゲージの欄に、今の面と使えるキー。無敵中は INVINCIBLE
      const y = cfg.HEIGHT - 11;
      text(`DEV ST${g.stage} 1-9:面 C:クリア I:無敵`, 8, y, '#ffd23c', 10, 'left', JA);
      if (g.devInvincible) text('INVINCIBLE', cfg.WIDTH - 6, y + 2, Math.floor(g.frame / 15) % 2 ? '#ffd23c' : '#ff3c3c', 6, 'right');
    }
    if (!PW.audio.isOn()) text('SOUND OFF', cfg.WIDTH - 4, 31, '#888', 6, 'right');
  }

  return { init, draw, heroFrame, rowY };
})();
