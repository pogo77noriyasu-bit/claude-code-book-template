// punk_013 v1(公開済みのバージョンは変更しない。直すときは v2 を作る)
// 紫ロングモヒカン(family: purple_long)の pixel 版。2026-11-21 に新規制作(元のゲームのデータの写しではない)
// 同じ人物の image 版 punk_007(PUNKS OLYMPIC)の立ち姿をもとに、特徴をそろえた: 紫の扇形モヒカンから背中へ流れる長い髪・ピアス・黒い鋲ジャン・白い T・ジーンズ・白いソックス・赤い靴
// 主な色は punk_007 の立ち姿の画素の色。顔は skin_002 と同じ描き方。大きさ・体の比率は punk_001 と同じ 20×20(頭 11 行 + 体 9 行)。右向き、1 文字 = 1 ドット、'.' は透明
POGO77.characters.define({
  id: 'punk_013',
  version: 1,
  type: 'pixel',
  scale: 2,
  facing: 'right',
  palette: {
    M: '#d523f3',
    m: '#a018c0',
    S: '#fbc794',
    s: '#c99060',
    K: '#040304',
    k: '#4d4c4c',
    G: '#d0cfcf',
    W: '#f8f8f8',
    J: '#225bba',
    R: '#e93c29',
    r: '#8a1a12'
  },
  frames: {
    stand: [
      '........M.M.........',
      '.....M.MMMMM........',
      '....MMMmMmMMM.......',
      '..MMMmMMmMMMM.......',
      '.MMmMMmMMmMM........',
      'MMmMMmMsSSSSS.......',
      '.MMmMMsSSSSKKS......',
      '..MMmMsSsSSSKS......',
      '..MmMMsSsSSSSSS.....',
      '...MmM.sGSSSsS......',
      '...MM...sSSSS.......',
      '....Mm.KkKKkK.......',
      '....M.KGKWWKGS......',
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
