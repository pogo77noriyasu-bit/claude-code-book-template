// riot_001 v2(公開済みのバージョンは変更しない。直すときは v3 を作る)
// v1 にアニメーション stand(立ち姿 = walkA の 1 コマ)を足しただけ。ドット・パレット・色違いは v1 と同じ
// 元: games/donkeypunk/js/sprites.js(機動隊員)
// コマ名の対応(新 ← 元): walkA ← riotA, walkB ← riotB, aim ← riotAim, chute ← riotChute
// tools/make-v2-stand.js が 2026-11-21 に v1 から書き出したもの
POGO77.characters.define({
  id: 'riot_001',
  version: 2,
  type: 'pixel',
  scale: 2,
  facing: 'right',
  palette: {
    K: '#141414',
    k: '#3a3a44',
    S: '#f4bc94',
    W: '#ffffff',
    N: '#1d2c74',
    n: '#2f48b8',
    Y: '#ffd23c',
    e: '#d8e4f0',
    U: '#3a8cff'
  },
  frames: {
    walkA: [
      '...NNNNNNN.....',
      '..NnnNNNNNN....',
      '..NNNNNNNNNN...',
      '..NNeUUUUUUN...',
      '..NNUUUUUUUN...',
      '...NSSSSSSN....',
      '....KKKKKK.....',
      '.kkkkkkkkkkk...',
      'kkKkkkkkkKkkk..',
      'kkkWWWWWWkkSKKK',
      'kkKkkkkkkKk.K..',
      '.kkkkkkkkkk....',
      '..NNNYNNNN.....',
      '..NNN..NNN.....',
      '..NNN..NNN.....',
      '.KKKK..KKKK....'
    ],
    walkB: [
      '...NNNNNNN.....',
      '..NnnNNNNNN....',
      '..NNNNNNNNNN...',
      '..NNeUUUUUUN...',
      '..NNUUUUUUUN...',
      '...NSSSSSSN....',
      '....KKKKKK.....',
      '.kkkkkkkkkkk...',
      'kkKkkkkkkKkkk..',
      'kkkWWWWWWkkSKKK',
      'kkKkkkkkkKk.K..',
      '.kkkkkkkkkk....',
      '..NNNYNNNN.....',
      '...NNNNNN......',
      '..NNN.NNN......',
      '.KKKK..KKK.....'
    ],
    aim: [
      '...NNNNNNN......',
      '..NnnNNNNNN.....',
      '..NNNNNNNNNN....',
      '..NNeUUUUUUN....',
      '..NNUUUUUUUN....',
      '...NSSSSSSN.....',
      '....KKKKKK......',
      '.kkkkkkkkkkk....',
      'kkKkkkkkkKkSSKKK',
      'kkkWWWWWWkkK.K..',
      'kkKkkkkkkKk.....',
      '.kkkkkkkkkk.....',
      '..NNNYNNNN......',
      '..NNN..NNN......',
      '..NNN..NNN......',
      '.KKKK..KKKK.....'
    ],
    chute: [
      'S..NNNNNNN..S..',
      'S.NnnNNNNNN.S..',
      'SkNNNNNNNNNNk..',
      'kkNNeUUUUUUNk..',
      '.kNNUUUUUUUNk..',
      '..kNSSSSSSNk...',
      '....KKKKKK.....',
      '.kkkkkkkkkkk...',
      'kkKkkkkkkKkkk..',
      'kkkWWWWWWkkk...',
      'kkKkkkkkkKkk...',
      '.kkkkkkkkkk....',
      '..NNNYNNNN.....',
      '..NNN..NNN.....',
      '..NN....NN.....',
      '.KKK....KKK....'
    ]
  },
  animations: {
    stand: [
      'walkA'
    ],
    walk: [
      'walkA',
      'walkB'
    ],
    aim: [
      'aim'
    ],
    chute: [
      'chute'
    ]
  },
  variants: {
    green: {
      type: 'palette',
      colors: {
        N: '#1c8a2c',
        n: '#4ad85a',
        k: '#145a1e',
        W: '#f0f0f0'
      }
    },
    orange: {
      type: 'palette',
      colors: {
        N: '#c8681c',
        n: '#ffa040',
        k: '#7a3c10',
        W: '#f0f0f0'
      }
    }
  }
});
