/**
 * Staircase checks.
 *
 * A staircase is modelled as a plan of zones (foot, flights, landing, top),
 * each with a floor height and a ceiling height. The item is a box carried
 * with one end leading and that end raised by a tilt angle. For a given carry,
 * the engine lays out a route through the staircase (slides and corner pivots)
 * and searches for a sequence of positions and tilts along it in which the box
 * never overlaps a wall, step or ceiling. A "fits" answer therefore always
 * comes with an actual collision-free path.
 *
 * Simplifications, all on the cautious side:
 *  - steps are filled in up to the line through their front edges;
 *  - where the stairs are open to the ceiling of the floor above, the lower ceiling is
 *    assumed to run level until the headroom drops to the measured minimum, and the
 *    upper ceiling takes over from there; under a sloping ceiling the measured
 *    minimum headroom is used along the whole flight;
 *  - risers are assumed to be 20 cm, so a flight of n steps rises n x 20 cm;
 *  - the item is not rolled onto a diagonal while on the stairs.
 */

const RAD = Math.PI / 180;
export const RISER = 20;
const E = 0.05;
const TILT_STEP = 3;
const TILT_MAX = 90;

export type StageTag = 'foot' | 'flight' | 'landing' | 'top';

export interface Scene {
  /** Zone id at a plan point, or -1 inside a wall. */
  zone(x: number, y: number): number;
  floor(zone: number, x: number, y: number): number;
  ceil(zone: number, x: number, y: number): number;
  /** Plan lines (nx*x + ny*y = c) where floor or ceiling height changes. */
  breaks: [number, number, number][];
  /** Outward wall corners that the item must not swallow. */
  corners: [number, number][];
}

export interface PlanPose {
  cx: number;
  cy: number;
  /** Unit direction of the leading end, in plan. */
  ux: number;
  uy: number;
}

export interface Step {
  tag: StageTag;
  /** Pose for a given half plan-length of the (possibly tilted) item. */
  pose(hs: number): PlanPose;
}

/** Vertical range [lo, hi] the box centre may occupy at this pose, or null if it cannot be here at all. */
export function poseRange(
  sc: Scene, L: number, Wd: number, T: number, p: PlanPose, tiltDeg: number,
): [number, number] | null {
  const phi = tiltDeg * RAD;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const a = L / 2;
  const b = T / 2;
  const hw = Wd / 2;
  const hs = a * c + b * s;
  const { cx, cy, ux, uy } = p;
  const vx = -uy;
  const vy = ux;

  // 1. Plan: the footprint must lie inside the floor plan.
  const nLong = Math.ceil((2 * hs) / 12) + 1;
  const nShort = Math.ceil(Wd / 12) + 1;
  for (let i = 0; i <= nLong; i++) {
    const ds = -hs + (2 * hs * i) / nLong;
    for (const dt of [-hw, hw]) {
      if (sc.zone(cx + ds * ux + dt * vx, cy + ds * uy + dt * vy) < 0) return null;
    }
  }
  for (let i = 0; i <= nShort; i++) {
    const dt = -hw + (Wd * i) / nShort;
    for (const ds of [-hs, hs]) {
      if (sc.zone(cx + ds * ux + dt * vx, cy + ds * uy + dt * vy) < 0) return null;
    }
  }
  for (const [qx, qy] of sc.corners) {
    const ds = (qx - cx) * ux + (qy - cy) * uy;
    const dt = (qx - cx) * vx + (qy - cy) * vy;
    if (Math.abs(ds) < hs - 0.2 && Math.abs(dt) < hw - 0.2) return null;
  }

  // 2. Height: find how high the box must sit to clear the floor, and how high it may sit under the ceiling.
  let lo = -Infinity;
  let hi = Infinity;
  const sample = (ds: number, dt: number) => {
    const x = cx + ds * ux + dt * vx;
    const y = cy + ds * uy + dt * vy;
    const z = sc.zone(x, y);
    if (z < 0) return;
    // Vertical extent of the tilted box above/below its centre at this distance along its length.
    let zlMin = -b;
    let zlMax = b;
    let base = 0;
    let low: number;
    let high: number;
    if (c < 1e-6) {
      // Standing fully on end.
      low = -a;
      high = a;
    } else {
      if (s > 1e-9) {
        zlMin = Math.max(-b, (-a * c - ds) / s);
        zlMax = Math.min(b, (a * c - ds) / s);
        base = (ds * s) / c;
      }
      low = base + zlMin / c;
      high = base + zlMax / c;
    }
    const need = sc.floor(z, x, y) - low;
    const cap = sc.ceil(z, x, y) - high;
    if (need > lo) lo = need;
    if (cap < hi) hi = cap;
  };

  const sIn = hs - 0.02;
  const tIn = hw - 0.02;
  const sList: number[] = [];
  for (let i = 0; i <= 8; i++) sList.push(-sIn + (2 * sIn * i) / 8);
  const kink = a * c - b * s;
  if (Math.abs(kink) < sIn) sList.push(kink, -kink);
  const tList = [-tIn, 0, tIn];
  for (const ds of sList) for (const dt of tList) sample(ds, dt);

  // Extra samples either side of every line where the floor or ceiling steps.
  for (const [nx, ny, cc] of sc.breaks) {
    const nu = nx * ux + ny * uy;
    const nv = nx * vx + ny * vy;
    const n0 = cc - (nx * cx + ny * cy);
    if (Math.abs(nu) > 1e-6) {
      for (const dt of tList) {
        const ds = (n0 - dt * nv) / nu;
        if (Math.abs(ds) < sIn) {
          sample(ds - 0.05, dt);
          sample(ds + 0.05, dt);
        }
      }
    }
    if (Math.abs(nv) > 1e-6) {
      for (const ds of sList) {
        const dt = (n0 - ds * nu) / nv;
        if (Math.abs(dt) < tIn) {
          sample(ds, dt - 0.05);
          sample(ds, dt + 0.05);
        }
      }
    }
  }
  return lo <= hi + 1e-6 ? [lo, hi] : null;
}

