import { C } from '../palette';
import { outlined, sprite } from './types';

/** Held weapons point RIGHT; pivot = grip. Rendered rotated toward the aim direction. */
const steel = {
  s: C.stone4,
  S: C.stone3,
  w: C.white,
  h: C.wood2,
  H: C.wood1,
  g: C.gold2,
  G: C.gold1,
};

export const wpnSword = outlined(
  'wpn.sword',
  16,
  7,
  steel,
  [
    `
  ................
  ...g............
  ...g.wwwwwwwww..
  hhhgsssssssssssw
  ...g.SSSSSSSSS..
  ...g............
  ................
  `,
  ],
  { ox: 2, oy: 3 },
);

export const wpnSwordKnight = outlined(
  'wpn.swordKnight',
  18,
  7,
  steel,
  [
    `
  ..................
  ...gg.............
  ...g..wwwwwwwwwww.
  hhhgGssssssssssssw
  ...g..SSSSSSSSSSS.
  ...gg.............
  ..................
  `,
  ],
  { ox: 2, oy: 3 },
);

export const wpnAxe = outlined(
  'wpn.axe',
  16,
  9,
  steel,
  [
    `
  ................
  ...........ss...
  ..........sssw..
  ..........sssSw.
  hhhhhhhhhhhhhSS.
  ..........sssSw.
  ..........sssw..
  ...........ss...
  ................
  `,
  ],
  { ox: 2, oy: 4 },
);

export const wpnDagger = outlined(
  'wpn.dagger',
  11,
  5,
  steel,
  [
    `
  ...........
  ...g.......
  hhgsssssw..
  ...g.......
  ...........
  `,
  ],
  { ox: 1, oy: 2 },
);

const bowPal = { w: C.bone2, b: C.wood2, B: C.wood1, h: C.wood3, g: C.green1, r: C.red1 };

export const wpnBow = outlined(
  'wpn.bow',
  9,
  16,
  bowPal,
  [
    `
  .........
  ..wbb....
  ..w.bb...
  ..w..b...
  ..w..bb..
  ..w...b..
  ..w...b..
  ..w..hh..
  ..w..hh..
  ..w...b..
  ..w...b..
  ..w..bb..
  ..w..b...
  ..w.bb...
  ..wbb....
  .........
  `,
  ],
  { ox: 5, oy: 8 },
);

export const wpnBowHunter = outlined(
  'wpn.bowHunter',
  9,
  16,
  { ...bowPal, b: C.green1, B: C.green0 },
  [
    `
  ..wb.....
  ..w.bb...
  ..w..b...
  ..w..bb..
  ..w...b..
  ..w...b..
  ..w...b..
  ..w..rr..
  ..w..rr..
  ..w...b..
  ..w...b..
  ..w...b..
  ..w..bb..
  ..w..b...
  ..w.bb...
  ..wb.....
  `,
  ],
  { ox: 5, oy: 8 },
);

export const wpnCrossbow = outlined(
  'wpn.crossbow',
  16,
  9,
  { ...steel, b: C.wood2, w: C.bone2 },
  [
    `
  ................
  ...........b....
  ...........bb...
  ...........b.b..
  hhhhhhhhhhhhhhs.
  HHHH.......b.b..
  ...........bb...
  ...........b....
  ................
  `,
  ],
  { ox: 3, oy: 4 },
);

export const wpnStaff = outlined(
  'wpn.staff',
  18,
  7,
  { h: C.wood2, H: C.wood1, o: C.cyan2, O: C.cyan3, w: C.white },
  [
    `
  ..................
  ..............oo..
  .............oOwo.
  hhhhhhhhhhhhhoOOo.
  HH...........oOOo.
  ..............oo..
  ..................
  `,
  ],
  { ox: 3, oy: 3 },
);

export const wpnStaffEmber = outlined(
  'wpn.staffEmber',
  18,
  7,
  { h: C.wood1, H: C.wood0, o: C.red2, O: C.red3, w: C.gold3 },
  [
    `
    ..................
    ..............oo..
    .............oOwo.
    hhhhhhhhhhhhhoOOo.
    HH...........oOOo.
    ..............oo..
    ..................
    `,
  ],
  { ox: 3, oy: 3 },
);

