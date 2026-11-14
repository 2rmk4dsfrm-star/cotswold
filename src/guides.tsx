/**
 * "Where to measure" pictures, one per route step. The lettered markers match
 * the lettered fields underneath, in order (A = first field, B = second, ...).
 */
import type { ComponentChildren } from 'preact';
import type { SegmentKind } from './fit/engine';

type P = [number, number];

/** A dimension line with end ticks and a lettered marker at its midpoint. */
function Dim({ a, b, l }: { a: P; b: P; l: string }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (-(b[1] - a[1]) / len) * 5;
  const ny = ((b[0] - a[0]) / len) * 5;
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  return (
    <g class="g-dim">
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
      <line x1={a[0] - nx} y1={a[1] - ny} x2={a[0] + nx} y2={a[1] + ny} />
      <line x1={b[0] - nx} y1={b[1] - ny} x2={b[0] + nx} y2={b[1] + ny} />
      <circle cx={mx} cy={my} r="9" />
      <text x={mx} y={my + 3.6}>{l}</text>
    </g>
  );
}

const Frame = ({ label, children }: { label: string; children: ComponentChildren }) => (
  <svg class="guide" viewBox="0 0 300 150" role="img" aria-label={label}>
    {children}
  </svg>
);

/** Side view shared by every staircase shape. Letters match the first seven measurements. */
function StairSide() {
  return (
    <Frame label="Stairs seen from the side: B is the lowest headroom straight up from a step edge, C the steepness, D the clear floor in front of the bottom step, E the ceiling height at the bottom, F the clear floor beyond the top step, G the ceiling height at the top. Inset: A is the width from wall to handrail">
      <rect class="g-open" x="0" y="0" width="300" height="150" />
      <polygon class="g-wall g-edge" points="14,150 14,138 96,138 96,126 112,126 112,114 128,114 128,102 144,102 144,90 160,90 160,78 176,78 176,66 192,66 192,54 250,54 250,150" />
      <rect class="g-wall g-edge" x="4" y="14" width="10" height="136" />
      <rect class="g-wall g-edge" x="250" y="4" width="10" height="146" />
      <rect class="g-wall g-edge" x="14" y="54" width="110" height="14" />
      <rect class="g-wall g-edge" x="14" y="4" width="236" height="8" />
      <path class="g-path" d="M110 138 A16 16 0 0 0 106 128" />
      <g class="g-dim"><circle cx="124" cy="137" r="8" /><text x="124" y="140.6">C</text></g>
      <Dim a={[14, 128]} b={[96, 128]} l="D" />
      <Dim a={[38, 68]} b={[38, 138]} l="E" />
      <Dim a={[120, 68]} b={[120, 114]} l="B" />
      <Dim a={[192, 46]} b={[250, 46]} l="F" />
      <Dim a={[243, 12]} b={[243, 54]} l="G" />
      <line class="g-line" x1="266" y1="92" x2="266" y2="146" />
      <line class="g-line" x1="294" y1="112" x2="294" y2="146" />
      <circle class="g-obj" cx="294" cy="109" r="3" />
      <text class="g-note" x="280" y="84" text-anchor="middle">width</text>
      <Dim a={[266, 130]} b={[292, 130]} l="A" />
    </Frame>
  );
}

