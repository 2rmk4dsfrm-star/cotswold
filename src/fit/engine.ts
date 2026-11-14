/**
 * Fit engine: decides whether a box-shaped item can be carried through each
 * pinch point on a delivery route. All lengths are centimetres.
 *
 * The item is treated as its bounding box. Each check tries every allowed way
 * of carrying the box (which face is down, which end leads, rolled or tipped)
 * and reports the most comfortable one, with a clearance figure:
 * how much bigger (+) or smaller (-) the item could be and still just pass.
 */

import { buildStairs, searchPath, type SearchResult, type StageTag, type StairParams } from './stairs';

export type Dims = [w: number, d: number, h: number];

export interface Item {
  name: string;
  w: number | null;
  d: number | null;
  h: number | null;
  /** Item cannot be turned on its side, end or back (e.g. glass, stone tops). */
  keepUpright: boolean;
  /** Delivered in sections: the dimensions are those of the largest section. */
  sections?: boolean;
}

export type SegmentKind = 'door' | 'hall' | 'corner' | 'stairsStraight' | 'stairsQuarter' | 'stairsHalf' | 'lift' | 'room';

export interface Segment {
  id: string;
  kind: SegmentKind;
  v: Record<string, number | null>;
}

export type Status = 'fits' | 'check' | 'no' | 'incomplete';

export type Diagram =
  | { type: 'opening'; W: number; H: number; p: number; q: number; roll: number; caption: string }
  | { type: 'corner'; a: number; b: number; L: number; Wd: number; theta: number | null; caption: string };

export interface SegmentResult {
  status: Status;
  /** cm to spare (positive) or cm too big (negative). */
  clearance: number;
  how: string;
  diagram?: Diagram;
  /** Replaces the "about N cm to spare" line where a single number would mislead (stairs, rooms). */
  summary?: string;
  /** Stages of a staircase, in order, and how far the item gets. */
  stages?: { label: string; state: 'ok' | 'stuck' | 'pending' }[];
}

/**
 * Close calls are not decided by the tool: anything from slightly too big to
 * only just clearing is reported as "needs checking" for a person to look at.
 */
export const CHECK_OVER_CM = 5;
export const CHECK_UNDER_CM = 2;
/** Stairs are modelled more approximately, so their "needs checking" band is wider. */
export const STAIR_CHECK_OVER_CM = 8;
export const STAIR_CHECK_UNDER_CM = 3;

export function statusFor(clearance: number): Status {
  return clearance < -CHECK_UNDER_CM ? 'no' : clearance < CHECK_OVER_CM ? 'check' : 'fits';
}

const RAD = Math.PI / 180;
const EPS = 1e-6;

/* ---------- geometry primitives ---------- */

/**
 * Can a p x q rectangle fit inside a W x H rectangle? Returns the rotation
 * (degrees) of the smallest workable roll, or null.
 */
export function rectInRect(p: number, q: number, W: number, H: number, allowRotate = true): number | null {
  if (p <= W + EPS && q <= H + EPS) return 0;
  if (!allowRotate) return null;
  for (let deg = 1; deg <= 90; deg += 1) {
    const c = Math.cos(deg * RAD);
    const s = Math.sin(deg * RAD);
    if (p * c + q * s <= W + EPS && p * s + q * c <= H + EPS) return deg;
  }
  return null;
}

/** Spare length when pivoting an L x W footprint round a right-angle corner at angle theta. */
function cornerSlack(L: number, W: number, a: number, b: number, deg: number): number {
  const s = Math.sin(deg * RAD);
  const c = Math.cos(deg * RAD);
  return (b * s + a * c - W) / (s * c) - L;
}

/**
 * Can an L x W footprint (plan view) get round a right-angle corner from a
 * passage of width a into a passage of width b?
 * Returns 'slide' (no pivot needed), 'pivot', or null.
 */
export function cornerPass(L: number, W: number, a: number, b: number): 'slide' | 'pivot' | null {
  // Carry it into the corner lengthways, then walk it out sideways.
  if (W <= a + EPS && L <= b + EPS) return 'slide';
  if (W > Math.min(a, b) + EPS) return null;
  for (let deg = 1; deg < 90; deg += 1) {
    if (cornerSlack(L, W, a, b, deg) < -EPS) return null;
  }
  return 'pivot';
}

