// punk_010 v1(公開済みのバージョンは変更しない。直すときは v2 を作る)
// レオパード(family: leopard)の pixel 版。2026-11-21 に新規制作(元のゲームのデータの写しではない)
// 同じ人物の image 版 punk_004(PUNKS OLYMPIC)の立ち姿をもとに、特徴をそろえた: ヒョウ柄の大きな丸い髪・ヒョウ柄の上着・黒っぽい T・ベルト・紫のズボン・茶色のブーツ
// 主な色は punk_004 の立ち姿の画素の色。顔は skin_002 と同じ描き方。大きさ・体の比率は punk_001 と同じ 20×20(頭 11 行 + 体 9 行)。右向き、1 文字 = 1 ドット、'.' は透明
POGO77.characters.define({
  id: 'punk_010',
  version: 1,
  type: 'pixel',
  scale: 2,
  facing: 'right',
  palette: {
    O: '#f6b802',
    K: '#040301',
    S: '#fbbc85',
    s: '#aa6c4b',
    k: '#4b3103',
    t: '#252424',
    G: '#d0cfcf',
    P: '#811ebb',
    p: '#5a1488',
    B: '#9a321c',
    b: '#271906'
  },
  frames: {
    stand: [
      '......OOOOO.........',
      '....OOKOOOKOO.......',
      '...OKOOOKOOOKOO.....',
      '..OOOOKOOOOKOOO.....',
      '..OKOOOOKOOOOKOO....',
      '..OOOKOOOKOOOOO.....',
      '..OOKOOKOSSKKS......',
      '...OKOOSsSSSKS......',
      '...OOKOSsSSSSSS.....',
      '....OKOsSSSSsS......',
      '.....O..sSSSS.......',
      '.......OKOOKO.......',
      '......OKOttOKS......',
      '......KOOttKOS......',
      '......SOKttOO.......',
      '.......kkkGk........',
      '.......PP.PP........',
      '.......Pp.PP........',
      '......BBB.BBB.......',
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
