// 主人公の髪(モヒカン)の色替え(横向き・正面・背面のすべての絵)
// ドンキーパンクのドット絵データ(DP.sprites.DATA)はそのまま残し、読み込んだあとに
// 「髪の色の文字」だけを別の色に差し替えたコピーを作って使う(ドンキーパンク側は一切変えない)。
// 色は config.js の HAIR_COLORS で決めるので、ほかのゲームでも定数を変えるだけで色を替えられる。
PQ.hair = (function () {
  // 色替えに使う文字(ドンキーパンクのパレットにない文字を使う)
  const KEY = { base: '1', shade: '2', highlight: '3' };

  // 元のスプライト s(rows の配列)から、髪の色を差し替えたスプライトを作る。
  //   source: 元の髪の色の文字 { base: 'R', shade: 'r' }
  //   hairRows: 髪がある上からの行数(この範囲の文字だけ差し替える。体に同じ文字があっても変えない)
  // ハイライト: 髪の基本色のドットのうち、真上が透明なドット(毛先・トゲの先)を明るい色にする
  function recolorSprite(s, source, hairRows) {
    const rows = s.rows.map((row, y) => {
      if (y >= hairRows) return row;
      let out = '';
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === source.base) {
          const above = y > 0 ? s.rows[y - 1][x] : '.';
          out += above === '.' ? KEY.highlight : KEY.base;
        } else if (ch === source.shade) {
          out += KEY.shade;
        } else {
          out += ch;
        }
      }
      return out;
    });
    return { w: s.w, h: s.h, rows };
  }

  // 色替えに使うパレット(元のパレット + 髪の 3 色)
  function palette(basePalette, colors) {
    return Object.assign({}, basePalette, {
      [KEY.base]: colors.base,
      [KEY.shade]: colors.shade,
      [KEY.highlight]: colors.highlight,
    });
  }

  // 元の絵を探す: 横向きはドンキーパンクのデータ、正面・背面は PunkViews(js/punk-views.js)
  function sourceSprite(name) {
    const s = DP.sprites.DATA[name] || (window.PunkViews && PunkViews.DATA[name]);
    if (!s) throw new Error('主人公の絵が見つからない: ' + name);
    return s;
  }

  // 主人公のスプライト一式を作る。返り値: { sprites: { 名前: {w,h,rows} }, palette }
  function buildPlayerSprites() {
    const cfg = PQ.config.hair;
    const sprites = {};
    for (const name of cfg.sprites) {
      sprites[name] = recolorSprite(sourceSprite(name), cfg.source, cfg.hairRows);
    }
    return { sprites, palette: palette(DP.sprites.PALETTE, PQ.config.HAIR_COLORS) };
  }

  return { recolorSprite, palette, buildPlayerSprites, sourceSprite, KEY };
})();
