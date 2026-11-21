// 描画の小道具(文字・枠)。全画面で共通
PO.draw = (function () {
  const FONT = '"Arial Black", "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

  // 縁取り付きの文字。opt: size, color, align('left'|'center'|'right'), outline(縁の色), shadow(影の色), italic, base
  let boxes = null; // テスト用: 描いた文字の範囲を記録する(record(true) のときだけ)
  function text(ctx, str, x, y, opt) {
    const o = opt || {};
    const size = o.size || 24;
    ctx.save();
    ctx.font = (o.italic ? 'italic ' : '') + '900 ' + size + 'px ' + FONT;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'middle';
    if (boxes && str) {
      const w = ctx.measureText(str).width;
      const x0 = ctx.textAlign === 'center' ? x - w / 2 : ctx.textAlign === 'right' ? x - w : x;
      boxes.push({ str: String(str), x0, x1: x0 + w, y0: y - size / 2, y1: y + size / 2 });
    }
    ctx.lineJoin = 'round';
    if (o.shadow) {
      ctx.fillStyle = o.shadow;
      const d = Math.max(2, Math.round(size / 10));
      if (o.outline !== null) {
        ctx.strokeStyle = o.shadow;
        ctx.lineWidth = Math.max(3, size / 5);
        ctx.strokeText(str, x + d, y + d);
      }
      ctx.fillText(str, x + d, y + d);
    }
    if (o.outline !== null) {
      ctx.strokeStyle = o.outline || '#000';
      ctx.lineWidth = Math.max(3, size / 5);
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = o.color || '#fff';
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  // 角の四角い枠(ドット絵風)
  function panel(ctx, x, y, w, h, fill, border) {
    ctx.fillStyle = border || '#fff';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = fill || '#16183a';
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
  }

  // 背景用: 観客席の帯を横に並べて暗くしたもの(メニュー画面の背景)
  function menuBackdrop(ctx, t) {
    const C = PO.config;
    const im = PO.assets.get('stands');
    const off = Math.floor((t * 20) % im.width);
    ctx.fillStyle = '#0b0c22';
    ctx.fillRect(0, 0, C.W, C.H);
    for (let x = -off; x < C.W; x += im.width) {
      ctx.drawImage(im, x, 0);
      ctx.drawImage(im, x, C.H - im.height);
    }
    ctx.fillStyle = 'rgba(8, 8, 30, 0.72)';
    ctx.fillRect(0, 0, C.W, C.H);
  }

  // 1st / 2nd / 3rd / 4th
  function ordinal(n) {
    return n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH');
  }

  // 累積スコア(1UP)とハイスコア(HI-SCORE)の表示(1980 年代のアーケード風。2026-11-19)
  //   mode 'corner': 左上の角(タイトル・キャラクター選択・種目選択・リザルト・表彰式・GAME OVER)
  //   mode 'strip' : 画面の下の芝の上に横 1 行(競技画面。上は種目の HUD が使っている。右下の TARGET の札の左)
  //   shown: 1UP に出す点(リザルトのカウントアップの途中の値。省略時はいまの累積スコア)。点は最低 6 桁のゼロ埋め、大きい点は桁を増やす
  function scores(ctx, mode, shown) {
    const up = PO.score.text(shown == null ? PO.score.current : shown);
    const hi = PO.score.text(Math.max(PO.score.hi, shown || 0));
    // 文字の幅を測って並べる(100 万点以上で桁が増えても重ならない)
    const wOf = (str, size) => {
      ctx.save();
      ctx.font = '900 ' + size + 'px ' + FONT;
      const w = ctx.measureText(str).width;
      ctx.restore();
      return w;
    };
    if (mode === 'strip') {
      const x = 8;
      const y = 690;
      const x1 = x + 8 + wOf('1UP', 15) + 6;
      const x2 = x1 + wOf(up, 15) + 16;
      const x3 = x2 + wOf('HI-SCORE', 15) + 6;
      const w = x3 + wOf(hi, 15) + 8 - x;
      ctx.fillStyle = 'rgba(16, 18, 46, 0.85)';
      ctx.fillRect(x, y, w, 24);
      text(ctx, '1UP', x + 8, y + 12, { size: 15, color: '#ff5cc8', outline: null });
      text(ctx, up, x1, y + 12, { size: 15, color: '#fff', outline: null });
      text(ctx, 'HI-SCORE', x2, y + 12, { size: 15, color: '#ffe600', outline: null });
      text(ctx, hi, x3, y + 12, { size: 15, color: '#fff', outline: null });
      return;
    }
    const hx = 14 + Math.max(wOf('1UP', 15), wOf(up, 17)) + 22;
    text(ctx, '1UP', 14, 12, { size: 15, color: '#ff5cc8' });
    text(ctx, up, 14, 31, { size: 17, color: '#fff' });
    text(ctx, 'HI-SCORE', hx, 12, { size: 15, color: '#ffe600' });
    text(ctx, hi, hx, 31, { size: 17, color: '#fff' });
  }

  // テスト用: 文字の範囲の記録を始める(true)・やめる(false)。records() で記録を返す
  function record(on) {
    boxes = on ? [] : null;
  }
  return { text, panel, menuBackdrop, ordinal, scores, FONT, record, records: () => boxes };
})();
