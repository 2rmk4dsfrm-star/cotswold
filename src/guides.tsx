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
  landing: () => (
    <Frame label="Stair landing seen from above: A is the clear width where the stairs arrive, B is the clear width where they leave, C is floor to ceiling above the landing">
      <rect class="g-wall" x="0" y="0" width="300" height="150" />
      <polygon class="g-open" points="20,28 205,28 205,150 140,150 140,84 20,84" />
      {[34, 48, 62, 76, 90, 104, 118].map((x) => <line class="g-tread" x1={x} y1="28" x2={x} y2="84" />)}
      {[102, 114, 126, 138].map((y) => <line class="g-tread" x1="140" y1={y} x2="205" y2={y} />)}
      <text class="g-note" x="20" y="20">seen from above</text>
      <text class="g-note" x="174" y="60" text-anchor="middle">landing</text>
      <text class="g-note" x="215" y="62">C = floor to</text>
      <text class="g-note" x="215" y="75">ceiling here</text>
      <Dim a={[128, 28]} b={[128, 84]} l="A" />
      <Dim a={[140, 93]} b={[205, 93]} l="B" />
    </Frame>
  ),
  stairs: () => (
    <Frame label="Stairs seen from the side: B is headroom, straight up from the edge of a step to the lowest ceiling above it, C is the steepness. Inset: A is the width from wall to handrail">
      <rect class="g-open" x="0" y="0" width="300" height="150" />
      <polygon class="g-wall g-edge" points="20,140 20,129 42,129 42,118 64,118 64,107 86,107 86,96 108,96 108,85 130,85 130,74 152,74 152,63 174,63 174,52 200,52 200,140" />
      <rect class="g-wall g-edge" x="0" y="8" width="140" height="14" />
      <text class="g-note" x="6" y="34">ceiling / floor above</text>
      <path class="g-path" d="M48 140 A28 28 0 0 0 42 126" />
      <g class="g-dim"><circle cx="62" cy="131" r="9" /><text x="62" y="134.6">C</text></g>
      <Dim a={[132, 22]} b={[132, 74]} l="B" />
      <line class="g-line" x1="222" y1="62" x2="222" y2="140" />
      <line class="g-line" x1="286" y1="88" x2="286" y2="140" />
      <circle class="g-obj" cx="286" cy="85" r="4" />
      <text class="g-note" x="254" y="54" text-anchor="middle">wall to handrail</text>
      <Dim a={[222, 112]} b={[282, 112]} l="A" />
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