export interface SearchResult {
  ok: boolean;
  /** Stage where the item stops, when it does not get through. */
  blockedAt?: StageTag;
  /** Largest tilt used in each stage of the path found. */
  maxTilt: Partial<Record<StageTag, number>>;
  /** The path found: [step index, tilt in degrees], start to finish. */
  path: [number, number][];
}

/** Breadth-first search over (position along the route, tilt) for a collision-free way through. */
export function searchPath(
  sc: Scene, steps: Step[], L: number, Wd: number, T: number, upright: boolean, maxTilt = TILT_MAX,
): SearchResult {
  const tilts: number[] = [];
  for (let t = 0; t <= (upright ? 0 : maxTilt); t += TILT_STEP) tilts.push(t);
  const N = steps.length;
  const J = tilts.length;
  const hsOf = tilts.map((t) => (L / 2) * Math.cos(t * RAD) + (T / 2) * Math.sin(t * RAD));
  const state = new Int8Array(N * J); // 0 unknown, 1 free, 2 blocked
  const lo = new Float32Array(N * J);
  const hi = new Float32Array(N * J);
  const parent = new Int32Array(N * J).fill(-2);
  const evalCell = (i: number, j: number): boolean => {
    const k = i * J + j;
    if (state[k] === 0) {
      const r = poseRange(sc, L, Wd, T, steps[i].pose(hsOf[j]), tilts[j]);
      if (r) {
        state[k] = 1;
        lo[k] = r[0];
        hi[k] = r[1];
      } else state[k] = 2;
    }
    return state[k] === 1;
  };

  const queue: number[] = [];
  for (let j = 0; j < J; j++) {
    if (evalCell(0, j)) {
      parent[j] = -1;
      queue.push(j);
    }
  }
  let furthest = 0;
  let goal = -1;
  for (let head = 0; head < queue.length && goal < 0; head++) {
    const k = queue[head];
    const i = Math.floor(k / J);
    const j = k - i * J;
    if (i > furthest) furthest = i;
    if (i === N - 1) {
      goal = k;
      break;
    }
    for (let di = 1; di >= -1; di--) {
      const ni = i + di;
      if (ni < 0 || ni >= N) continue;
      for (let dj = -1; dj <= 1; dj++) {
        const nj = j + dj;
        if ((di === 0 && dj === 0) || nj < 0 || nj >= J) continue;
        const nk = ni * J + nj;
        if (parent[nk] !== -2 || !evalCell(ni, nj)) continue;
        // The box must be able to move between the two poses without a vertical jump through anything.
        if (Math.max(lo[k], lo[nk]) > Math.min(hi[k], hi[nk]) + 1e-6) continue;
        parent[nk] = k;
        queue.push(nk);
      }
    }
  }

  const used: Partial<Record<StageTag, number>> = {};
  const path: [number, number][] = [];
  if (goal < 0) {
    return { ok: false, blockedAt: steps[Math.min(N - 1, furthest + 1)].tag, maxTilt: used, path };
  }
  for (let k = goal; k >= 0; k = parent[k]) {
    const i = Math.floor(k / J);
    const tilt = tilts[k - i * J];
    path.push([i, tilt]);
    const tag = steps[i].tag;
    if ((used[tag] ?? -1) < tilt) used[tag] = tilt;
  }
  path.reverse();
  return { ok: true, maxTilt: used, path };
}