/** The pivot angle at which the footprint is closest to (or deepest into) the inner corner. */
export function tightestCornerAngle(L: number, W: number, a: number, b: number): number {
  let best = 45;
  let min = Infinity;
  for (let deg = 1; deg < 90; deg += 1) {
    const sl = cornerSlack(L, W, a, b, deg);
    if (sl < min) {
      min = sl;
      best = deg;
    }
  }
  return best;
}

/* ---------- orientations ---------- */

interface Orientation {
  travel: 0 | 1 | 2; // axis pointing along the direction of travel
  across: 0 | 1 | 2; // axis spanning the passage width
  up: 0 | 1 | 2; // axis pointing up
}

const ALL: Orientation[] = [
  { travel: 0, across: 1, up: 2 },
  { travel: 1, across: 0, up: 2 },
  { travel: 0, across: 2, up: 1 },
  { travel: 2, across: 0, up: 1 },
  { travel: 1, across: 2, up: 0 },
  { travel: 2, across: 1, up: 0 },
];

function orientations(upright: boolean): Orientation[] {
  return upright ? ALL.filter((o) => o.up === 2) : ALL;
}

const UP_TEXT = ['on its side (width pointing up)', 'laid on its back (depth pointing up)', 'the right way up'];
const LEAD_TEXT = ['with its left or right end leading', 'with its front or back leading', 'with its top or bottom leading'];

function describe(o: Orientation): string {
  return `Carry it ${UP_TEXT[o.up]}, ${LEAD_TEXT[o.travel]}`;
}

/* ---------- solver ---------- */

interface Config {
  o: Orientation;
  /** Degrees of roll or tip needed; used to prefer the simplest carry. */
  effort: number;
  note: string;
  diagram?: (dims: Dims) => Diagram;
}

type Pred = (dims: Dims, o: Orientation) => Omit<Config, 'o'> | null;

const grow = (d: Dims, g: number): Dims => [d[0] + g, d[1] + g, d[2] + g];

/** Largest uniform growth (cm) at which pred still passes. Negative = item too big. */
function clearanceOf(dims: Dims, test: (d: Dims) => unknown): number {
  let lo = -(Math.min(...dims) - 0.5);
  let hi = 400;
  if (!test(grow(dims, lo))) return lo;
  if (test(grow(dims, hi))) return hi;
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    if (test(grow(dims, mid))) lo = mid;
    else hi = mid;
  }
  return Math.round(lo * 10) / 10;
}

interface Solved {
  clearance: number;
  config: Config | null;
}

function solve(dims: Dims, upright: boolean, pred: Pred): Solved {
  let best: Solved = { clearance: -Infinity, config: null };
  for (const o of orientations(upright)) {
    const clearance = clearanceOf(dims, (d) => pred(d, o));
    // Describe the carry at the real size if it fits, otherwise at the size that just would.
    const at = clearance >= 0 ? dims : grow(dims, clearance - 0.05);
    const found = pred(at, o);
    if (!found) continue;
    const config: Config = { o, ...found };
    const better =
      clearance > best.clearance + 0.3 ||
      (Math.abs(clearance - best.clearance) <= 0.3 &&
        best.config !== null &&
        (config.effort < best.config.effort ||
          (config.effort === best.config.effort && o.up === 2 && best.config.o.up !== 2)));
    if (best.config === null || better) best = { clearance, config };
  }
  return best;
}

function toResult(dims: Dims, s: Solved, extra = ''): SegmentResult {
  const clearance = Math.round(s.clearance * 2) / 2;
  const status = statusFor(s.clearance);
  if (!s.config) return { status: 'no', clearance, how: 'No way of carrying it gets through here.' };
  const how = `${describe(s.config.o)}${s.config.note ? `, ${s.config.note}` : ''}.${extra}`;
  return { status, clearance, how, diagram: s.config.diagram?.(dims) };
}

/* ---------- checks ---------- */