/** Projectiles point RIGHT (rotated along velocity) unless they spin. */
export const projArrow = sprite(
  'proj.arrow',
  10,
  3,
  { f: C.bone1, h: C.wood2, s: C.stone4 },
  [
    `
  f.........
  ffhhhhhhss
  f.........
  `,
  ],
  { ox: 8, oy: 1 },
);

export const projArrowRed = sprite(
  'proj.arrowRed',
  10,
  3,
  { f: C.red2, h: C.wood1, s: C.red3 },
  [
    `
  f.........
  ffhhhhhhss
  f.........
  `,
  ],
  { ox: 8, oy: 1 },
);

export const projBolt = sprite(
  'proj.bolt',
  10,
  3,
  { f: C.bone2, h: C.stone3, s: C.white },
  [
    `
  ..........
  ffhhhhhhss
  ..........
  `,
  ],
  { ox: 8, oy: 1 },
);

const orb = (id: string, a: string, b: string, c: string) =>
  sprite(
    id,
    8,
    8,
    { a, b, c },
    [
      `
    ..aaaa..
    .abbbba.
    abbccbba
    abcccbba
    abbccbba
    abbbbbba
    .abbbba.
    ..aaaa..
    `,
    ],
    { ox: 4, oy: 4 },
  );

export const projMagic = orb('proj.magic', C.cyan1, C.cyan2, C.white);
export const projFireball = orb('proj.fireball', C.red1, C.red3, C.gold3);
export const projOrb = orb('proj.orb', C.violet0, C.violet2, C.violet3);
export const projWisp = sprite(
  'proj.wisp',
  4,
  4,
  { a: C.cyan3, b: C.white },
  [
    `
  .aa.
  abba
  abba
  .aa.
  `,
  ],
  { ox: 2, oy: 2 },
);

export const projBlade = outlined(
  'proj.blade',
  10,
  10,
  { s: C.stone4, w: C.white },
  [
    `
  ..........
  ....w.....
  ....ss....
  .....ss...
  .wss..ssw.
  .wss..ssw.
  ...ss.....
  ....ss....
  .....w....
  ..........
  `,
  ],
  { ox: 5, oy: 5 },
);

export const projBone = outlined(
  'proj.bone',
  10,
  10,
  { B: C.bone2, b: C.bone1 },
  [
    `
  ..........
  .BB.......
  .BbB......
  ..BbB.....
  ...BbB....
  ....BbB...
  .....BbB..
  ......BbB.
  .......BB.
  ..........
  `,
  ],
  { ox: 5, oy: 5 },
);

export const projSkullFire = outlined(
  'proj.skullFire',
  10,
  10,
  { B: C.bone2, k: C.ink, c: C.cyan2, C: C.cyan3 },
  [
    `
  ..........
  ...cCCc...
  ..cBBBBc..
  .cBkBBkBc.
  .cBkBBkBc.
  ..BBBBBB..
  ..BkBkBk..
  ...cccc...
  ....cc....
  ..........
  `,
  ],
  { ox: 5, oy: 5 },
);

/** Armor icons (16×16) use the material ramp slots @m0/@m1/@m2. */
const mat = { m: '@m1', M: '@m0', l: '@m2', k: C.ink };

export const iconCap = outlined('icon.cap', 16, 16, mat, [
  `
  ................
  ................
  ................
  ................
  ......mmmm......
  ....mmlmmmmm....
  ...mmlmmmmmmm...
  ...mmmmmmmmmm...
  ..MMMMMMMMMMMMM.
  ..MMMMMMMMMMMMM.
  ................
  ................
  ................
  ................
  ................
  ................
  `,
]);

export const iconHood = outlined('icon.hood', 16, 16, mat, [
  `
  ................
  ................
  ......mmmm......
  ....mmlmmmmm....
  ...mmlmmmmmmm...
  ...mlmMMMMMmm...
  ..mmmMkkkkMmmm..
  ..mmmMkkkkMmmm..
  ..mmmMkkkkMmmm..
  ..mmmmMkkMmmmm..
  ..MmmmmmmmmmmM..
  ...MMmmmmmmMM...
  .....MMMMMM.....
  ................
  ................
  ................
  `,
]);

export const iconHelm = outlined('icon.helm', 16, 16, mat, [
  `
  ................
  ................
  ......mmmm......
  ....mmlmmmmm....
  ...mmlmmmmmmm...
  ...mlmmmmmmmm...
  ..mmmmmmmmmmmm..
  ..mmMMMMMMMMmm..
  ..mmMkkMMkkMmm..
  ..mmmMMmmMMmmm..
  ..mmmmmMMmmmmm..
  ..Mmmmmmmmmmmm..
  ...MMm....mMM...
  ................
  ................
  ................
  `,
]);

