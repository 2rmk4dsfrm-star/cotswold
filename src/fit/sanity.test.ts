import { describe, expect, it } from 'vitest';
import { itemWarnings, segmentWarnings } from './sanity';
import type { Segment } from './engine';

const seg = (kind: Segment['kind'], v: Segment['v']): Segment => ({ id: kind, kind, v });

describe('sanity checks', () => {
  it('stays quiet for ordinary measurements', () => {
    expect(segmentWarnings(seg('door', { width: 76, height: 198 }))).toEqual([]);
    expect(segmentWarnings(seg('stairs', { width: 85, headroom: 200, pitch: 40 }))).toEqual([]);
    expect(segmentWarnings(seg('corner', { widthIn: 90, widthOut: null, height: 240 }))).toEqual([]);
  });

  it('spots millimetres, metres and inches and offers the conversion', () => {
    expect(segmentWarnings(seg('door', { width: 762, height: 198 }))[0].fix?.value).toBe(76);
    expect(segmentWarnings(seg('door', { width: 0.8, height: 198 }))[0].fix?.value).toBe(80);
    const inches = segmentWarnings(seg('door', { width: 30, height: 198 }))[0];
    expect(inches.text).toMatch(/inches/);
    expect(inches.fix?.value).toBe(76);
  });

  it('spots swapped width and height', () => {
    const w = segmentWarnings(seg('door', { width: 198, height: 80 }));
    expect(w.length).toBeGreaterThan(0);
    expect(segmentWarnings(seg('door', { width: 120, height: 100 })).some((x) => /wrong way round/.test(x.text))).toBe(false);
  });

  it('questions stairwell-height headroom and odd pitches', () => {
    expect(segmentWarnings(seg('stairs', { width: 85, headroom: 300, pitch: 40 }))[0].key).toBe('headroom');
    expect(segmentWarnings(seg('stairs', { width: 85, headroom: 200, pitch: 70 }))[0].fix?.value).toBe(40);
  });

  it('checks the item too', () => {
    expect(itemWarnings({ name: '', w: 2200, d: 95, h: 85, keepUpright: false })[0].fix?.value).toBe(220);
    expect(itemWarnings({ name: '', w: 220, d: 95, h: 85, keepUpright: false })).toEqual([]);
  });
});