function openingPred(W: number, H: number, upright: boolean, caption: string): Pred {
  return (d, o) => {
    const roll = rectInRect(d[o.across], d[o.up], W, H, !upright);
    if (roll === null) return null;
    return {
      effort: roll,
      note: roll > 0 ? `rolled about ${roll}° to use the diagonal of the opening` : 'kept level',
      diagram: (real) => ({ type: 'opening', W, H, p: real[o.across], q: real[o.up], roll, caption }),
    };
  };
}

function cornerPred(a: number, b: number, H: number, upright: boolean): Pred {
  return (d, o) => {
    const L = d[o.travel];
    const Wd = d[o.across];
    const T = d[o.up];
    const maxTip = upright ? 0 : 88;
    for (let tip = 0; tip <= maxTip; tip += 2) {
      const s = Math.sin(tip * RAD);
      const c = Math.cos(tip * RAD);
      if (L * s + T * c > H + EPS) continue;
      const Le = L * c + T * s; // plan-view length once one end is raised
      const mode = cornerPass(Le, Wd, a, b);
      if (!mode) continue;
      const tipNote = tip > 0 ? `with one end tipped up about ${tip}°` : 'kept level';
      const moveNote = mode === 'slide' ? ' — no pivot needed, walk it out sideways' : ', and pivot it round the corner';
      return {
        effort: tip,
        note: tipNote + moveNote,
        diagram: (real) => {
          const rl = real[o.travel] * c + real[o.up] * s;
          const rw = real[o.across];
          return {
            type: 'corner',
            a,
            b,
            L: rl,
            Wd: rw,
            theta: mode === 'slide' ? null : tightestCornerAngle(rl, rw, a, b),
            caption: 'Seen from above, at the tightest point of the turn',
          };
        },
      };
    }
    return null;
  };
}

function liftCarPred(carW: number, carD: number, carH: number, upright: boolean): Pred {
  return (d, o) => {
    const L = d[o.travel];
    const Wd = d[o.across];
    const T = d[o.up];
    if (L <= carD + EPS && Wd <= carW + EPS && T <= carH + EPS) return { effort: 0, note: 'standing square in the lift' };
    if (T <= carH + EPS) {
      const ang = rectInRect(L, Wd, carD, carW);
      if (ang !== null) return { effort: 10, note: 'angled corner to corner across the lift floor' };
    }
    if (!upright && Wd <= carW + EPS) {
      const ang = rectInRect(L, T, carD, carH);
      if (ang !== null) return { effort: ang, note: `leant back about ${ang}° inside the lift` };
    }
    return null;
  };
}

/* ---------- public API ---------- */

const STAIR_COMMON = ['width', 'headroom', 'pitch', 'above', 'foot', 'footSpace', 'footCeil', 'top', 'topSpace', 'topCeil'];

export const REQUIRED: Record<SegmentKind, string[]> = {
  door: ['width', 'height'],
  hall: ['width', 'height'],
  corner: ['widthIn', 'widthOut', 'height'],
  stairsStraight: [...STAIR_COMMON, 'steps'],
  stairsQuarter: [...STAIR_COMMON, 'steps', 'steps2', 'landDepth', 'landCeil'],
  stairsHalf: [...STAIR_COMMON, 'steps', 'steps2', 'landDepth', 'landWidth', 'landCeil'],
  room: ['height'],
  lift: ['doorWidth', 'doorHeight', 'carWidth', 'carDepth', 'carHeight'],
};

export function itemDims(item: Item): Dims | null {
  const { w, d, h } = item;
  if (!w || !d || !h || w <= 0 || d <= 0 || h <= 0) return null;
  return [w, d, h];
}

const STAGE_LABEL: Record<StageTag, string> = {
  foot: 'Getting onto the stairs',
  flight: 'Up the stairs',
  landing: 'Turning on the landing',
  top: 'Getting off at the top',
};