export const iconVest = outlined('icon.vest', 16, 16, mat, [
  `
  ................
  ................
  ....mm....mm....
  ...mmmm..mmmm...
  ..mmmlmmmmlmmm..
  ..mmmlmMMmlmmm..
  ..mm.lmMMml.mm..
  .....lmMMml.....
  .....mmMMmm.....
  .....mmMMmm.....
  .....llllll.....
  .....mmmmmm.....
  .....MMMMMM.....
  ................
  ................
  ................
  `,
]);

export const iconRobe = outlined('icon.robe', 16, 16, mat, [
  `
  ................
  ................
  .....mm..mm.....
  ....mmmmmmmm....
  ...mmmmllmmmm...
  ..mmmmmlmmmmmm..
  ..mm.mmlmmm.mm..
  .....mmlmmm.....
  .....mmlmmm.....
  ....mmmlmmmm....
  ....mmmlmmmm....
  ...mmmmlmmmmm...
  ...MMMMMMMMMM...
  ................
  ................
  ................
  `,
]);

export const iconPlate = outlined('icon.plate', 16, 16, mat, [
  `
  ................
  ................
  ...ll......ll...
  ..lmml....lmml..
  ..mmmmllllmmmm..
  ..mmmlmmmmlmmm..
  ...mmlmmmmlmm...
  ....mlmmmmlm....
  ....mmmmmmmm....
  ....mmmMMmmm....
  ....MmmmmmmM....
  .....MMMMMM.....
  ................
  ................
  ................
  ................
  `,
]);

export const iconBoots = outlined('icon.boots', 16, 16, mat, [
  `
  ................
  ................
  ................
  ................
  ...mmm....mmm...
  ...mlm....mlm...
  ...mlm....mlm...
  ...mlm....mlm...
  ...mmm....mmm...
  ...mmmm...mmmm..
  ..mmmmmm.mmmmmm.
  ..MMMMMM.MMMMMM.
  ................
  ................
  ................
  ................
  `,
]);

/** Artifact icons: rune stones with a glyph. */
const rune = (id: string, glyph: string[], a: string, b: string, c: string) =>
  outlined(id, 16, 16, { s: C.stone2, S: C.stone3, d: C.stone1, a, b, c }, [
    [
      '................',
      '....ssssssss....',
      '...sSSSSSSSSs...',
      '..sS' + glyph[0] + 'Ss..',
      '..sS' + glyph[1] + 'Ss..',
      '..sS' + glyph[2] + 'Ss..',
      '..sS' + glyph[3] + 'Ss..',
      '..sS' + glyph[4] + 'Ss..',
      '..sS' + glyph[5] + 'Ss..',
      '..sS' + glyph[6] + 'Ss..',
      '..sS' + glyph[7] + 'Ss..',
      '..ss' + glyph[8] + 'ss..',
      '...dssssssssd...',
      '....dddddddd....',
      '................',
      '................',
    ].join('\n'),
  ]);

