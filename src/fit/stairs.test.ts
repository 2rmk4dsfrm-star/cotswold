import { describe, expect, it } from 'vitest';
import { checkSegment, type Item, type Segment } from './engine';
import { buildStairs, poseRange, searchPath, type PlanPose, type Scene, type StairParams } from './stairs';

const RAD = Math.PI / 180;
const base = { width: 85, headroom: 200, pitch: 40, above: 1, foot: 1, footSpace: 300, footCeil: 240, top: 2, topSpace: 90, topCeil: 240 };
const straight: StairParams = { kind: 'straight', ...base, steps: 13 };
const quarter: StairParams = { kind: 'quarter', ...base, steps: 7, steps2: 6, landDepth: 85, landCeil: 260 };
const half: StairParams = { kind: 'half', ...base, steps: 7, steps2: 6, landDepth: 90, landWidth: 180, landCeil: 260 };

/**
 * Independent check, sharing no code with the engine's collision test: scatter points
 * through the solid box and confirm every one is in open air (inside the plan, above
 * the floor, below the ceiling).
 */
function overlap(sc: Scene, L: number, Wd: number, T: number, p: PlanPose, tilt: number, z: number): number {
  const c = Math.cos(tilt * RAD);
  const s = Math.sin(tilt * RAD);
  // Allow 5 mm of contact: the engine lets the box touch walls and steps.
  L -= 1;
  Wd -= 1;
  T -= 1;
  let worst = 0;
  const n = 14;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= 6; j++) for (let k = 0; k <= 6; k++) {
    const l = (i / n - 0.5) * L;
    const w = (j / 6 - 0.5) * Wd;
    const t = (k / 6 - 0.5) * T;
    const along = l * c - t * s;
    const x = p.cx + along * p.ux - w * p.uy;
    const y = p.cy + along * p.uy + w * p.ux;
    const h = z + l * s + t * c;
    const zone = sc.zone(x, y);
    if (zone < 0) {
      worst = Math.max(worst, 99);
      continue;
    }
    worst = Math.max(worst, sc.floor(zone, x, y) - h, h - sc.ceil(zone, x, y));
  }
  return worst;
}

describe('staircase simulation', () => {
  const cases: [string, StairParams][] = [['straight', straight], ['quarter-turn', quarter], ['half-turn', half]];
  const items: [number, number, number][] = [[200, 60, 120], [180, 50, 90], [120, 60, 200], [150, 45, 80], [100, 40, 60]];

  for (const [name, params] of cases) {
    it(`never passes a path that overlaps anything (${name})`, () => {
      let found = 0;
      for (const variant of [params, { ...params, foot: 2, footSpace: 100 }, { ...params, top: 1, topSpace: 300 }, { ...params, above: 2 }]) {
        const { scene, route } = buildStairs(variant);
        for (const [L, Wd, T] of items) {
          const steps = route(L, Wd, T);
          const res = searchPath(scene, steps, L, Wd, T, false);
          if (!res.ok) continue;
          found++;
          let prev: [number, number] | null = null;
          for (const [i, tilt] of res.path) {
            const hs = (L / 2) * Math.cos(tilt * RAD) + (T / 2) * Math.sin(tilt * RAD);
            const pose = steps[i].pose(hs);
            const range = poseRange(scene, L, Wd, T, pose, tilt);
            expect(range).not.toBeNull();
            // Resting as low as the floor allows, nothing may poke through by more than a sliver.
            expect(overlap(scene, L, Wd, T, pose, tilt, range![0])).toBeLessThan(0.5);
            // And it must be able to get here from the previous position without a vertical jump.
            if (prev) expect(Math.max(prev[0], range![0])).toBeLessThanOrEqual(Math.min(prev[1], range![1]) + 1e-3);
            prev = range;
          }
        }
      }
      expect(found).toBeGreaterThan(3);
    });
  }

  it('agrees with the brute-force check on random poses', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let free = 0;
    for (let n = 0; n < 6000; n++) {
      const { scene } = buildStairs([quarter, half, straight, { ...half, above: 2 }][n % 4]);
      const ang = rnd() * 2 * Math.PI;
      const pose = { cx: -150 + rnd() * 500, cy: -50 + rnd() * 350, ux: Math.cos(ang), uy: Math.sin(ang) };
      const tilt = Math.floor(rnd() * 29) * 3;
      const [L, Wd, T] = [60 + rnd() * 160, 30 + rnd() * 40, 30 + rnd() * 80];
      const range = poseRange(scene, L, Wd, T, pose, tilt);
      if (!range) continue;
      free++;
      expect(overlap(scene, L, Wd, T, pose, tilt, range[0])).toBeLessThan(0.5);
      expect(overlap(scene, L, Wd, T, pose, tilt, range[1])).toBeLessThan(0.5);
    }
    expect(free).toBeGreaterThan(50);
  });
});

describe('staircase verdicts', () => {
  const seg = (kind: Segment['kind'], p: StairParams, extra: Record<string, number> = {}): Segment => {
    const { kind: _k, ...v } = p;
    return { id: kind, kind, v: { ...(v as unknown as Record<string, number>), ...extra } };
  };
  const wardrobe: Item = { name: 'Wardrobe', w: 120, d: 60, h: 200, keepUpright: false };
  const small: Item = { name: 'Bedside', w: 50, d: 40, h: 60, keepUpright: false };

  it('passes a small item everywhere', () => {
    expect(checkSegment(small, seg('stairsStraight', straight)).status).toBe('fits');
    expect(checkSegment(small, seg('stairsQuarter', quarter)).status).toBe('fits');
    expect(checkSegment(small, seg('stairsHalf', half)).status).toBe('fits');
  });

  it('rejects an item wider than the stairs', () => {
    const r = checkSegment({ ...wardrobe, d: 95, w: 100 }, seg('stairsStraight', straight));
    expect(r.status).toBe('no');
  });

  it('blocks a tall wardrobe where the headroom at the top is low, and names the stage', () => {
    const ok = checkSegment(wardrobe, seg('stairsStraight', straight));
    expect(ok.status).not.toBe('no');
    const low = checkSegment(wardrobe, seg('stairsStraight', straight, { topCeil: 150, topSpace: 70 }));
    expect(low.status).toBe('no');
    expect(low.stages!.find((s) => s.state === 'stuck')!.label).toMatch(/top/);
  });

  it('needs room at the foot: a short run-up under a low ceiling stops a long item', () => {
    const r = checkSegment(wardrobe, seg('stairsStraight', straight, { footSpace: 120, footCeil: 190 }));
    expect(r.status).toBe('no');
    expect(r.stages![0].state).toBe('stuck');
  });

  it('gets harder as the item grows', () => {
    const rank = { fits: 2, check: 1, no: 0, incomplete: -1 };
    for (const [kind, p] of [['stairsStraight', straight], ['stairsQuarter', quarter], ['stairsHalf', half]] as const) {
      let last = 2;
      for (const h of [120, 160, 200, 240, 280]) {
        const r = rank[checkSegment({ ...wardrobe, h }, seg(kind, p)).status];
        expect(r).toBeLessThanOrEqual(last);
        last = r;
      }
    }
  });

  it('answers quickly enough to use while typing', () => {
    const t0 = performance.now();
    checkSegment({ ...wardrobe, h: 201 }, seg('stairsHalf', half));
    checkSegment({ ...wardrobe, h: 231 }, seg('stairsQuarter', quarter));
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});
