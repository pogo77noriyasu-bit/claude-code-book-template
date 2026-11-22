// punk_009 v1(公開済みのバージョンは変更しない。直すときは v2 を作る)
// 緑スパイキー(family: green_spiky)の pixel 版。2026-11-21 に新規制作(元のゲームのデータの写しではない)
// 同じ人物の image 版 punk_003(PUNKS OLYMPIC)の立ち姿をもとに、特徴をそろえた: 頭全体から四方に立つ緑のとげ・眉にかかる前髪・黒い鋲ジャン・黒っぽい T・ベルト・破れたジーンズ・黒いブーツ
// 主な色は punk_003 の立ち姿の画素の色。顔は skin_002 と同じ描き方。大きさ・体の比率は punk_001 と同じ 20×20(頭 11 行 + 体 9 行)。右向き、1 文字 = 1 ドット、'.' は透明
POGO77.characters.define({
  id: 'punk_009',
  version: 1,
  type: 'pixel',
  scale: 2,
  facing: 'right',
  palette: {
    V: '#8dc904',
    v: '#73b103',
    S: '#f8bc8b',
    s: '#c98e60',
    K: '#030302',
    G: '#d0cfcf',
    k: '#504f4e',
    t: '#2b2a2a',
    J: '#37598b',
    L: '#d0cfcf',
    b: '#6e6d6c'
  },
  frames: {
    stand: [
      '..V.....V...V.......',
      '...V...VV..VV...V...',
      'V..VV.VVVVVVV..VV...',
      '.VVVVVVvVVvVVVVV....',
      '..VVVvVVVvVVVVV.....',
      'VVVVvVVvVVVVVVVV....',
      '.VVVVVvSSVVVVS......',
      '..VVVVsSsSSSKS......',
      '...VVVsSsSSSSSS.....',
      '.......sSSSSsS......',
      '........sSSSS.......',
      '.......KkKKkK.......',
      '......KGKttKGS......',
      '......KKKttKKS......',
      '......SKGttGK.......',
      '.......kkkGk........',
      '.......JL.JJ........',
      '.......JJ.LJ........',
      '......KkK.KkK.......',
      '......bbb.bbbb......'
    ]
  },
  animations: {
    stand: [
      'stand'
    ]
  },
  variants: {}
});
