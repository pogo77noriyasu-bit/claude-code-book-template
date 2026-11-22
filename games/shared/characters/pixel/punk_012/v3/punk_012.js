// punk_012 v3(公開済みのバージョンは変更しない。直すときは v4 を作る)
// v2 の髪だけを描き直したもの: 横向きのモヒカンを前頭部から後頭部まで連続したなめらかな扇形に、正面・後ろ姿の帯をそれに合わせた。顔・服・体・パレットは v2 と同じ
// ピンクモヒカン(family: pink_mohawk)の pixel 版。2026-11-21 に新規制作(元のゲームのデータの写しではない)
// 同じ人物の image 版 punk_006(PUNKS OLYMPIC)の立ち姿をもとに、特徴をそろえた: 大きなピンクの扇形モヒカン(すじ入り)・剃った横・ピアス・黒い鋲ジャン・白い T・ジーンズ・白いソックス・赤い靴
// 主な色は punk_006 の立ち姿の画素の色。顔は skin_002 と同じ描き方。大きさ・体の比率は punk_001 と同じ 20×20(頭 11 行 + 体 9 行)。右向き、1 文字 = 1 ドット、'.' は透明
// tools/make-v3-fan.js が 2026-11-21 に v2 から書き出したもの
POGO77.characters.define({
  id: 'punk_012',
  version: 3,
  type: 'pixel',
  scale: 2,
  facing: 'right',
  palette: {
    P: '#f63d94',
    p: '#c22a72',
    S: '#fbc390',
    s: '#c98e60',
    K: '#040303',
    k: '#4a4948',
    G: '#d0cfcf',
    W: '#f8f7f7',
    J: '#1d5cba',
    R: '#e53222',
    r: '#8a1a12'
  },
  frames: {
    stand: [
      '.......PPPpP........',
      '.....PppPppPP.......',
      '....PPPpPpPPP.......',
      '....ppPpPPPPP.......',
      '...PPppPPPPPP.......',
      '...PPPPsSSSSS.......',
      '...PPPsSSSSKKS......',
      '...PPPsSsSSSKS......',
      '......sSsSSSSSS.....',
      '.......sGSSSsS......',
      '........sSSSS.......',
      '.......KkKKkK.......',
      '......KGKWWKGS......',
      '......KKKWWKKS......',
      '......SKGWWGK.......',
      '.......JJJJJ........',
      '.......JJ.JJ........',
      '.......WW.WW........',
      '......RRR.RRR.......',
      '......rrr.rrrr......'
    ],
    front: [
      '.........PP.........',
      '........pPPp........',
      '........pPPp........',
      '........pPPp........',
      '.......spPPps.......',
      '.......spPPps.......',
      '......sSpPPpSs......',
      '......SSpPPpSS......',
      '......SKSSSSKS......',
      '......SSSSSSSSG.....',
      '.......SSssSS.......',
      '......KKKSSKKK......',
      '.....KKGKWWKGKK.....',
      '.....KkKKWWKKkK.....',
      '.....SKKKWWKKKS.....',
      '.......JJJJJJ.......',
      '.......JJ..JJ.......',
      '.......WW..WW.......',
      '......RRR..RRR......',
      '......rrr..rrr......'
    ],
    back: [
      '.........PP.........',
      '........pPPp........',
      '........pPPp........',
      '........pPPp........',
      '.......spPPps.......',
      '.......spPPps.......',
      '......sSpPPpSs......',
      '......sSpPPpSs......',
      '......SSpPPpSS......',
      '.....GSSpPPpSS......',
      '.......SpPPpS.......',
      '......KKKKKKKK......',
      '.....KKKGKKGKKK.....',
      '.....KkKKGGKKkK.....',
      '.....SKKGKKGKKS.....',
      '.......JJJJJJ.......',
      '.......JJ..JJ.......',
      '.......WW..WW.......',
      '......RRR..RRR......',
      '......rrr..rrr......'
    ]
  },
  animations: {
    stand: [
      'stand'
    ],
    front: [
      'front'
    ],
    back: [
      'back'
    ]
  },
  variants: {}
});
