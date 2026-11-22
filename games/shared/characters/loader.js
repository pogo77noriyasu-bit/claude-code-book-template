// POGO77 GAMES 共通キャラクター: ローダー POGO77.characters
// キャラクター ID とバージョン(例: 'punk_001@1')から、pixel(ドット絵の文字列)と image(画像のシート)を
// 同じ書き方で描けるようにする。
//
// 使い方 1(http で配信しているとき。目録 catalog.json から場所を調べて読み込む):
//   <script src="../shared/characters/loader.js"></script>
//   const punk = await POGO77.characters.load('punk_001@1');
//   punk.draw(ctx, 'walk', frameNo, x, footY, { scale: 2, flip: true, variant: 'yellow' });
//
// 使い方 2(file:// でも動かしたいとき。素材のファイルを直接読み込む):
//   <script src="../shared/characters/loader.js"></script>
//   <script src="../shared/characters/pixel/punk_001/v1/punk_001.js"></script>
//   const punk = POGO77.characters.get('punk_001@1');
//
// ゲームは必ずバージョンを指定する(公開済みのバージョンの素材は変更しないので、指定したバージョンの見た目は変わらない)。
window.POGO77 = window.POGO77 || {};

POGO77.characters = (function () {
  const registry = {}; // 'id@version' → キャラクター
  // このファイルの場所(目録・素材の基準のディレクトリ)
  const selfSrc = document.currentScript && document.currentScript.src;
  let base = selfSrc ? selfSrc.replace(/[^/]*$/, '') : '';
  let catalogPromise = null;

  // 'punk_001@1' → { id, version }
  function parseRef(ref) {
    const m = /^([a-z]+_\d{3})(?:@(\d+))?$/.exec(String(ref));
    if (!m) throw new Error('キャラクター ID の形が正しくない: ' + ref);
    return { id: m[1], version: m[2] ? Number(m[2]) : null };
  }

  // ---- 素材のファイルから呼ばれる: キャラクターを登録する ----
  function define(def) {
    const key = def.id + '@' + def.version;
    if (registry[key]) return registry[key]; // 同じファイルを 2 回読み込んでも問題にしない
    const script = document.currentScript;
    const dir = script && script.src ? script.src.replace(/[^/]*$/, '') : base;
    const ch = def.type === 'image' ? imageCharacter(def, dir) : pixelCharacter(def);
    registry[key] = ch;
    return ch;
  }

  // ---- pixel: 1 文字 = 1 ドットの文字列。パレットはキャラクターごとに持つ ----
  function pixelCharacter(def) {
    const frames = {};
    for (const name of Object.keys(def.frames)) {
      const rows = def.frames[name];
      const w = Math.max(...rows.map((r) => r.length));
      frames[name] = { w, h: rows.length, rows: rows.map((r) => r.padEnd(w, '.')) };
    }
    const cache = {};

    // そのコマの各ドットの色(null = 透明)。variant は色違いの名前
    function colors(frame, variant) {
      const s = frames[frame];
      if (!s) throw new Error(def.id + ': コマがない: ' + frame);
      const v = variant ? def.variants && def.variants[variant] : null;
      if (variant && !v) throw new Error(def.id + ': 色違いがない: ' + variant);
      const pal = Object.assign({}, def.palette, v && v.type === 'palette' ? v.colors : null);
      const out = [];
      for (let y = 0; y < s.h; y++) {
        const line = [];
        for (let x = 0; x < s.w; x++) {
          const ch = s.rows[y][x];
          let c = ch === '.' ? null : pal[ch] || null;
          if (v && v.type === 'hair' && y < v.rows) {
            // 髪の色替え(PUNKS QIX・PUNKS WALK AND JUMP と同じ塗り方): 髪の行の中で、
            // 基本色のうち真上が透明なドット(毛先)はハイライト、陰影は陰影の色
            if (ch === v.from.base) c = (y > 0 ? s.rows[y - 1][x] : '.') === '.' ? v.colors.highlight : v.colors.base;
            else if (ch === v.from.shade) c = v.colors.shade;
          }
          line.push(c);
        }
        out.push(line);
      }
      return out;
    }

    // コマを 1 ドット = 1px のキャンバスに焼く(左右反転・色違いごとにキャッシュ)
    function bake(frame, opts) {
      opts = opts || {};
      const key = frame + '|' + (opts.flip ? 'f' : '') + '|' + (opts.variant || '');
      if (cache[key]) return cache[key];
      const s = frames[frame];
      const grid = colors(frame, opts.variant);
      const cv = document.createElement('canvas');
      cv.width = s.w;
      cv.height = s.h;
      const c = cv.getContext('2d');
      for (let y = 0; y < s.h; y++) {
        for (let x = 0; x < s.w; x++) {
          if (!grid[y][x]) continue;
          c.fillStyle = grid[y][x];
          c.fillRect(opts.flip ? s.w - 1 - x : x, y, 1, 1);
        }
      }
      cache[key] = cv;
      return cv;
    }

    function drawFrame(ctx, frame, x, footY, opts) {
      opts = opts || {};
      const scale = opts.scale || def.scale || 1;
      const s = frames[frame];
      const img = bake(frame, opts);
      const w = s.w * scale;
      const h = s.h * scale;
      const prev = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false; // ドットをぼかさない
      ctx.drawImage(img, Math.round(x - w / 2), Math.round(footY - h), w, h);
      ctx.imageSmoothingEnabled = prev;
    }

    return common(def, {
      frames,
      frameNames: Object.keys(frames),
      variantNames: Object.keys(def.variants || {}),
      variants: def.variants || {},
      palette: def.palette,
      colors,
      bake,
      drawFrame,
      size: (frame) => ({ w: frames[frame].w, h: frames[frame].h }),
      ready: () => Promise.resolve(),
    });
  }

  // ---- image: コマを横に並べたシート。コマ名は 'シート名.番号'(例: 'run.3') ----
  function imageCharacter(def, dir) {
    const images = {};
    let readyPromise = null;

    function ready() {
      if (!readyPromise) {
        readyPromise = Promise.all(
          Object.keys(def.sheets).map(
            (name) =>
              new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                  images[name] = img;
                  resolve();
                };
                img.onerror = () => reject(new Error(def.id + ': 画像を読み込めない: ' + def.sheets[name].src));
                img.src = dir + def.sheets[name].src;
              })
          )
        );
      }
      return readyPromise;
    }

    function parse(frame) {
      const i = frame.lastIndexOf('.');
      const sheet = def.sheets[frame.slice(0, i)];
      const index = Number(frame.slice(i + 1));
      if (!sheet || !(index >= 0 && index < sheet.count)) throw new Error(def.id + ': コマがない: ' + frame);
      return { name: frame.slice(0, i), sheet, index };
    }

    function drawFrame(ctx, frame, x, footY, opts) {
      opts = opts || {};
      const scale = opts.scale || def.scale || 1;
      const f = parse(frame);
      const img = images[f.name];
      if (!img) return; // 読み込み前は描かない(先に ready() を待つ)
      const w = f.sheet.w * scale;
      const h = f.sheet.h * scale;
      const dx = Math.round(x - w / 2);
      const dy = Math.round(footY - f.sheet.footRow * scale); // 足元の行を footY に合わせる
      const prev = ctx.imageSmoothingEnabled;
      // 原寸以上で描くときはドットをぼかさない。大きな画像を縮小して描くとき(scale < 1)だけ滑らかにする
      // (最近傍で大きく縮小すると線が欠けてギザギザになるため。PUNKS OLYMPIC の画像は 1.5 倍なので今までどおり)
      ctx.imageSmoothingEnabled = scale < 1;
      ctx.save();
      if (opts.flip) {
        ctx.translate(dx + w, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, f.index * f.sheet.w, 0, f.sheet.w, f.sheet.h, 0, 0, w, h);
      } else {
        ctx.drawImage(img, f.index * f.sheet.w, 0, f.sheet.w, f.sheet.h, dx, dy, w, h);
      }
      ctx.restore();
      ctx.imageSmoothingEnabled = prev;
    }

    const frameNames = [];
    for (const name of Object.keys(def.sheets)) for (let i = 0; i < def.sheets[name].count; i++) frameNames.push(name + '.' + i);
    return common(def, {
      sheets: def.sheets,
      frameNames,
      variantNames: [],
      drawFrame,
      size: (frame) => ({ w: parse(frame).sheet.w, h: parse(frame).sheet.h }),
      ready,
    });
  }

  // pixel・image に共通の部分: アニメーション名 + 何コマ目 で描く
  function common(def, ch) {
    return Object.assign(ch, {
      id: def.id,
      version: def.version,
      type: def.type,
      scale: def.scale || 1,
      facing: def.facing || 'right',
      animations: def.animations,
      // アニメーション anim の n コマ目(くり返す)のコマ名
      frameOf(anim, n) {
        const list = def.animations[anim];
        if (!list) throw new Error(def.id + ': アニメーションがない: ' + anim);
        return list[((n % list.length) + list.length) % list.length];
      },
      // (x, footY) を足元の中央として描く。opts: scale / flip / variant(pixel だけ)
      draw(ctx, anim, n, x, footY, opts) {
        ch.drawFrame(ctx, ch.frameOf(anim, n || 0), x, footY, opts);
      },
    });
  }

  // ---- 目録(catalog.json)----
  function catalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(base + 'catalog.json').then((r) => {
        if (!r.ok) throw new Error('catalog.json を読み込めない(' + r.status + ')');
        return r.json();
      });
    }
    return catalogPromise;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('読み込めない: ' + src));
      document.head.appendChild(s);
    });
  }

  // 'id@version' のキャラクターを読み込む(目録で場所を調べる)。バージョンを省略すると最新(図鑑用。ゲームでは指定すること)
  async function load(ref) {
    const r = parseRef(ref);
    const cat = await catalog();
    const entry = cat.characters.find((c) => c.id === r.id);
    if (!entry) throw new Error('目録にないキャラクター: ' + r.id);
    const version = r.version || entry.latest;
    const v = entry.versions[String(version)];
    if (!v) throw new Error(r.id + ': バージョンがない: ' + version);
    const key = r.id + '@' + version;
    if (!registry[key]) await loadScript(base + v.file);
    const ch = registry[key];
    if (!ch) throw new Error(key + ': 素材のファイルが define を呼んでいない');
    await ch.ready();
    return ch;
  }

  // 読み込み済みのキャラクター(バージョンの指定が必要)
  function get(ref) {
    const r = parseRef(ref);
    if (!r.version) throw new Error('バージョンを指定する(例: ' + r.id + '@1)');
    const ch = registry[r.id + '@' + r.version];
    if (!ch) throw new Error('読み込まれていない: ' + ref);
    return ch;
  }

  return {
    define,
    load,
    get,
    catalog,
    parseRef,
    list: () => Object.keys(registry),
    setBase(b) {
      base = b;
      catalogPromise = null;
    },
  };
})();
