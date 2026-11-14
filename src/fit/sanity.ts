/**
 * Sanity checks: catch measurements that are probably a mistake (wrong unit,
 * swapped fields, measured the wrong thing) before they produce a wrong verdict.
 * Warnings never block the check; they ask the customer to look again.
 */
import type { Item, Segment, SegmentKind } from './engine';

export interface Warning {
  key: string;
  text: string;
  /** A corrected value the customer can accept with one tap. */
  fix?: { value: number; label: string };
}

interface Range {
  min: number;
  max: number;
  what: string;
}

const CEILING: Range = { min: 190, max: 400, what: 'ceiling height' };
const PASSAGE = (what: string): Range => ({ min: 60, max: 300, what });

const STAIRS: Record<string, Range> = {
  width: { min: 55, max: 150, what: 'stair width' },
  headroom: { min: 150, max: 350, what: 'stair headroom' },
  footSpace: { min: 60, max: 1000, what: 'space at the foot of the stairs' },
  footCeil: CEILING,
  topSpace: { min: 60, max: 1000, what: 'space at the top of the stairs' },
  topCeil: CEILING,
};
const LAND_CEILING: Range = { min: 190, max: 700, what: 'ceiling height above a landing' };

export const RANGES: Record<SegmentKind, Record<string, Range>> = {
  door: {
    width: { min: 55, max: 130, what: 'doorway width' },
    height: { min: 170, max: 260, what: 'doorway height' },
  },
  hall: { width: PASSAGE('hallway width'), height: CEILING },
  corner: { widthIn: PASSAGE('passage width'), widthOut: PASSAGE('passage width'), height: CEILING },
  stairsStraight: STAIRS,
  stairsQuarter: { ...STAIRS, landDepth: { min: 55, max: 150, what: 'stair width' }, landCeil: LAND_CEILING },
  stairsHalf: {
    ...STAIRS,
    landDepth: { min: 60, max: 300, what: 'landing depth' },
    landWidth: { min: 120, max: 400, what: 'landing width' },
    landCeil: LAND_CEILING,
  },
  room: { height: CEILING },
  lift: {
    doorWidth: { min: 60, max: 200, what: 'lift door width' },
    doorHeight: { min: 180, max: 250, what: 'lift door height' },
    carWidth: { min: 80, max: 300, what: 'lift width' },
    carDepth: { min: 80, max: 300, what: 'lift depth' },
    carHeight: { min: 190, max: 300, what: 'lift height' },
  },
};

const round = (n: number) => Math.round(n * 2) / 2;
const inRange = (n: number, r: Range) => n >= r.min && n <= r.max;

function checkLength(key: string, v: number, r: Range): Warning | null {
  if (inRange(v, r)) return null;
  // Wrong unit is the most common slip, so test those first and offer the conversion.
  if (v > r.max && inRange(v / 10, r)) {
    return { key, text: `${v} cm is ${(v / 100).toFixed(1)} m — did you enter millimetres?`, fix: { value: round(v / 10), label: `Use ${round(v / 10)} cm` } };
  }
  if (v < r.min && inRange(v * 100, r)) {
    return { key, text: `${v} cm is tiny for a ${r.what} — did you enter metres?`, fix: { value: round(v * 100), label: `Use ${round(v * 100)} cm` } };
  }
  if (v < r.min && inRange(v * 2.54, r)) {
    return { key, text: `${v} cm is very small for a ${r.what}. If you measured in inches, that is ${round(v * 2.54)} cm.`, fix: { value: round(v * 2.54), label: `Use ${round(v * 2.54)} cm` } };
  }
  const side = v < r.min ? 'small' : 'large';
  return { key, text: `${v} cm is unusually ${side} for a ${r.what} (most are ${r.min}–${r.max} cm). Please measure it again.` };
}

export function segmentWarnings(seg: Segment): Warning[] {
  const out: Warning[] = [];
  const v = seg.v;
  const has = (k: string) => typeof v[k] === 'number' && (v[k] as number) > 0;
  for (const [key, range] of Object.entries(RANGES[seg.kind])) {
    if (!has(key)) continue;
    const w = checkLength(key, v[key] as number, range);
    if (w) out.push(w);
  }
  const flagged = (k: string) => out.some((w) => w.key === k);

  if ((seg.kind === 'door' || seg.kind === 'lift') && out.length === 0) {
    const [wk, hk] = seg.kind === 'door' ? ['width', 'height'] : ['doorWidth', 'doorHeight'];
    if (has(wk) && has(hk) && (v[wk] as number) > (v[hk] as number)) {
      out.push({ key: hk, text: 'The width is bigger than the height — are they the wrong way round?' });
    }
  }
  if (seg.kind.startsWith('stairs')) {
    if (has('pitch') && ((v.pitch as number) < 25 || (v.pitch as number) > 50)) {
      out.push({ key: 'pitch', text: `${v.pitch}° is unusual — most home stairs are between 35° and 42°. Leave it at 40° if you are not sure.`, fix: { value: 40, label: 'Use 40°' } });
    }
    if (has('headroom') && !flagged('headroom') && (v.headroom as number) > 260) {
      out.push({ key: 'headroom', text: 'That is a lot of headroom. Check you measured straight up from the edge of a step to the lowest ceiling or beam above the stairs, not the full height of the stairwell.' });
    }
    for (const key of ['steps', 'steps2']) {
      if (!has(key)) continue;
      const n = v[key] as number;
      if (n > 20 || n < 2 || n !== Math.round(n)) {
        out.push({ key, text: `${n} steps looks wrong — count the steps in this flight, including the one level with the floor above. Most flights have between 3 and 16.` });
      }
    }
    if (seg.kind === 'stairsHalf' && has('landWidth') && has('width') && !flagged('landWidth') && (v.landWidth as number) < 2 * (v.width as number)) {
      out.push({ key: 'landWidth', text: 'The landing is narrower than two flights side by side. Measure it wall to wall, across both flights.' });
    }
  }
  return out;
}

export function itemWarnings(item: Item): Warning[] {
  const out: Warning[] = [];
  const names: [keyof Item, string][] = [['w', 'width'], ['d', 'depth'], ['h', 'height']];
  for (const [key, name] of names) {
    const v = item[key];
    if (typeof v !== 'number' || v <= 0) continue;
    if (v >= 500) {
      out.push({ key, text: `A ${name} of ${v} cm is ${(v / 100).toFixed(1)} m — did you enter millimetres?`, fix: { value: round(v / 10), label: `Use ${round(v / 10)} cm` } });
    } else if (v < 5) {
      out.push({ key, text: `A ${name} of ${v} cm is tiny — did you enter metres?`, fix: { value: round(v * 100), label: `Use ${round(v * 100)} cm` } });
    }
  }
  return out;
}
