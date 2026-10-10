/** Renders a tiny pixel-art icon (rows of palette chars) as crisp SVG rects. */
const PAL: Record<string, string> = {
  W: '#ece4c8',
  w: '#a3a1bd',
  R: '#cf4440',
  r: '#f08b5c',
  G: '#f2c94c',
  g: '#c08427',
  B: '#3d84d1',
  C: '#36c4b4',
  c: '#aaf6ec',
  V: '#9a4dc4',
  v: '#d89cf2',
  K: '#1b1325',
};

export const ICONS = {
  sword: `
..........W
.........Ww
........Ww.
.......Ww..
..g...Ww...
...g.Ww....
....gw.....
...gKg.....
..K..g.....
.K.........
K..........`,
  dash: `
...........
.W...W.....
..W...W....
...W...W...
....W...W..
...W...W...
..W...W....
.W...W.....
...........`,
  potion: `
....WW.....
....ww.....
...WWWW....
..WRRRRW...
.WRrRRRRW..
.WRRRRRRW..
.WRRRRRRW..
..WWWWWW...`,
  hand: `
....W......
...WcW.....
...WcW.WW..
...WcWWccW.
.WWWcWcccW.
WccWcccccW.
.WcccccccW.
..WcccccW..
...WWWWW...`,
  pause: `
.WW..WW.
.WW..WW.
.WW..WW.
.WW..WW.
.WW..WW.
.WW..WW.`,
  orb: `
...VVV...
..VvvVV..
.VvvVVVV.
.VvVVVVV.
.VVVVVVV.
..VVVVV..
...VVV...`,
  phone: `
..KKKKKKK..
..KWWWWWK..
..KWccWWK..
..KWccWWK..
..KWWWWWK..
..KWWWWWK..
..KWWWWWK..
..KWWWWWK..
..KKKKKKK..`,
} as const;

export function PixelIcon({ name, class: cls }: { name: keyof typeof ICONS; class?: string }) {
  const rows = ICONS[name]
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const rects = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y]!.length; x++) {
      const c = PAL[rows[y]![x]!];
      if (c) rects.push(<rect key={`${x},${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} />);
    }
  }
  return (
    <svg
      class={cls}
      viewBox={`0 0 ${w} ${h}`}
      shape-rendering="crispEdges"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {rects}
    </svg>
  );
}