// Each glyph is 9 rows × 8 cols (palette a/b/c over the stone).
export const artIcons = [
  rune(
    'icon.art.fireball',
    [
      'SSSaaSSS',
      'SSabbaSS',
      'SabbcbaS',
      'SabccbaS',
      'SabccbaS',
      'SSabbaSS',
      'SSSaaSSS',
      'SSSSSSSS',
      'ssssssss',
    ],
    C.red1,
    C.red3,
    C.gold3,
  ),
  rune(
    'icon.art.frost',
    [
      'SSSbSSSS',
      'SbSbSbSS',
      'SSbcbSSS',
      'bbcccbbS',
      'SSbcbSSS',
      'SbSbSbSS',
      'SSSbSSSS',
      'SSSSSSSS',
      'ssssssss',
    ],
    C.blue1,
    C.blue3,
    C.white,
  ),
  rune(
    'icon.art.dash',
    [
      'SSSSSSSS',
      'SbSSbSSS',
      'SSbSSbSS',
      'SSSbSSbS',
      'SSbSSbSS',
      'SbSSbSSS',
      'SSSSSSSS',
      'SSSSSSSS',
      'ssssssss',
    ],
    C.violet1,
    C.violet3,
    C.white,
  ),
  rune(
    'icon.art.blood',
    [
      'SSSaSSSS',
      'SSSbSSSS',
      'SSabaSSS',
      'SabbbaSS',
      'SabcbaSS',
      'SSabaSSS',
      'SSSSSSSS',
      'SSSSSSSS',
      'ssssssss',
    ],
    C.red0,
    C.red2,
    C.red3,
  ),
  rune(
    'icon.art.holy',
    [
      'SSSbSSSS',
      'SbSbSbSS',
      'SSbcbSSS',
      'bbcccbbS',
      'SSbcbSSS',
      'SbSbSbSS',
      'SSSbSSSS',
      'SSSSSSSS',
      'ssssssss',
    ],
    C.gold0,
    C.gold2,
    C.gold3,
  ),
  rune(
    'icon.art.shield',
    [
      'SSaaaaSS',
      'SabbbbaS',
      'SabccbaS',
      'SabccbaS',
      'SSabbaSS',
      'SSSaaSSS',
      'SSSSSSSS',
      'SSSSSSSS',
      'ssssssss',
    ],
    C.bone0,
    C.bone1,
    C.bone2,
  ),
  rune(
    'icon.art.wisp',
    [
      'SSSbbSSS',
      'SSbccbSS',
      'SSbccbSS',
      'SSSbbSSS',
      'SbSSSSbS',
      'SSSbSSSS',
      'SSSSSbSS',
      'SSSSSSSS',
      'ssssssss',
    ],
    C.cyan1,
    C.cyan3,
    C.white,
  ),
  rune(
    'icon.art.blades',
    [
      'bSSSSSSb',
      'SbSSSSbS',
      'SSbSSbSS',
      'SSSccSSS',
      'SSSccSSS',
      'SSbSSbSS',
      'SbSSSSbS',
      'bSSSSSSb',
      'ssssssss',
    ],
    C.stone3,
    C.white,
    C.white,
  ),
  rune(
    'icon.art.meteor',
    [
      'SSSSSSaS',
      'SSSSSaSS',
      'SSSSaSSS',
      'SSbbSSSS',
      'SbccbSSS',
      'SbccbSSS',
      'SSbbSSSS',
      'SSSSSSSS',
      'ssssssss',
    ],
    C.red2,
    C.red3,
    C.gold3,
  ),
];

/** World props. */
export const chest = outlined(
  'prop.chest',
  16,
  16,
  { w: C.wood1, W: C.wood2, d: C.wood0, g: C.gold2, G: C.gold1, k: C.ink, y: C.gold3 },
  [
    `
  ................
  ................
  ................
  ................
  ..WWWWWWWWWWWW..
  .WwwwwwwwwwwwwW.
  .WwwwwwwwwwwwwW.
  .GGGGGGyGGGGGGG.
  .WwwwwwgggwwwwW.
  .WwwwwwgkgwwwwW.
  .WwwwwwwgwwwwwW.
  .WwwwwwwwwwwwwW.
  .GGGGGGGGGGGGGG.
  .dddddddddddddd.
  ................
  ................
  `,
    `
  ................
  ..WWWWWWWWWWWW..
  .WdddddddddddW..
  .WwwwwwwwwwwwwW.
  .GGGGGGGGGGGGGG.
  .WkkkkkkkkkkkkW.
  .WkyykgyykkgkkW.
  .GGGGGGGGGGGGGG.
  .WwwwwwwwwwwwwW.
  .WwwwwwwwwwwwwW.
  .WwwwwwwwwwwwwW.
  .WwwwwwwwwwwwwW.
  .GGGGGGGGGGGGGG.
  .dddddddddddddd.
  ................
  ................
  `,
  ],
);

export const keyItem = outlined(
  'prop.key',
  12,
  12,
  { g: C.gold2, G: C.gold1, y: C.gold3 },
  [
    `
  ............
  ............
  ...yyy......
  ..gGGGg.....
  ..g...g.....
  ..gGGGgggggg
  ...ggg...g.g
  .........g..
  ............
  ............
  ............
  ............
  `,
  ],
  { ox: 6, oy: 8 },
);

export const coin = outlined(
  'prop.coin',
  8,
  8,
  { g: C.gold2, G: C.gold1, y: C.gold3 },
  [
    `
  ........
  ..gggg..
  .gyyggg.
  .gyGGgg.
  .ggGGgg.
  .gggggG.
  ..GGGG..
  ........
  `,
    `
  ........
  ...gg...
  ...yg...
  ...gG...
  ...gG...
  ...gG...
  ...GG...
  ........
  `,
  ],
  { ox: 4, oy: 6 },
);

