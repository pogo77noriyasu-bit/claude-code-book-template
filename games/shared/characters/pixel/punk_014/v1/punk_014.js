// punk_014 v1(公開済みのバージョンは変更しない。直すときは v2 を作る)
// 黄色リバティスパイク(family: yellow_liberty)の pixel 版。2026-11-21 に新規制作(元のゲームのデータの写しではない)
// 同じ人物の image 版 punk_008(PUNKS OLYMPIC)の立ち姿をもとに、特徴をそろえた: 四方に突き出す黄色の太いとげ・サングラス・ピアス・肩の赤いワッペン・黒い鋲ジャン・白い T・ジーンズ・白いソックス・赤い靴
// 主な色は punk_008 の立ち姿の画素の色。顔は skin_002 と同じ描き方。大きさ・体の比率は punk_001 と同じ 20×20(頭 11 行 + 体 9 行)。右向き、1 文字 = 1 ドット、'.' は透明
POGO77.characters.define({
  id: 'punk_014',
  version: 1,
  type: 'pixel',
  scale: 2,
  facing: 'right',
  palette: {
    Y: '#fceb6c',
    y: '#c8b040',
    S: '#fcc28a',
    s: '#c98e5e',
    K: '#050403',
    k: '#727271',
    G: '#d0cfcf',
    W: '#f9f9f9',
    C: '#ee2d26',
    J: '#2750c2',
    R: '#ee2d26',
    r: '#8a1a12'
  },
  frames: {
    stand: [
      '..Y.....Y.....Y.....',
      '...Y....Y....Y......',
      'Y..YY...Y...YY...Y..',
      '.YY.YY.YY..YY..YY...',
      '...YYYYYYYYYYYYY....',
      'YYYYYyYyYyYYYY......',
      '...YYYsSSSSSSS......',
      '....YYsSsSKKKK......',
      '.....YsSsSSSSSS.....',
      '.......sGSSSsS......',
      '........sSSSS.......',
      '.......KkKKkK.......',
      '......KCKWWKGS......',
      '......KKKWWKKS......',
      '......SKGWWGK.......',
      '.......JJJJJ........',
      '.......JJ.JJ........',
      '.......WW.WW........',
      '......RRR.RRR.......',
      '......rrr.rrrr......'
    ]
  },
  animations: {
    stand: [
      'stand'
    ]
  },
  variants: {}
});
