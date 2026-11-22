// punk_001 v1(公開済みのバージョンは変更しない。直すときは v2 を作る)
// 元: games/donkeypunk/js/sprites.js(横向き)+ games/punks-qix/js/punk-views.js(正面・背面)
// コマ名の対応(新 ← 元): stand ← punkStand, walk ← punkWalk, jump ← punkJump, climb ← punkClimb, front ← punkFront, frontWalkA ← punkFrontWalkA, frontWalkB ← punkFrontWalkB, back ← punkBack, backWalkA ← punkBackWalkA, backWalkB ← punkBackWalkB
// tools/import-v1.js が 2026-11-21 に元のデータから書き出したもの(1 文字 = 1 ドット、'.' は透明)
POGO77.characters.define({
  id: 'punk_001',
  version: 1,
  type: 'pixel',
  scale: 2,
  facing: 'right',
  palette: {
    K: '#141414',
    k: '#3a3a44',
    R: '#ff2a2a',
    r: '#a81414',
    S: '#f4bc94',
    s: '#c98a62',
    W: '#ffffff',
    G: '#cfd6e0',
    J: '#3458b0',
    B: '#2a1a12',
    b: '#7a7a7a'
  },
  frames: {
    stand: [
      '.......R.R..R.......',
      '....R..RRRR.RR..R...',
      '....RR.RRRRRRR.RR...',
      '.R..RRRRRRRRRRRR....',
      '.RRRRRRRRRRRRRR.....',
      '..RRRRRRrRrRrRR.....',
      'RRRRRRRrRrRrRR......',
      '.RRRRRRSSSSSS.......',
      'RRRRRrRSSSSKS.......',
      '.RRRRRRSSSSSSG......',
      '..RRRrr.SsSS........',
      '.......KKKKKK.......',
      '......KKGKKKKS......',
      '......KKKKKKKS......',
      '......SKKKKKK.......',
      '.......JJJJJ........',
      '.......JJ.JJ........',
      '.......JJ.JJ........',
      '......BBB.BBB.......',
      '......bbb.bbbb......'
    ],
    walk: [
      '.......R.R..R.......',
      '....R..RRRR.RR..R...',
      '....RR.RRRRRRR.RR...',
      '.R..RRRRRRRRRRRR....',
      '.RRRRRRRRRRRRRR.....',
      '..RRRRRRrRrRrRR.....',
      'RRRRRRRrRrRrRR......',
      '.RRRRRRSSSSSS.......',
      'RRRRRrRSSSSKS.......',
      '.RRRRRRSSSSSSG......',
      '..RRRrr.SsSS........',
      '.......KKKKKK.......',
      '......KKGKKKKS......',
      '.....SKKKKKKK.......',
      '.......KKKKKK.......',
      '.......JJJJJ........',
      '......JJJ.JJJ.......',
      '......JJ...JJ.......',
      '.....BBB...BBB......',
      '.....bbb...bbbb.....'
    ],
    jump: [
      '.......R.R..R.......',
      '....R..RRRR.RR..R...',
      '....RR.RRRRRRR.RR...',
      '.R..RRRRRRRRRRRR....',
      '.RRRRRRRRRRRRRR.....',
      '..RRRRRRrRrRrRR.....',
      'RRRRRRRrRrRrRR......',
      '.RRRRRRSSSSSS.......',
      'RRRRRrRSSSSKS.......',
      '.RRRRRRSSSSSSG......',
      '..RRRrr.SsSS........',
      '.....S.KKKKK.S......',
      '.....SKKGKKKKS......',
      '......KKKKKKK.......',
      '.......KKKKKK.......',
      '.......JJJJJ........',
      '......JJ..JJJ.......',
      '.....BBB...JJ.......',
      '.....bbb..BBB.......',
      '..........bbbb......'
    ],
    climb: [
      '........R..R........',
      '........RRRR........',
      '.........RR.........',
      '........RRRR........',
      '........RRRR........',
      '........RrrR........',
      '........RRRR........',
      '.......SSRRSS.......',
      '.....S.SSSSSS.......',
      '.....S.SSSSSS.......',
      '.....KK.SsSS........',
      '......KKKKKKKK......',
      '......KKKGGKKKS.....',
      '......KKKKKKKKS.....',
      '.......KKKKKK.......',
      '.......JJJJJJ.......',
      '.......JJ..JJ.......',
      '.......JJ..BBB......',
      '......BBB..bbb......',
      '......bbb...........'
    ],
    front: [
      '..........R.........',
      '.........RR.........',
      '.........Rr.........',
      '.........Rr.........',
      '........sRrs........',
      '.......sSRrSs.......',
      '......sSSRrSSs......',
      '......SSSRrSSS......',
      '......SKSSSSKS......',
      '.....GSSSSSSSSG.....',
      '.......SSkkSS.......',
      '......KKKSSKKK......',
      '.....KKGKWWKGKK.....',
      '.....KKKKWWKKKK.....',
      '.....SKKKKKKKKS.....',
      '.......JJJJJJ.......',
      '.......JJ..JJ.......',
      '.......JJ..JJ.......',
      '......BBB..BBB......',
      '......bbb..bbb......'
    ],
    frontWalkA: [
      '..........R.........',
      '.........RR.........',
      '.........Rr.........',
      '.........Rr.........',
      '........sRrs........',
      '.......sSRrSs.......',
      '......sSSRrSSs......',
      '......SSSRrSSS......',
      '......SKSSSSKS......',
      '.....GSSSSSSSSG.....',
      '.......SSkkSS.......',
      '......KKKSSKKK......',
      '.....KKGKWWKGKK.....',
      '.....SKKKWWKKKK.....',
      '......KKKKKKKKS.....',
      '.......JJJJJJ.......',
      '.......JJ..JJ.......',
      '......BBB..JJ.......',
      '......bbb..BBB......',
      '...........bbb......'
    ],
    frontWalkB: [
      '..........R.........',
      '.........RR.........',
      '.........Rr.........',
      '.........Rr.........',
      '........sRrs........',
      '.......sSRrSs.......',
      '......sSSRrSSs......',
      '......SSSRrSSS......',
      '......SKSSSSKS......',
      '.....GSSSSSSSSG.....',
      '.......SSkkSS.......',
      '......KKKSSKKK......',
      '.....KKGKWWKGKK.....',
      '.....KKKKWWKKKS.....',
      '.....SKKKKKKKK......',
      '.......JJJJJJ.......',
      '.......JJ..JJ.......',
      '.......JJ..BBB......',
      '......BBB..bbb......',
      '......bbb...........'
    ],
    back: [
      '..........R.........',
      '.........RR.........',
      '.........Rr.........',
      '.........Rr.........',
      '........sRrs........',
      '.......sSRrSs.......',
      '......sSSRrSSs......',
      '......sSSRrSSs......',
      '......SSSRrSSS......',
      '.....GSSSRrSSSG.....',
      '.......SsRrsS.......',
      '......KKKKKKKK......',
      '.....KKKGKKGKKK.....',
      '.....KKKKGGKKKK.....',
      '.....SKKGKKGKKS.....',
      '.......JJJJJJ.......',
      '.......JJ..JJ.......',
      '.......JJ..JJ.......',
      '......BBB..BBB......',
      '......bbb..bbb......'
    ],
    backWalkA: [
      '..........R.........',
      '.........RR.........',
      '.........Rr.........',
      '.........Rr.........',
      '........sRrs........',
      '.......sSRrSs.......',
      '......sSSRrSSs......',
      '......sSSRrSSs......',
      '......SSSRrSSS......',
      '.....GSSSRrSSSG.....',
      '.......SsRrsS.......',
      '......KKKKKKKK......',
      '.....KKKGKKGKKK.....',
      '.....SKKKGGKKKK.....',
      '......KKGKKGKKS.....',
      '.......JJJJJJ.......',
      '.......JJ..JJ.......',
      '......BBB..JJ.......',
      '......bbb..BBB......',
      '...........bbb......'
    ],
    backWalkB: [
      '..........R.........',
      '.........RR.........',
      '.........Rr.........',
      '.........Rr.........',
      '........sRrs........',
      '.......sSRrSs.......',
      '......sSSRrSSs......',
      '......sSSRrSSs......',
      '......SSSRrSSS......',
      '.....GSSSRrSSSG.....',
      '.......SsRrsS.......',
      '......KKKKKKKK......',
      '.....KKKGKKGKKK.....',
      '.....KKKKGGKKKS.....',
      '.....SKKGKKGKK......',
      '.......JJJJJJ.......',
      '.......JJ..JJ.......',
      '.......JJ..BBB......',
      '......BBB..bbb......',
      '......bbb...........'
    ]
  },
  animations: {
    stand: [
      'stand'
    ],
    walk: [
      'stand',
      'walk'
    ],
    jump: [
      'jump'
    ],
    climb: [
      'climb'
    ],
    front: [
      'front'
    ],
    frontWalk: [
      'frontWalkA',
      'frontWalkB'
    ],
    back: [
      'back'
    ],
    backWalk: [
      'backWalkA',
      'backWalkB'
    ]
  },
  variants: {
    green: {
      type: 'hair',
      rows: 11,
      from: {
        base: 'R',
        shade: 'r'
      },
      colors: {
        base: '#3cdc3c',
        shade: '#1c8a28',
        highlight: '#b4ff9c'
      }
    },
    yellow: {
      type: 'hair',
      rows: 11,
      from: {
        base: 'R',
        shade: 'r'
      },
      colors: {
        base: '#ffd800',
        shade: '#b07800',
        highlight: '#fff6a0'
      }
    },
    red: {
      type: 'hair',
      rows: 11,
      from: {
        base: 'R',
        shade: 'r'
      },
      colors: {
        base: '#ff2a2a',
        shade: '#a81414',
        highlight: '#ffa08c'
      }
    },
    blue: {
      type: 'hair',
      rows: 11,
      from: {
        base: 'R',
        shade: 'r'
      },
      colors: {
        base: '#3a8cff',
        shade: '#1c48b0',
        highlight: '#a8d4ff'
      }
    },
    pink: {
      type: 'hair',
      rows: 11,
      from: {
        base: 'R',
        shade: 'r'
      },
      colors: {
        base: '#ff5aa6',
        shade: '#b0286a',
        highlight: '#ffbcdc'
      }
    }
  }
});
