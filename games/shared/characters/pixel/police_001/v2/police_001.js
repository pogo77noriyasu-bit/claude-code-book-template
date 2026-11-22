// police_001 v2(公開済みのバージョンは変更しない。直すときは v3 を作る)
// v1 にアニメーション stand(立ち姿 = walkA の 1 コマ)を足しただけ。ドット・パレット・色違いは v1 と同じ
// 元: games/donkeypunk/js/sprites.js(怒ったポリスマン)
// コマ名の対応(新 ← 元): walkA ← copWalkA, walkB ← copWalkB, carryA ← copCarryA, carryB ← copCarryB, salute ← copSalute, climb ← copClimb, dizzy ← copDizzy, cheer ← copCheer
// tools/make-v2-stand.js が 2026-11-21 に v1 から書き出したもの
POGO77.characters.define({
  id: 'police_001',
  version: 2,
  type: 'pixel',
  scale: 2,
  facing: 'right',
  palette: {
    K: '#141414',
    k: '#3a3a44',
    S: '#f4bc94',
    s: '#c98a62',
    W: '#ffffff',
    N: '#1d2c74',
    n: '#2f48b8',
    Y: '#ffd23c',
    P: '#ff5aa6'
  },
  frames: {
    walkA: [
      '....NNNNNN....',
      '...NNNNYNNN...',
      '...NNNNNNNNKK.',
      '....SSSSSSS...',
      '....KKKSKKK...',
      '....SWKSSWKS..',
      '....SSSSsSSS..',
      '....PSKKKSP...',
      '.....SSSSS....',
      '....NNNYNN....',
      '...NNNNNNNN...',
      '..SNnNNYNnNS..',
      '..SNnNNNNnNS..',
      '...NKKKYKKN...',
      '...NNNNNNNN...',
      '...NNN..NNN...',
      '...NN....NN...',
      '..KKK...KKKK..'
    ],
    walkB: [
      '....NNNNNN....',
      '...NNNNYNNN...',
      '...NNNNNNNNKK.',
      '....SSSSSSS...',
      '....KKKSKKK...',
      '....SWKSSWKS..',
      '....SSSSsSSS..',
      '....PSKKKSP...',
      '.....SSSSS....',
      '....NNNYNN....',
      '...NNNNNNNN...',
      '..SNnNNYNnNS..',
      '..SNnNNNNnNS..',
      '...NKKKYKKN...',
      '...NNNNNNNN...',
      '....NNNNNN....',
      '....NN.NN.....',
      '...KKKKKKK....'
    ],
    carryA: [
      '..S.NNNNNN.S..',
      '..NNNNNYNNNN..',
      '..NNNNNNNNNNK.',
      '..N.SSSSSSSN..',
      '..N.KKKSKKKN..',
      '..N.SWKSSWKN..',
      '..N.SSSSsSSN..',
      '..N.PSKKKSPN..',
      '..N..SSSSS.N..',
      '..N.NNNYNN.N..',
      '..NNNNNNNNNN..',
      '..NNnNNYNnNN..',
      '..NNnNNNNnNN..',
      '...NKKKYKKN...',
      '...NNNNNNNN...',
      '...NNN..NNN...',
      '...NN....NN...',
      '..KKK...KKKK..'
    ],
    carryB: [
      '..S.NNNNNN.S..',
      '..NNNNNYNNNN..',
      '..NNNNNNNNNNK.',
      '..N.SSSSSSSN..',
      '..N.KKKSKKKN..',
      '..N.SWKSSWKN..',
      '..N.SSSSsSSN..',
      '..N.PSKKKSPN..',
      '..N..SSSSS.N..',
      '..N.NNNYNN.N..',
      '..NNNNNNNNNN..',
      '..NNnNNYNnNN..',
      '..NNnNNNNnNN..',
      '...NKKKYKKN...',
      '...NNNNNNNN...',
      '....NNNNNN....',
      '....NN.NN.....',
      '...KKKKKKK....'
    ],
    salute: [
      '....NNNNNN....',
      '...NNNNYNNN...',
      '...NNNNNNNNKS.',
      '....SSSSSSS.N.',
      '....KKKSKKK.N.',
      '....SWKSSWKSN.',
      '....SSSSsSSSN.',
      '....PSKKKSP.N.',
      '.....SSSSS..N.',
      '....NNNYNN..N.',
      '...NNNNNNNN.N.',
      '..SNnNNYNnNNN.',
      '..SNnNNNNnNN..',
      '...NKKKYKKN...',
      '...NNNNNNNN...',
      '...NNN..NNN...',
      '...NN....NN...',
      '..KKK...KKKK..'
    ],
    climb: [
      '..S.NNNNNN....',
      '..NNNNNNNNN...',
      '..NNNNNNNNN...',
      '..N.kkkkkk....',
      '..N.kkkkkk....',
      '..N.kSSSSk....',
      '..N..SSSS.....',
      '..NNNNNNNNN...',
      '..NNNNNNNNNN..',
      '..NNNNNNNNNN..',
      '..NNNNNNNNNN..',
      '...NKKKKKKNN..',
      '...NNNNNNNNS..',
      '...NNNNNNNN...',
      '...NNN..NNN...',
      '...NN....NN...',
      '...NN....NN...',
      '..KKK....KKK..'
    ],
    dizzy: [
      '....NNNNNN....',
      '...NNNNYNNN...',
      '...NNNNNNNNKK.',
      '....SSSSSSS...',
      '....KKKSKKK...',
      '....SKKSSKKS..',
      '....SSSSsSSS..',
      '....PSKWKSP...',
      '.....SSSSS....',
      '....NNNYNN....',
      '...NNNNNNNN...',
      '..SNnNNYNnNS..',
      '..SNnNNNNnNS..',
      '...NKKKYKKN...',
      '...NNNNNNNN...',
      '...NNN..NNN...',
      '...NN....NN...',
      '..KKK...KKKK..'
    ],
    cheer: [
      '..S.NNNNNN.S..',
      '..NNNNNYNNNN..',
      '..NNNNNNNNNNK.',
      '..N.SSSSSSSN..',
      '..N.KKKSKKKN..',
      '..N.SWKSSWKN..',
      '..N.SSSSsSSN..',
      '..N.PSKWKSPN..',
      '..N..SSSSS.N..',
      '..N.NNNYNN.N..',
      '..NNNNNNNNNN..',
      '..NNnNNYNnNN..',
      '..NNnNNNNnNN..',
      '...NKKKYKKN...',
      '...NNNNNNNN...',
      '...NNN..NNN...',
      '...NN....NN...',
      '..KKK...KKKK..'
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
    carry: [
      'carryA',
      'carryB'
    ],
    salute: [
      'salute'
    ],
    climb: [
      'climb'
    ],
    dizzy: [
      'dizzy'
    ],
    cheer: [
      'cheer'
    ]
  },
  variants: {
    red: {
      type: 'palette',
      colors: {
        N: '#b81c1c',
        n: '#ff5a5a',
        Y: '#ffe83c'
      }
    },
    blue: {
      type: 'palette',
      colors: {
        N: '#1c4ec8',
        n: '#5a9cff',
        Y: '#ffe83c'
      }
    }
  }
});
