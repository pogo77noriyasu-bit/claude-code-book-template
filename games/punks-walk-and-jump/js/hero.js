// 主人公のドット絵(モヒカンの色を替えられる)
// 絵は既存のものをそのまま読み込んで使う(どちらのファイルも変更しない):
//   - 横向き: ドンキーパンクの DP.sprites.DATA(punkStand / punkWalk / punkJump)
//   - 正面・背面: PUNKS QIX の PunkViews.DATA(punkFront… / punkBack…)
// 髪の文字(R = 基本色、r = 陰影)だけを色替え用の文字に差し替えたコピーを作り、
// 色ごとに、その文字の色だけが違うパレットを用意する(絵の形は全色で共通)。
// 色は config.js の HAIR_COLORS / HERO_ORDER で決める(PUNKS QIX の js/hair.js と同じやり方)。
PW.hero = (function () {
  // 色替えに使う文字(ドンキーパンクのパレットにない文字)
  const KEY = { base: '1', shade: '2', highlight: '3' };
  const SIDE = ['punkStand', 'punkWalk', 'punkJump'];
  const VIEWS = ['punkFront', 'punkFrontWalkA', 'punkFrontWalkB', 'punkBack', 'punkBackWalkA', 'punkBackWalkB'];

  // 髪の色を差し替えたコピー。髪の行(上から hairRows 行)の中だけ替える。
  // 髪の基本色のうち、真上が透明なドット(毛先)はハイライトにする
  function recolor(s, hairRows) {
    const H = PunkViews.HAIR;
    const rows = s.rows.map((row, y) => {
      if (y >= hairRows) return row;
      let out = '';
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === H.base) out += (y > 0 ? s.rows[y - 1][x] : '.') === '.' ? KEY.highlight : KEY.base;
        else if (ch === H.shade) out += KEY.shade;
        else out += ch;
      }
      return out;
    });
    return { w: s.w, h: s.h, rows };
  }

  let sprites = null; // 色替え用の文字に差し替えた絵(全色で共通)
  const palettes = {}; // 色の名前 → パレット

  // 色 color(HAIR_COLORS の名前。省略すると登場順の先頭)の絵一式 { sprites: { 名前: {w,h,rows} }, palette }
  function build(color) {
    const name = color || PW.config.HERO_ORDER[0];
    if (!sprites) {
      sprites = {};
      for (const n of SIDE) sprites[n] = recolor(DP.sprites.DATA[n], PunkViews.HAIR_ROWS);
      for (const n of VIEWS) sprites[n] = recolor(PunkViews.DATA[n], PunkViews.HAIR_ROWS);
    }
    if (!palettes[name]) {
      const c = PW.config.HAIR_COLORS[name];
      if (!c) throw new Error('HAIR_COLORS にない色: ' + name);
      palettes[name] = Object.assign({}, DP.sprites.PALETTE, { [KEY.base]: c.base, [KEY.shade]: c.shade, [KEY.highlight]: c.highlight });
    }
    return { sprites, palette: palettes[name] };
  }

  // 面の中で n 人目(0 から)の主人公の色の名前。登場順をくり返す
  function colorAt(n) {
    const order = PW.config.HERO_ORDER;
    return order[((n % order.length) + order.length) % order.length];
  }

  return { build, colorAt, recolor, KEY, NAMES: SIDE.concat(VIEWS) };
})();
