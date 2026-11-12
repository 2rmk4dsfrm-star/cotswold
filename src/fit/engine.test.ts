import { describe, expect, it } from 'vitest';
import { checkRoute, checkSegment, cornerPass, rectInRect, type Item, type Segment } from './engine';

const sofa: Item = { name: 'Sofa', w: 220, d: 95, h: 85, keepUpright: false };
const seg = (kind: Segment['kind'], v: Segment['v']): Segment => ({ id: kind, kind, v });

describe('geometry', () => {
  it('fits a rectangle flat, rotated, or not at all', () => {
    expect(rectInRect(70, 180, 80, 200)).toBe(0);
    expect(rectInRect(85, 90, 80, 200)).toBeNull(); // narrowest side still wider than the gap
    // A thin 210-long panel only passes a 100 x 200 opening on the diagonal.
    expect(rectInRect(3, 210, 100, 200)).toBeGreaterThan(0);
    expect(rectInRect(3, 230, 100, 200)).toBeNull();
  });

  it('matches the ladder-round-a-corner limit (2*sqrt(2) for unit corridors)', () => {
    expect(cornerPass(282, 0.01, 100, 100)).toBe('pivot');
    expect(cornerPass(284, 0.01, 100, 100)).toBeNull();
  });

  it('lets a small footprint slide round without pivoting', () => {
    expect(cornerPass(100, 100, 100, 100)).toBe('slide');
  });
});

describe('route checks', () => {
  it('rejects a sofa deeper and taller than the doorway is wide', () => {
    const r = checkSegment(sofa, seg('door', { width: 80, height: 200 }));
    expect(r.status).toBe('no');
    expect(r.clearance).toBeCloseTo(-5, 0);
  });

  it('passes the same sofa through a wider door', () => {
    const r = checkSegment(sofa, seg('door', { width: 95, height: 200 }));
    expect(r.status).toBe('fits');
    expect(r.clearance).toBeCloseTo(10, 0);
  });

  it('catches the corner the tape measure misses', () => {
    // 100 cm hallways are wider than the sofa is deep, but it cannot turn flat.
    const low = checkSegment(sofa, seg('corner', { widthIn: 100, widthOut: 100, height: 200 }));
    expect(low.status).toBe('no');
    // With enough ceiling height it can be stood on end and walked round.
    const high = checkSegment(sofa, seg('corner', { widthIn: 100, widthOut: 100, height: 240 }));
    expect(high.status).not.toBe('no');
    expect(high.how).toMatch(/on one end|tipped/);
  });

  it('respects keep-upright items', () => {
    const cabinet: Item = { name: 'Cabinet', w: 120, d: 50, h: 210, keepUpright: true };
    expect(checkSegment(cabinet, seg('door', { width: 90, height: 198 })).status).toBe('no');
    expect(checkSegment({ ...cabinet, keepUpright: false }, seg('door', { width: 90, height: 198 })).status).toBe('fits');
  });

  it('uses perpendicular headroom on stairs', () => {
    const wardrobe: Item = { name: 'Wardrobe', w: 120, d: 60, h: 200, keepUpright: false };
    const ok = checkSegment(wardrobe, seg('stairs', { width: 85, headroom: 200, pitch: 40 }));
    expect(ok.status).toBe('fits');
    const low = checkSegment(wardrobe, seg('stairs', { width: 85, headroom: 70, pitch: 40 }));
    expect(low.status).toBe('no');
  });

  it('checks both lift door and car', () => {
    const car = { carWidth: 110, carDepth: 140, carHeight: 220 };
    expect(checkSegment(sofa, seg('lift', { doorWidth: 90, doorHeight: 200, ...car })).status).not.toBe('no');
    expect(checkSegment(sofa, seg('lift', { doorWidth: 90, doorHeight: 200, ...car, carHeight: 150, carDepth: 120 })).status).toBe('no');
  });

  it('reports the tightest step and skips unfinished ones', () => {
    const route = [
      seg('door', { width: 95, height: 200 }),
      seg('corner', { widthIn: 100, widthOut: 100, height: 200 }),
      seg('hall', { width: null, height: 240 }),
    ];
    const r = checkRoute(sofa, route);
    expect(r.status).toBe('no');
    expect(r.worst).toBe(1);
    expect(r.incomplete).toBe(1);
  });

  it('never reports more clearance for a bigger item', () => {
    const corner = seg('corner', { widthIn: 95, widthOut: 110, height: 235 });
    let last = Infinity;
    for (let w = 120; w <= 260; w += 20) {
      const c = checkSegment({ ...sofa, w }, corner).clearance;
      expect(c).toBeLessThanOrEqual(last + 0.5);
      last = c;
    }
  });
});