const GUIDES: Record<SegmentKind, () => any> = {
  door: () => (
    <Frame label="Doorway seen from the front: A is the clear gap between the open door and the frame stop, B is floor to the top of the opening">
      <rect class="g-wall" x="0" y="0" width="300" height="136" />
      <rect class="g-open" x="100" y="20" width="100" height="116" />
      <polygon class="g-obj" points="100,20 126,31 126,143 100,136" />
      <rect class="g-obj" x="195" y="20" width="5" height="116" />
      <line class="g-line" x1="0" y1="136" x2="300" y2="136" />
      <text class="g-note" x="113" y="12" text-anchor="middle">open door</text>
      <text class="g-note" x="222" y="80">door stop</text>
      <Dim a={[178, 20]} b={[178, 136]} l="B" />
      <Dim a={[126, 112]} b={[195, 112]} l="A" />
    </Frame>
  ),
  hall: () => (
    <Frame label="Hallway seen end-on: A is the narrowest width, measured from a radiator or shelf to the opposite wall, B is floor to the lowest part of the ceiling">
      <rect class="g-wall" x="0" y="0" width="300" height="150" />
      <rect class="g-open" x="70" y="14" width="160" height="122" />
      <rect class="g-obj" x="70" y="84" width="13" height="42" />
      <rect class="g-wall g-edge" x="176" y="14" width="54" height="16" />
      <text class="g-note" x="62" y="108" text-anchor="end">radiator</text>
      <text class="g-note" x="238" y="26">beam</text>
      <Dim a={[83, 104]} b={[230, 104]} l="A" />
      <Dim a={[203, 30]} b={[203, 136]} l="B" />
    </Frame>
  ),
  corner: () => (
    <Frame label="Corner seen from above: A is the width of the passage before the turn, B is the width after the turn, C is floor to ceiling at the corner">
      <rect class="g-wall" x="0" y="0" width="300" height="150" />
      <polygon class="g-open" points="20,28 205,28 205,150 140,150 140,84 20,84" />
      <path class="g-path" d="M34 56 H160 Q173 56 173 70 V134" />
      <polygon class="g-arrow" points="167,132 179,132 173,143" />
      <text class="g-note" x="20" y="20">seen from above</text>
      <text class="g-note" x="215" y="62">C = floor to</text>
      <text class="g-note" x="215" y="75">ceiling here</text>
      <Dim a={[72, 28]} b={[72, 84]} l="A" />
      <Dim a={[140, 112]} b={[205, 112]} l="B" />
    </Frame>
  ),
  stairsStraight: () => <StairSide />,
  stairsQuarter: () => (
    <>
      <StairSide />
      <Frame label="Quarter-turn stairs seen from above: A is the width of the first flight, H is the width of the second flight, I is floor to ceiling above the landing">
        <rect class="g-wall" x="0" y="0" width="300" height="150" />
        <polygon class="g-open" points="20,64 140,64 140,8 205,8 205,120 20,120" />
        {[34, 48, 62, 76, 90, 104, 118].map((x) => <line class="g-tread" x1={x} y1="64" x2={x} y2="120" />)}
        {[52, 40, 28, 16].map((y) => <line class="g-tread" x1="140" y1={y} x2="205" y2={y} />)}
        <text class="g-note" x="20" y="56">first flight</text>
        <text class="g-note" x="172" y="96" text-anchor="middle">landing</text>
        <text class="g-note" x="215" y="30">second flight</text>
        <text class="g-note" x="215" y="88">I = floor to ceiling</text>
        <text class="g-note" x="215" y="101">above the landing</text>
        <Dim a={[90, 64]} b={[90, 120]} l="A" />
        <Dim a={[140, 34]} b={[205, 34]} l="H" />
      </Frame>
    </>
  ),
  stairsHalf: () => (
    <>
      <StairSide />
      <Frame label="Half-turn stairs seen from above: A is the width of a flight, H is the depth of the landing, I is the width of the landing across both flights, J is floor to ceiling above the landing">
        <rect class="g-wall" x="0" y="0" width="300" height="150" />
        <rect class="g-open" x="30" y="88" width="140" height="44" />
        <rect class="g-open" x="30" y="22" width="140" height="44" />
        <rect class="g-open" x="170" y="22" width="56" height="110" />
        {[44, 58, 72, 86, 100, 114, 128, 142, 156].map((x) => (
          <>
            <line class="g-tread" x1={x} y1="88" x2={x} y2="132" />
            <line class="g-tread" x1={x} y1="22" x2={x} y2="66" />
          </>
        ))}
        <text class="g-note" x="34" y="144">first flight</text>
        <text class="g-note" x="34" y="14">second flight</text>
        <text class="g-note" x="236" y="60">J = floor to</text>
        <text class="g-note" x="236" y="73">ceiling above</text>
        <text class="g-note" x="236" y="86">the landing</text>
        <Dim a={[100, 88]} b={[100, 132]} l="A" />
        <Dim a={[170, 112]} b={[226, 112]} l="H" />
        <Dim a={[212, 22]} b={[212, 96]} l="I" />
      </Frame>
    </>
  ),
  room: () => (
    <Frame label="Room seen from the side: A is floor to ceiling at the lowest point, where the item will be tipped upright">
      <rect class="g-wall" x="0" y="0" width="300" height="150" />
      <rect class="g-open" x="30" y="16" width="240" height="118" />
      <rect class="g-obj" x="70" y="104" width="110" height="30" />
      <rect class="g-obj" x="70" y="24" width="30" height="110" opacity="0.35" />
      <path class="g-path" d="M180 104 A114 114 0 0 0 100 24" />
      <text class="g-note" x="190" y="124">carried in on its back</text>
      <text class="g-note" x="108" y="40">tipped upright</text>
      <Dim a={[236, 16]} b={[236, 134]} l="A" />
    </Frame>
  ),
  lift: () => (
    <Frame label="Lift: A and B are the width and height of the door opening, C and D are the inside width and depth seen from above, E is the inside height">
      <rect class="g-wall" x="12" y="14" width="120" height="124" />
      <rect class="g-open" x="42" y="32" width="60" height="106" />
      <line class="g-line" x1="12" y1="138" x2="132" y2="138" />
      <text class="g-note" x="72" y="10" text-anchor="middle">door</text>
      <Dim a={[42, 118]} b={[102, 118]} l="A" />
      <Dim a={[60, 32]} b={[60, 138]} l="B" />
      <rect class="g-open g-edge" x="170" y="26" width="110" height="92" />
      <line class="g-gap" x1="198" y1="118" x2="252" y2="118" />
      <text class="g-note" x="225" y="20" text-anchor="middle">inside, from above</text>
      <text class="g-note" x="225" y="136" text-anchor="middle">E = inside height</text>
      <Dim a={[170, 52]} b={[280, 52]} l="C" />
      <Dim a={[254, 26]} b={[254, 118]} l="D" />
    </Frame>
  ),
};

export function Guide({ kind }: { kind: SegmentKind }) {
  return GUIDES[kind]();
}
