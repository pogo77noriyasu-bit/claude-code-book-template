// PUNKS & SKINS RESCUE: 落ちてくるキャラクターの一覧と、味方・敵ごとの救助の判定(2026-11-22)
// - キャラクターを増やすときは PSR.CHARACTERS に 1 行足し、index.html でその素材(games/shared/characters/pixel/…)を読み込み、
//   js/config.js の KINDS(出てくるキャラクター)に id を足す。判定は side(ally / enemy)で決まるので、game.js は直さなくてよい
// - 絵は共通キャラクター(ローダー POGO77.characters)のドット絵。すべて 1 ドット = 5px(SPRITE_SCALE)で描く
window.PSR = window.PSR || {};

// 1 行 = 1 人。id はゲームの中の名前(テスト・snapshot で使う)、ref は共通キャラクターの ID@バージョン、frame は落ちているときのコマ
// variant: 共通素材にある色違い / palette: このゲームの中だけで替える色(共通素材のファイルは変えない)
PSR.CHARACTERS = [
  // 味方(パンクス・スキンズ 8 人): 受け止めて救急車へ運ぶと 100 点、助けられなかったら MISS
  { id: 'punk', name: '赤モヒカン', ref: 'punk_001@1', frame: 'jump', side: 'ally' },
  { id: 'green', name: '緑スパイキー', ref: 'punk_009@1', frame: 'stand', side: 'ally' },
  { id: 'leopard', name: 'レオパード', ref: 'punk_010@1', frame: 'stand', side: 'ally' },
  { id: 'blue', name: '青モヒカン', ref: 'punk_011@4', frame: 'stand', side: 'ally' },
  { id: 'pink', name: 'ピンクモヒカン', ref: 'punk_012@3', frame: 'stand', side: 'ally' },
  { id: 'purple', name: '紫ロングモヒカン', ref: 'punk_013@1', frame: 'stand', side: 'ally' },
  { id: 'yellow', name: '黄色リバティスパイク', ref: 'punk_014@1', frame: 'stand', side: 'ally' },
  { id: 'skin', name: 'スキンヘッズ', ref: 'skin_002@1', frame: 'stand', side: 'ally' },
  // 敵(警官・機動隊員 2 人): 受け止めてしまったら MISS、見逃せばセーフ
  // 元の紺の制服は 8 ビットのパレットだと夜空と同じ色になって見えにくいので、明るい青の制服にする
  { id: 'police', name: '警官', ref: 'police_001@2', frame: 'dizzy', side: 'enemy', variant: 'blue' },
  { id: 'riot', name: '機動隊員', ref: 'riot_001@2', frame: 'chute', side: 'enemy', palette: { N: '#1c4ec8', n: '#5a9cff' } },
];

// 味方・敵ごとの判定。catch = 担架で受け止めたとき、drop = 受け止めずに地面へ落ちたとき
//   bounce: 跳ね返して次の地点へ(最後は救急車へ。着いたら救助成功)/ miss: MISS / safe: セーフ(何も起きない)
PSR.SIDES = {
  ally: { catch: 'bounce', drop: 'miss' },
  enemy: { catch: 'miss', drop: 'safe' },
};

PSR.characters = (function () {
  const byId = {};
  for (const c of PSR.CHARACTERS) byId[c.id] = c;

  // id → キャラクター(ないときはエラー。書き間違いに早く気づくため)
  function get(id) {
    const c = byId[id];
    if (!c) throw new Error('キャラクターがいない: ' + id);
    return c;
  }
  const rule = (id) => PSR.SIDES[get(id).side];

  // このゲームの中だけで替える色を、共通素材のパレットに入れる(ページを開いたときに 1 回。絵を焼く前)
  function prepare() {
    for (const c of PSR.CHARACTERS) {
      if (!c.palette) continue;
      const ch = POGO77.characters.get(c.ref);
      Object.assign(ch.palette, c.palette);
    }
  }

  // 絵の大きさ(ドット)
  const size = (id) => POGO77.characters.get(get(id).ref).size(get(id).frame);

  return { get, rule, prepare, size, ids: () => PSR.CHARACTERS.map((c) => c.id) };
})();

PSR.characters.prepare();