function checkStairs(dims: Dims, upright: boolean, seg: Segment): SegmentResult {
  const v = seg.v as Record<string, number>;
  const kind = seg.kind === 'stairsStraight' ? 'straight' : seg.kind === 'stairsQuarter' ? 'quarter' : 'half';
  const layout = buildStairs({ ...(v as unknown as StairParams), kind });
  const narrowest = Math.min(v.width, kind === 'quarter' ? v.landDepth : v.width);
  // Longest edge leading is the natural carry, so try those first.
  const carries = orientations(upright).sort((p, q) => dims[q.travel] - dims[p.travel]);

  let blocked: StageTag = 'foot';
  let blockedRank = -1;
  const order: StageTag[] = ['foot', 'flight', 'landing', 'top'];
  const attempt = (g: number): { o: Orientation; res: SearchResult } | null => {
    for (const o of carries) {
      const L = dims[o.travel] + g;
      const Wd = dims[o.across] + g;
      const T = dims[o.up] + g;
      if (L <= 0 || Wd <= 0 || T <= 0) continue;
      // Too wide for the stairs: no need to simulate.
      if (Wd > narrowest) continue;
      const steps = layout.route(L, Wd, T);
      const res = searchPath(layout.scene, steps, L, Wd, T, upright);
      if (res.ok) {
        // Prefer a way that never stands the item on end, so that advice is only given when it is needed.
        const gentle = upright ? res : searchPath(layout.scene, steps, L, Wd, T, false, 45);
        return { o, res: gentle.ok ? gentle : res };
      }
      const rank = order.indexOf(res.blockedAt!);
      if (rank > blockedRank) {
        blockedRank = rank;
        blocked = res.blockedAt!;
      }
    }
    return null;
  };

  const present = order.filter((t) => t !== 'landing' || kind !== 'straight');
  const stagesFor = (stuck?: StageTag) =>
    present.map((t) => ({
      label: STAGE_LABEL[t],
      state: !stuck ? ('ok' as const) : order.indexOf(t) < order.indexOf(stuck) ? ('ok' as const) : t === stuck ? ('stuck' as const) : ('pending' as const),
    }));
  const tiltNote = (res: SearchResult): string => {
    const notes: string[] = [];
    if ((res.maxTilt.foot ?? 0) >= 60) notes.push('stand it up on end at the foot of the stairs and lean it onto them');
    if ((res.maxTilt.landing ?? 0) >= 60) notes.push('stand it up on end to turn on the landing');
    if ((res.maxTilt.top ?? 0) >= 60) notes.push('stand it up on end to turn at the top');
    return notes.length ? ` You will need to ${notes.join(', and ')}.` : '';
  };

  const roomy = attempt(STAIR_CHECK_OVER_CM);
  if (roomy) {
    return {
      status: 'fits', clearance: STAIR_CHECK_OVER_CM, summary: 'Goes up with room to spare',
      how: `${describe(roomy.o)}.${tiltNote(roomy.res)}`, stages: stagesFor(),
    };
  }
  const close = attempt(0) ?? attempt(-STAIR_CHECK_UNDER_CM);
  if (close) {
    return {
      status: 'check', clearance: 0, summary: 'Too close to call on these measurements',
      how: `${describe(close.o)}.${tiltNote(close.res)} Any error in the measurements could decide it either way.`,
      stages: stagesFor(),
    };
  }
  blockedRank = -1;
  attempt(-STAIR_CHECK_UNDER_CM);
  const stuck: StageTag = blockedRank < 0 ? 'flight' : blocked;
  const over = attempt(-10) ? 10 : attempt(-20) ? 20 : 30;
  return {
    status: 'no', clearance: -over,
    summary: over === 30 ? 'Much too big for these stairs' : `Roughly ${over} cm too big`,
    how: blockedRank < 0
      ? 'It is too wide or too deep to lie on the stairs at all.'
      : `It gets stuck ${STAGE_LABEL[stuck].toLowerCase()}, whichever way it is carried.`,
    stages: stagesFor(stuck),
  };
}

const cache = new Map<string, SegmentResult>();