/* ---------- route building ---------- */

type PoseFn = (hs: number) => PlanPose;

function slide(tag: StageTag, from: PoseFn, to: PoseFn, refHs: number): Step[] {
  const f = from(refHs);
  const t = to(refHs);
  const n = Math.max(2, Math.ceil(Math.hypot(t.cx - f.cx, t.cy - f.cy) / 8));
  const out: Step[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    out.push({
      tag,
      pose: (hs) => {
        const p = from(hs);
        const q = to(hs);
        return { cx: p.cx + (q.cx - p.cx) * k, cy: p.cy + (q.cy - p.cy) * k, ux: q.ux, uy: q.uy };
      },
    });
  }
  return out;
}

interface Frame {
  /** Outer corner of the turn. */
  ox: number;
  oy: number;
  /** Unit vector along the first passage, and along the second. */
  ex: [number, number];
  ey: [number, number];
}

/**
 * Pivot round a right-angle turn with the item's outer side touching both outer walls
 * (the tightest-turning way to carry a box round a corner). theta is the angle from the first passage.
 */
function pivot(tag: StageTag, f: Frame, Wd: number, leadAtP1: boolean, from: number, to: number): Step[] {
  const out: Step[] = [];
  const n = 30;
  for (let i = 0; i <= n; i++) {
    const th = (from + ((to - from) * i) / n) * RAD;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const lx = leadAtP1 ? -c : c;
    const ly = leadAtP1 ? s : -s;
    out.push({
      tag,
      pose: (hs) => {
        const X = hs * c + (Wd * s) / 2;
        const Y = hs * s + (Wd * c) / 2;
        return {
          cx: f.ox + X * f.ex[0] + Y * f.ey[0],
          cy: f.oy + X * f.ex[1] + Y * f.ey[1],
          ux: lx * f.ex[0] + ly * f.ey[0],
          uy: lx * f.ex[1] + ly * f.ey[1],
        };
      },
    });
  }
  return out;
}

export interface StairParams {
  kind: 'straight' | 'quarter' | 'half';
  width: number;
  headroom: number;
  pitch: number;
  /** What is over the stairs: 1 = open to the ceiling of the floor above, 2 = a sloping ceiling. */
  above: number;
  /** 1 = straight on, 2 = from the side / turn. */
  foot: number;
  footSpace: number;
  footCeil: number;
  top: number;
  topSpace: number;
  topCeil: number;
  steps: number;
  steps2?: number;
  /** Quarter-turn: width of the second flight. Half-turn: depth of the landing. */
  landDepth?: number;
  /** Half-turn: width of the landing across both flights. */
  landWidth?: number;
  landCeil?: number;
}

export interface Layout {
  scene: Scene;
  route(L: number, Wd: number, T: number): Step[];
}

