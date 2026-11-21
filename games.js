// 公開しているゲームの一覧(トップページ index.html が読み込んで表示する)。
// ゲームを追加するときは、この配列に 1 件足すだけでよい(並べる場所はどこでもよい)。
// トップページは公開日 released の新しい順に並べ、いちばん新しいゲームを「NEW」付きの大きなカードで表示する。
// それまでの最新作は自動で通常のカードになる。
//
// 項目:
//   id          … 識別名(ディレクトリ名と同じにする)
//   title       … ゲーム名
//   path        … ゲームの URL(トップページからの相対パス。末尾は /)
//   released    … 公開日(YYYY-MM-DD)。並び順に使う
//   order       … 同じ公開日のゲームの順番(大きいほど新しい。同じ日に 1 本だけなら 1)
//   color       … カードの枠の色('cyan' / 'magenta' / 'green' / 'orange' / 'red' / 'yellow')
//   shot        … スクリーンショット(assets/screenshots/<id>.png。ゲームの canvas の解像度のまま)
//   description … 短い紹介文
//   note        … 補足(任意。操作の注意など)
window.GAME_LIST = [
  {
    id: 'breakout',
    title: 'ブロック崩し',
    path: 'games/breakout/',
    released: '2026-11-05',
    order: 1,
    color: 'cyan',
    shot: 'assets/screenshots/breakout.png',
    description: 'パドルでボールを打ち返して、ブロックをすべて壊そう。',
  },
  {
    id: 'meteor-dodge',
    title: '流星よけ',
    path: 'games/meteor-dodge/',
    released: '2026-11-05',
    order: 2,
    color: 'magenta',
    shot: 'assets/screenshots/meteor-dodge.png',
    description: '降ってくる隕石をよけながら、星を集める避けゲー。',
  },
  {
    id: 'hori-pon',
    title: 'ほりポン',
    path: 'games/hori-pon/',
    released: '2026-11-05',
    order: 3,
    color: 'green',
    shot: 'assets/screenshots/hori-pon.png',
    description: '土を掘り進み、モヒカンパンクが怒った女子をポンプでふくらませたりビールで潰したりする穴掘りアクション。',
  },
  {
    id: 'hoshimushi',
    title: 'ポリス vs パンクス',
    path: 'games/hoshimushi/',
    released: '2026-11-06',
    order: 1,
    color: 'orange',
    shot: 'assets/screenshots/hoshimushi.png',
    description: '編隊を組んで突撃してくるモヒカンパンクスを、POLICEマンが撃ち落とすシューティング。捕まったポリスを取り返すと2機合体!難易度も選べる。',
  },
  {
    id: 'kikori-mokuta',
    title: 'きこりのパンク',
    path: 'games/kikori-mokuta/',
    released: '2026-11-06',
    order: 2,
    color: 'green',
    shot: 'assets/screenshots/kikori-mokuta.png',
    description: '赤いモヒカンのパンク木こり・モク太が、ヘビやパンクなイノシシをよけてオノで木を切り倒す!安全ピンを集めて1UP、ビール缶でボーナス。',
  },
  {
    id: 'donkeypunk',
    title: 'ドンキーパンク',
    path: 'games/donkeypunk/',
    released: '2026-11-12',
    order: 1,
    color: 'magenta',
    shot: 'assets/screenshots/donkeypunk.png',
    description: '赤モヒカンのパンクスが鉄骨とハシゴを登り、ゴリラ警官が転がすビール瓶・缶をよけて、スキンヘッドガールを救出!Oi! Oi! Oi!',
    note: 'β版・全4面・PCキーボード用',
  },
  {
    id: 'punks-qix',
    title: 'PUNKS QIX',
    path: 'games/punks-qix/',
    released: '2026-11-15',
    order: 1,
    color: 'yellow',
    shot: 'assets/screenshots/punks-qix.png',
    description: '黄色モヒカンのパンクスが線を引いて陣地を囲む!うねって回る機動隊の群衆に線を触られたらミス。75%獲得でステージクリア。9面からは群衆が2つに!',
  },
  {
    id: 'punks-walk-and-jump',
    title: 'PUNKS WALK AND JUMP',
    path: 'games/punks-walk-and-jump/',
    released: '2026-11-15',
    order: 2,
    color: 'green',
    shot: 'assets/screenshots/punks-walk-and-jump.png',
    description: 'モヒカンのパンクスが、車の行き交う道路と川を 1 マスずつ跳んで渡る!丸太やいかだに乗って、ライブハウスの入口 5 か所をめざせ。入るたびにモヒカンが緑・黄・赤・青・ピンクに替わる。',
  },
  {
    id: 'naked-punk',
    title: 'NAKED PUNK',
    path: 'games/naked-punk/',
    released: '2026-11-16',
    order: 1,
    color: 'red',
    shot: 'assets/screenshots/naked-punk.png',
    description: 'ライブ中に裸になったパンクスが、夜のストリートへ飛び出した!警察官と機動隊、さらにパトカーや戦車まで迫る迷路で、ブーツ・ボンデージパンツ・Tシャツ・革ジャン・スタッズベルトを集めて元の姿に戻れ。ビールを飲めば反撃のチャンス!',
  },
  {
    // α版(2026-11-22 公開)。画像は AI 生成(制作者 NORI が公開を承認)。公開日は実際に公開する日に合わせる
    id: 'punks-olympic',
    title: 'PUNKS OLYMPIC',
    path: 'games/punks-olympic/',
    released: '2026-11-22',
    order: 1,
    color: 'yellow',
    shot: 'assets/screenshots/punks-olympic.png',
    description: '8人のパンクス・スキンズが大運動会で激突!100m走・あんパン食い競争・綱引き・玉入れ・缶蹴り・400mリレーの全6種目を、ボタン連打とタイミングで勝ち抜け!',
    // トップページのドット文字フォントでは α が読みにくいので「アルファ版」を添える
    note: 'α版(アルファ版)・全6種目・PC/スマートフォン対応',
  },
];

// 公開日の新しい順(同じ日は order の大きい順)に並べた一覧を返す。先頭が最新作
window.sortGames = function (list) {
  return list.slice().sort((a, b) => (a.released === b.released ? b.order - a.order : a.released < b.released ? 1 : -1));
};