export function checkSegment(item: Item, seg: Segment): SegmentResult {
  const dims = itemDims(item);
  const v = seg.v;
  const complete = REQUIRED[seg.kind].every((k) => typeof v[k] === 'number' && (v[k] as number) > 0);
  if (!dims || !complete) return { status: 'incomplete', clearance: 0, how: '' };
  // Stair searches are the expensive part, so remember answers while the customer edits other steps.
  const key = JSON.stringify([dims, item.keepUpright, seg.kind, v]);
  let res = cache.get(key);
  if (!res) {
    res = compute(dims, item.keepUpright, seg);
    if (cache.size > 200) cache.clear();
    cache.set(key, res);
  }
  return res;
}

function compute(dims: Dims, up: boolean, seg: Segment): SegmentResult {
  const n = (k: string) => seg.v[k] as number;
  switch (seg.kind) {
    case 'door':
    case 'hall':
      return toResult(dims, solve(dims, up, openingPred(n('width'), n('height'), up, 'Looking straight through the opening')));
    case 'corner':
      return toResult(dims, solve(dims, up, cornerPred(n('widthIn'), n('widthOut'), n('height'), up)));
    case 'stairsStraight':
    case 'stairsQuarter':
    case 'stairsHalf':
      return checkStairs(dims, up, seg);
    case 'room': {
      // Tipping a box upright sweeps its diagonal under the ceiling.
      const clearance = Math.round((n('height') - Math.hypot(dims[2], Math.min(dims[0], dims[1]))) * 2) / 2;
      const status = statusFor(clearance);
      return {
        status, clearance,
        how: status === 'no'
          ? 'Lying on its back it is too long on the diagonal to be tipped upright under this ceiling.'
          : 'It can be carried in on its back and tipped upright in the room.',
      };
    }
    case 'lift': {
      const door = solve(dims, up, openingPred(n('doorWidth'), n('doorHeight'), up, 'Looking through the lift door'));
      const car = solve(dims, up, liftCarPred(n('carWidth'), n('carDepth'), n('carHeight'), up));
      if (door.clearance <= car.clearance) {
        return toResult(dims, door, door.clearance < 0 ? ' The lift door is the problem.' : ' The lift door is the tightest part.');
      }
      return toResult(dims, car, car.clearance < 0 ? ' It gets through the door but the lift is too small inside.' : '');
    }
  }
}

export interface RouteResult {
  status: Status;
  results: SegmentResult[];
  /** Index of the tightest completed segment, or -1. */
  worst: number;
  incomplete: number;
}

export function checkRoute(item: Item, route: Segment[]): RouteResult {
  const results = route.map((s) => checkSegment(item, s));
  // An item too tall to tip up in the room can still be delivered if it stays upright the whole way.
  const dims = itemDims(item);
  route.forEach((seg, i) => {
    const r = results[i];
    if (seg.kind !== 'room' || r.status !== 'no' || !dims) return;
    const ceiling = seg.v.height as number;
    const standing = statusFor(ceiling - dims[2]);
    if (standing === 'no') {
      results[i] = { ...r, how: 'It is taller than this ceiling.' };
      return;
    }
    const uprightItem = { ...item, keepUpright: true };
    const before = route.slice(0, i).filter((s) => s.kind !== 'room').map((s) => checkSegment(uprightItem, s));
    const done = before.filter((b) => b.status !== 'incomplete');
    if (done.some((b) => b.status === 'no')) {
      results[i] = { ...r, how: 'It cannot be tipped upright under this ceiling, and it cannot be carried upright all the way along this route.' };
      return;
    }
    const close = standing === 'check' || done.some((b) => b.status === 'check');
    results[i] = {
      status: close ? 'check' : 'fits',
      clearance: close ? 0 : CHECK_OVER_CM,
      summary: close ? 'Only if it stays upright, and that is close' : 'Fits if it stays upright all the way',
      how: 'It cannot be tipped upright under this ceiling, so it must be carried standing up from the front door. The route allows that.',
    };
  });
  let worst = -1;
  results.forEach((r, i) => {
    if (r.status === 'incomplete') return;
    if (worst === -1 || r.clearance < results[worst].clearance) worst = i;
  });
  return {
    status: worst === -1 ? 'incomplete' : results[worst].status,
    results,
    worst,
    incomplete: results.filter((r) => r.status === 'incomplete').length,
  };
}