export function buildStairs(p: StairParams): Layout {
  const tan = Math.tan(p.pitch * RAD);
  const g = RISER / tan;
  const W = p.width;
  const side = p.foot === 2;
  const turn = p.top === 2;
  const X1 = (p.steps - 1) * g;
  const H1 = p.steps * RISER;
  const inW = (y: number) => y >= -E && y <= W + E;
  const at = (cx: number, cy: number, ux: number, uy: number): PlanPose => ({ cx, cy, ux, uy });
  /** Ceiling over a flight, given the ceilings of the levels it leaves and arrives at. */
  const over = (floor: number, lowerC: number, upperC: number) => {
    if (p.above === 2) return floor + p.headroom;
    return lowerC - floor >= p.headroom ? Math.min(lowerC, upperC) : upperC;
  };
  /** Distance along a flight (from its first riser) at which the lower ceiling gives way to the upper one. */
  const opening = (base: number, lowerC: number) => (lowerC - p.headroom - base - RISER) / tan;

  // Getting onto the first flight is the same for every staircase shape.
  const footRoute = (L: number, Wd: number): { steps: Step[]; on: PoseFn } => {
    const ref = L / 2;
    if (!side) {
      const on: PoseFn = (hs) => at(hs + 5, W / 2, 1, 0);
      return { steps: slide('foot', (hs) => at(-hs - 2, W / 2, 1, 0), on, ref), on };
    }
    const y = W - Wd / 2;
    const on: PoseFn = (hs) => at(hs + 5, y, 1, 0);
    const frame: Frame = { ox: -p.footSpace, oy: W, ex: [1, 0], ey: [0, -1] };
    return {
      steps: [...pivot('foot', frame, Wd, false, 90, 0), ...slide('foot', (hs) => at(-p.footSpace + hs, y, 1, 0), on, ref)],
      on,
    };
  };
  const footZone = (x: number, y: number, yMax = Infinity) =>
    x >= -p.footSpace - E && (side ? y <= yMax : inW(y)) ? 0 : -1;
  const footCorners = (): [number, number][] => (side ? [[0, 0], [0, W]] : []);

  if (p.kind === 'straight') {
    const Xt = X1;
    const Hs = H1;
    const scene: Scene = {
      zone: (x, y) => {
        if (x < 0) return footZone(x, y);
        if (x <= Xt) return inW(y) ? 1 : -1;
        return x <= Xt + p.topSpace + E && (turn || inW(y)) ? 2 : -1;
      },
      floor: (z, x) => (z === 0 ? 0 : z === 1 ? RISER + x * tan : Hs),
      ceil: (z, x) => (z === 0 ? p.footCeil : z === 1 ? over(RISER + x * tan, p.footCeil, Hs + p.topCeil) : Hs + p.topCeil),
      breaks: [[1, 0, 0], [1, 0, Xt], [1, 0, opening(0, p.footCeil)]],
      corners: [...footCorners(), ...(turn ? ([[Xt, 0], [Xt, W]] as [number, number][]) : [])],
    };
    return {
      scene,
      route: (L, Wd) => {
        const ref = L / 2;
        const foot = footRoute(L, Wd);
        const out = [...foot.steps];
        if (!turn) {
          out.push(...slide('flight', foot.on, (hs) => at(Xt - hs - 5, W / 2, 1, 0), ref));
          out.push(...slide('top', (hs) => at(Xt - hs - 5, W / 2, 1, 0), (hs) => at(Xt + hs + 2, W / 2, 1, 0), ref));
          return out;
        }
        const below: PoseFn = (hs) => at(Xt - hs - 5, Wd / 2, 1, 0);
        out.push(...slide('flight', foot.on, below, ref));
        out.push(...slide('top', below, (hs) => at(Xt + p.topSpace - hs, Wd / 2, 1, 0), ref));
        out.push(...pivot('top', { ox: Xt + p.topSpace, oy: 0, ex: [-1, 0], ey: [0, 1] }, Wd, true, 0, 90));
        return out;
      },
    };
  }

  const n2 = p.steps2 ?? 1;
  const Y2 = (n2 - 1) * g;
  const Hs = H1 + n2 * RISER;
  const A = p.landDepth ?? W;
  const landCeil = p.landCeil ?? p.headroom;
  // First turn, from the first flight onto the landing: identical for quarter- and half-turn stairs.
  const firstTurn = (L: number, Wd: number, on: PoseFn): Step[] => {
    const start: PoseFn = (hs) => at(X1 + A - hs, Wd / 2, 1, 0);
    return [
      ...slide('flight', on, start, L / 2),
      ...pivot('landing', { ox: X1 + A, oy: 0, ex: [-1, 0], ey: [0, 1] }, Wd, true, 0, 90),
    ];
  };

  if (p.kind === 'quarter') {
    // Second flight leaves the landing at right angles, heading +y, and is A wide.
    const yTop = W + Y2;
    const scene: Scene = {
      zone: (x, y) => {
        if (x < 0) return footZone(x, y);
        if (x < X1) return inW(y) ? 1 : -1;
        if (y > yTop) return y <= yTop + p.topSpace + E && (turn || x <= X1 + A + E) ? 4 : -1;
        if (x > X1 + A + E) return -1;
        if (y > W) return 3;
        return y >= -E ? 2 : -1;
      },
      floor: (z, x, y) => (z === 0 ? 0 : z === 1 ? RISER + x * tan : z === 2 ? H1 : z === 3 ? H1 + RISER + (y - W) * tan : Hs),
      ceil: (z, x, y) =>
        z === 0 ? p.footCeil
        : z === 1 ? over(RISER + x * tan, p.footCeil, H1 + landCeil)
        : z === 2 ? H1 + landCeil
        : z === 3 ? over(H1 + RISER + (y - W) * tan, H1 + landCeil, Hs + p.topCeil)
        : Hs + p.topCeil,
      breaks: [
        [1, 0, 0], [1, 0, X1], [0, 1, W], [0, 1, yTop],
        [1, 0, opening(0, p.footCeil)], [0, 1, W + opening(H1, H1 + landCeil)],
      ],
      corners: [...footCorners(), [X1, W], ...(turn ? ([[X1 + A, yTop]] as [number, number][]) : [])],
    };
    return {
      scene,
      route: (L, Wd) => {
        const ref = L / 2;
        const foot = footRoute(L, Wd);
        const out = [...foot.steps, ...firstTurn(L, Wd, foot.on)];
        const x2 = X1 + A - Wd / 2;
        const onSecond: PoseFn = (hs) => at(x2, W + hs + 5, 0, 1);
        out.push(...slide('landing', (hs) => at(x2, hs, 0, 1), onSecond, ref));
        if (!turn) {
          out.push(...slide('top', onSecond, (hs) => at(X1 + A / 2, yTop + hs + 2, 0, 1), ref));
          return out;
        }
        out.push(...slide('top', onSecond, (hs) => at(X1 + Wd / 2, yTop + p.topSpace - hs, 0, 1), ref));
        out.push(...pivot('top', { ox: X1, oy: yTop + p.topSpace, ex: [0, -1], ey: [1, 0] }, Wd, true, 0, 90));
        return out;
      },
    };
  }

  // Half-turn: the second flight doubles back alongside the first, heading -x.
  const B = p.landWidth ?? 2 * W;
  const W2 = Math.max(1, Math.min(W, B - W));
  const Xe = X1 - Y2;
  const scene: Scene = {
    zone: (x, y) => {
      if (y > W + E) {
        if (y > B + E && !(turn && x < Xe)) return -1;
        if (x >= X1) return x <= X1 + A + E ? 2 : -1;
        if (y < B - W2 - E) return -1;
        if (x >= Xe) return 3;
        return x >= Xe - p.topSpace - E ? 4 : -1;
      }
      if (x < 0) return footZone(x, y, W + E);
      if (y < -E) return -1;
      if (x < X1) return 1;
      return x <= X1 + A + E ? 2 : -1;
    },
    floor: (z, x) => (z === 0 ? 0 : z === 1 ? RISER + x * tan : z === 2 ? H1 : z === 3 ? H1 + RISER + (X1 - x) * tan : Hs),
    ceil: (z, x) =>
      z === 0 ? p.footCeil
      : z === 1 ? over(RISER + x * tan, p.footCeil, H1 + landCeil)
      : z === 2 ? H1 + landCeil
      : z === 3 ? over(H1 + RISER + (X1 - x) * tan, H1 + landCeil, Hs + p.topCeil)
      : Hs + p.topCeil,
    breaks: [
      [1, 0, 0], [1, 0, X1], [1, 0, Xe],
      [1, 0, opening(0, p.footCeil)], [1, 0, X1 - opening(H1, H1 + landCeil)],
    ],
    corners: [...footCorners(), [X1, W], [X1, B - W2], ...(turn ? ([[Xe, B]] as [number, number][]) : [])],
  };
  return {
    scene,
    route: (L, Wd) => {
      const ref = L / 2;
      const foot = footRoute(L, Wd);
      const out = [...foot.steps, ...firstTurn(L, Wd, foot.on)];
      const xFar = X1 + A - Wd / 2;
      out.push(...slide('landing', (hs) => at(xFar, hs, 0, 1), (hs) => at(xFar, B - hs, 0, 1), ref));
      out.push(...pivot('landing', { ox: X1 + A, oy: B, ex: [-1, 0], ey: [0, -1] }, Wd, false, 90, 0));
      const onSecond: PoseFn = (hs) => at(X1 + A - hs, B - Wd / 2, -1, 0);
      if (!turn) {
        out.push(...slide('top', onSecond, (hs) => at(Xe - hs - 2, B - W2 / 2, -1, 0), ref));
        return out;
      }
      out.push(...slide('top', onSecond, (hs) => at(Xe - p.topSpace + hs, B - W2 + Wd / 2, -1, 0), ref));
      out.push(...pivot('top', { ox: Xe - p.topSpace, oy: B - W2, ex: [1, 0], ey: [0, 1] }, Wd, true, 0, 90));
      return out;
    },
  };
}