export const potion = outlined(
  'prop.potion',
  12,
  14,
  { g: C.stone4, r: C.red2, R: C.red3, d: C.red1, c: C.wood2, w: C.white },
  [
    `
  ............
  ....cccc....
  .....gg.....
  .....gg.....
  ....gggg....
  ...grrrrg...
  ..gRwrrrrg..
  ..gRrrrrrg..
  ..grrrrrdg..
  ..gdrrrddg..
  ...gddddg...
  ....gggg....
  ............
  ............
  `,
  ],
  { ox: 6, oy: 12 },
);

export const pedestal = outlined(
  'prop.pedestal',
  16,
  16,
  { s: C.stone3, S: C.stone4, d: C.stone1, g: C.gold1 },
  [
    `
  ................
  ................
  ................
  ................
  ................
  ................
  ................
  ................
  ...SSSSSSSSSS...
  ...ssssssssss...
  ....gggggggg....
  ....ssssssss....
  ....ssssssss....
  ...dddddddddd...
  ...dddddddddd...
  ................
  `,
  ],
);

export const portal = sprite(
  'prop.portal',
  24,
  24,
  { a: C.violet1, b: C.violet2, c: C.cyan2, C: C.cyan3, w: C.white },
  [
    `
  ........................
  ........aaaaaaaa........
  ......aabbbbbbbbaa......
  .....abbccccccccbba.....
  ....abccCCCCCCCCccba....
  ...abcCCwwwwwwwwCCcba...
  ...abcCwwCCCCCCwwCcba...
  ..abcCwCCccccccCCwCcba..
  ..abcCwCccbbbbccCwCcba..
  ..abcCwCcbaaaabcCwCcba..
  ..abcCwCcba..abcCwCcba..
  ..abcCwCcba..abcCwCcba..
  ..abcCwCcbaaaabcCwCcba..
  ..abcCwCccbbbbccCwCcba..
  ..abcCwCCccccccCCwCcba..
  ...abcCwwCCCCCCwwCcba...
  ...abcCCwwwwwwwwCCcba...
  ....abccCCCCCCCCccba....
  .....abbccccccccbba.....
  ......aabbbbbbbbaa......
  ........aaaaaaaa........
  ........................
  ........................
  ........................
  `,
  ],
  { ox: 12, oy: 12 },
);

/** 3×5 pixel digits for damage numbers (outlined → 5×7). Frame i = digit i, frame 10 = '+'. */
const DIG = [
  ['www', 'w.w', 'w.w', 'w.w', 'www'],
  ['.w.', 'ww.', '.w.', '.w.', 'www'],
  ['www', '..w', 'www', 'w..', 'www'],
  ['www', '..w', 'www', '..w', 'www'],
  ['w.w', 'w.w', 'www', '..w', '..w'],
  ['www', 'w..', 'www', '..w', 'www'],
  ['www', 'w..', 'www', 'w.w', 'www'],
  ['www', '..w', '.w.', '.w.', '.w.'],
  ['www', 'w.w', 'www', 'w.w', 'www'],
  ['www', 'w.w', 'www', '..w', 'www'],
  ['...', '.w.', 'www', '.w.', '...'],
];
export const digits = outlined(
  'fx.digits',
  5,
  7,
  { w: C.white },
  DIG.map((g) => ['.....', ...g.map((r) => '.' + r + '.'), '.....'].join('\n')),
  { ox: 2, oy: 3 },
);

export const ITEM_SPRITES = [
  wpnSword,
  wpnSwordKnight,
  wpnAxe,
  wpnDagger,
  wpnBow,
  wpnBowHunter,
  wpnCrossbow,
  wpnStaff,
  wpnStaffEmber,
  projArrow,
  projArrowRed,
  projBolt,
  projMagic,
  projFireball,
  projOrb,
  projWisp,
  projBlade,
  projBone,
  projSkullFire,
  iconCap,
  iconHood,
  iconHelm,
  iconVest,
  iconRobe,
  iconPlate,
  iconBoots,
  ...artIcons,
  chest,
  keyItem,
  coin,
  potion,
  pedestal,
  portal,
  digits,
];
