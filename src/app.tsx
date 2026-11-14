import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  checkRoute,
  itemDims,
  type Diagram,
  type Dims,
  type Item,
  type RouteResult,
  type Segment,
  type SegmentKind,
  type SegmentResult,
  type Status,
} from './fit/engine';
import { arMeasure, arMeasureSupported } from './ar/measure';
import { buildBoxModel, loadViewer } from './ar/preview';
import { itemWarnings, segmentWarnings, type Warning } from './fit/sanity';
import { Guide } from './guides';

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': any;
    }
  }
}

/* ---------- route step definitions ---------- */

interface FieldDef {
  key: string;
  label: string;
  /** Marker on the measuring picture. */
  letter?: string;
  unit?: string;
  fallback?: number;
  /** A two-way choice instead of a measurement; stored as 1 or 2. */
  choice?: [string, string];
  /** Starts a new titled group of fields. */
  group?: string;
}

const STAIRS_TOP: FieldDef[] = [
  { group: 'The stairs', key: 'width', label: 'Width', letter: 'A' },
  { key: 'headroom', label: 'Lowest headroom', letter: 'B' },
  { key: 'pitch', label: 'Steepness', letter: 'C', unit: '°', fallback: 40 },
];
const STAIRS_ENDS: FieldDef[] = [
  { key: 'above', label: 'What is above the stairs?', choice: ['Open to the upstairs ceiling', 'A sloping ceiling'] },
  { group: 'Bottom of the stairs', key: 'foot', label: 'How do you reach the bottom step?', choice: ['Straight on', 'From the side'] },
  { key: 'footSpace', label: 'Clear floor before bottom step', letter: 'D' },
  { key: 'footCeil', label: 'Ceiling height', letter: 'E' },
  { group: 'Top of the stairs', key: 'top', label: 'What happens at the top?', choice: ['Carry straight on', 'Turn left or right'] },
  { key: 'topSpace', label: 'Clear floor beyond top step', letter: 'F' },
  { key: 'topCeil', label: 'Ceiling height', letter: 'G' },
];
const STAIR_TIP =
  'Width is wall to handrail. Headroom is from the front edge of a step straight up to the lowest ceiling or beam. Count every step, including the one level with the floor you arrive on.';

const KINDS: Record<SegmentKind, { title: string; tip: string; fields: FieldDef[] }> = {
  door: {
    title: 'Doorway',
    tip: 'Open the door fully and measure the narrowest clear gap — door edge to the stop on the frame, not frame to frame.',
    fields: [
      { key: 'width', label: 'Clear width', letter: 'A' },
      { key: 'height', label: 'Clear height', letter: 'B' },
    ],
  },
  hall: {
    title: 'Hallway',
    tip: 'Measure at the narrowest point, allowing for radiators, shelves, light fittings and banisters.',
    fields: [
      { key: 'width', label: 'Narrowest width', letter: 'A' },
      { key: 'height', label: 'Lowest ceiling height', letter: 'B' },
    ],
  },
  corner: {
    title: 'Corner turn',
    tip: 'Any 90° turn on a level floor — including a door that opens onto a facing wall. Measure the passage width on each side of the turn.',
    fields: [
      { key: 'widthIn', label: 'Width before turn', letter: 'A' },
      { key: 'widthOut', label: 'Width after turn', letter: 'B' },
      { key: 'height', label: 'Ceiling height', letter: 'C' },
    ],
  },
  stairsStraight: {
    title: 'Straight stairs',
    tip: STAIR_TIP,
    fields: [...STAIRS_TOP, { key: 'steps', label: 'Number of steps', unit: 'steps' }, ...STAIRS_ENDS],
  },
  stairsQuarter: {
    title: 'Stairs with a quarter-turn landing',
    tip: `An L-shaped staircase that turns 90° across a flat landing. ${STAIR_TIP}`,
    fields: [
      ...STAIRS_TOP,
      { key: 'steps', label: 'Steps up to the landing', unit: 'steps' },
      { key: 'steps2', label: 'Steps after the landing', unit: 'steps' },
      ...STAIRS_ENDS,
      { group: 'The landing', key: 'landDepth', label: 'Width of second flight', letter: 'H' },
      { key: 'landCeil', label: 'Ceiling height above landing', letter: 'I' },
    ],
  },
  stairsHalf: {
    title: 'Stairs with a half-turn landing',
    tip: `A U-shaped staircase that doubles back across a flat landing. ${STAIR_TIP}`,
    fields: [
      ...STAIRS_TOP,
      { key: 'steps', label: 'Steps up to the landing', unit: 'steps' },
      { key: 'steps2', label: 'Steps after the landing', unit: 'steps' },
      ...STAIRS_ENDS,
      { group: 'The landing', key: 'landDepth', label: 'Landing depth', letter: 'H' },
      { key: 'landWidth', label: 'Landing width', letter: 'I' },
      { key: 'landCeil', label: 'Ceiling height above landing', letter: 'J' },
    ],
  },
  lift: {
    title: 'Lift',
    tip: 'Measure the door opening and the inside of the lift car, below any handrail.',
    fields: [
      { key: 'doorWidth', label: 'Door width', letter: 'A' },
      { key: 'doorHeight', label: 'Door height', letter: 'B' },
      { key: 'carWidth', label: 'Inside width', letter: 'C' },
      { key: 'carDepth', label: 'Inside depth', letter: 'D' },
      { key: 'carHeight', label: 'Inside height', letter: 'E' },
    ],
  },
  room: {
    title: 'The room it is going in',
    tip: 'A tall item carried in lying down has to be tipped upright, which needs more height than the item itself. Measure the ceiling at its lowest point.',
    fields: [{ key: 'height', label: 'Ceiling height', letter: 'A' }],
  },
};

const STATUS_TEXT: Record<Status, string> = {
  fits: 'Fits',
  check: 'Needs checking',
  no: "Won't fit",
  incomplete: 'Needs measurements',
};

let seq = 0;
const newSegment = (kind: SegmentKind): Segment => {
  const v: Segment['v'] = {};
  KINDS[kind].fields.forEach((f) => (v[f.key] = f.fallback ?? null));
  return { id: `${Date.now().toString(36)}-${seq++}`, kind, v };
};

/* ---------- persistence and catalogue hand-off ---------- */

const STORE_KEY = 'will-it-fit:v2';

interface Saved {
  item: Item;
  route: Segment[];
}

const blank = (): Saved => ({
  item: { name: '', w: null, d: null, h: null, keepUpright: false, sections: false },
  route: [newSegment('door')],
});

function initialState(): Saved {
  let saved: Saved | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  const ok = saved?.item && Array.isArray(saved.route) && saved.route.every((s) => s.kind in KINDS);
  const state: Saved = ok ? saved! : blank();

  // A product page can deep-link with ?name=&w=&d=&h= (cm) to prefill the item.
  const q = new URLSearchParams(location.search);
  const num = (k: string) => {
    const n = parseFloat(q.get(k) ?? '');
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  if (num('w') && num('d') && num('h')) {
    state.item = { name: q.get('name') ?? '', w: num('w'), d: num('d'), h: num('h'), keepUpright: false, sections: q.get('sections') === '1' };
  }
  return state;
}

/* ---------- small components ---------- */

function NumberField(props: {
  label: string;
  letter?: string;
  warn?: boolean;
  unit?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  onMeasure?: () => void;
}) {
  return (
    <label class="field">
      <span>{props.letter && <b class="letter">{props.letter}</b>}{props.label}</span>
      <div class={props.warn ? 'input warn' : 'input'}>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={props.unit === 'steps' ? '1' : '0.5'}
          value={props.value ?? ''}
          onInput={(e) => {
            const n = parseFloat((e.target as HTMLInputElement).value);
            props.onChange(Number.isFinite(n) ? n : null);
          }}
        />
        <em>{props.unit ?? 'cm'}</em>
        {props.onMeasure && (
          <button type="button" class="measure" onClick={props.onMeasure} aria-label={`Measure ${props.label} with camera`}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
              <circle cx="12" cy="13.5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6" />
            </svg>
          </button>
        )}
      </div>
    </label>
  );
}

function ChoiceField(props: { label: string; options: [string, string]; value: number | null; onChange: (v: number) => void }) {
  return (
    <fieldset class="choice">
      <legend>{props.label}</legend>
      <div>
        {props.options.map((text, i) => (
          <button type="button" class={props.value === i + 1 ? 'on' : ''} aria-pressed={props.value === i + 1} onClick={() => props.onChange(i + 1)}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Warnings({ list, onFix }: { list: Warning[]; onFix: (key: string, value: number) => void }) {
  if (!list.length) return null;
  return (
    <ul class="warnings">
      {list.map((w) => (
        <li>
          <span>{w.text}</span>
          {w.fix && <button type="button" onClick={() => onFix(w.key, w.fix!.value)}>{w.fix.label}</button>}
        </li>
      ))}
    </ul>
  );
}

function Badge({ status }: { status: Status }) {
  return <span class={`badge ${status}`}>{STATUS_TEXT[status]}</span>;
}

function clearanceText(r: SegmentResult): string {
  if (r.summary) return r.summary;
  const c = Math.abs(r.clearance);
  if (r.clearance < 0) return `About ${c} cm too big`;
  if (r.status === 'check') return `Only about ${c} cm to spare`;
  if (r.clearance >= 100) return 'Plenty of room';
  return `About ${c} cm to spare`;
}

function Stages({ list }: { list: NonNullable<SegmentResult['stages']> }) {
  return (
    <ol class="stages">
      {list.map((s) => (
        <li class={s.state}>
          <i aria-hidden="true">{s.state === 'ok' ? '✓' : s.state === 'stuck' ? '✕' : '–'}</i>
          {s.label}
          {s.state === 'stuck' && <span> — stuck here</span>}
          {s.state === 'pending' && <span> — not reached</span>}
        </li>
      ))}
    </ol>
  );
}

function DiagramView({ d, status }: { d: Diagram; status: Status }) {
  const pad = 14;
  if (d.type === 'opening') {
    const view = Math.max(d.W, d.H, d.p, d.q) + pad * 2;
    const ox = (view - d.W) / 2;
    const oy = (view - d.H) / 2;
    return (
      <figure class={`diagram ${status}`}>
        <svg viewBox={`0 0 ${view} ${view}`} role="img" aria-label={d.caption}>
          <rect class="space" x={ox} y={oy} width={d.W} height={d.H} />
          <rect
            class="item"
            x={view / 2 - d.p / 2}
            y={view / 2 - d.q / 2}
            width={d.p}
            height={d.q}
            transform={`rotate(${d.roll} ${view / 2} ${view / 2})`}
          />
        </svg>
        <figcaption>{d.caption}</figcaption>
      </figure>
    );
  }
  const reach = Math.max(d.a, d.b) + Math.max(d.L * 0.75, 50);
  const view = reach + pad * 2;
  const pts: [number, number][] = [];
  if (d.theta === null) {
    const x = (d.b - d.L) / 2;
    const y = (d.a - d.Wd) / 2;
    pts.push([x, y], [x + d.L, y], [x + d.L, y + d.Wd], [x, y + d.Wd]);
  } else {
    const s = Math.sin((d.theta * Math.PI) / 180);
    const c = Math.cos((d.theta * Math.PI) / 180);
    pts.push([0, d.L * s], [d.L * c, 0], [d.L * c + d.Wd * s, d.Wd * c], [d.Wd * s, d.L * s + d.Wd * c]);
  }
  const poly = (p: [number, number][]) => p.map(([x, y]) => `${x + pad},${y + pad}`).join(' ');
  return (
    <figure class={`diagram ${status}`}>
      <svg viewBox={`0 0 ${view} ${view}`} role="img" aria-label={d.caption}>
        <polygon class="space" points={poly([[0, 0], [reach, 0], [reach, d.a], [d.b, d.a], [d.b, reach], [0, reach]])} />
        <polygon class="item" points={poly(pts)} />
      </svg>
      <figcaption>{d.caption}</figcaption>
    </figure>
  );
}

function ArPreview({ item, onClose }: { item: Item; onClose: () => void }) {
  const dims = itemDims(item)!;
  const [pose, setPose] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const viewer = useRef<any>(null);
  // Re-order the dimensions so the box appears as it would be carried.
  const posed: Dims = pose === 0 ? dims : pose === 1 ? [dims[2], dims[1], dims[0]] : [dims[0], dims[2], dims[1]];

  useEffect(() => {
    let url: string | null = null;
    let live = true;
    setSrc(null);
    Promise.all([loadViewer(), buildBoxModel(posed)])
      .then(([, u]) => {
        url = u;
        if (live) setSrc(u);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [posed.join('x')]);

  return (
    <div class="modal" role="dialog" aria-label="See it at true size">
      <div class="modal-head">
        <div>
          <strong>{item.name || 'Your item'} at true size</strong>
          <span>{posed[0]} × {posed[1]} × {posed[2]} cm (W × D × H)</span>
        </div>
        <button type="button" class="ghost" onClick={onClose}>Close</button>
      </div>
      <div class="viewer">
        {failed && <p class="empty">The 3D preview couldn't load on this device.</p>}
        {!failed && !src && <p class="empty">Building model…</p>}
        {src && (
          <model-viewer
            ref={viewer}
            src={src}
            ar
            ar-scale="fixed"
            ar-modes="webxr quick-look"
            ar-placement="floor"
            camera-controls
            touch-action="pan-y"
            shadow-intensity="1"
            exposure="1.1"
            alt="Box showing the size of the item"
          >
            <button slot="ar-button" class="primary ar-go">View in my space</button>
          </model-viewer>
        )}
      </div>
      <div class="chips center">
        {['Right way up', 'On its side', 'On its back'].map((t, i) => (
          <button type="button" class={pose === i ? 'chip on' : 'chip'} onClick={() => setPose(i)}>{t}</button>
        ))}
      </div>
      <ol class="note steps">
        <li>Stand 2–3 m back from where the item will go and tap <b>View in my space</b>.</li>
        <li>Point the phone at the floor there and move it slowly side to side. The block floats close to you at first, then drops onto the floor once your phone has found it.</li>
        <li>Drag with one finger to move it and twist with two fingers to turn it.</li>
        <li>The stripes round the base are 10 cm each — hold a tape measure against them to check the size is true.</li>
      </ol>
      <p class="note">
        The block is drawn in front of real furniture and walls, so judge the fit by where its base meets the floor.
        No button? Your browser doesn't support AR; the fit check still works from measurements.
      </p>
    </div>
  );
}

const HEADLINE: Record<Exclude<Status, 'incomplete'>, string> = {
  fits: 'It should fit.',
  check: 'Too close to call — it needs checking.',
  no: "It won't fit along this route.",
};

function Summary(props: { item: Item; route: Segment[]; verdict: RouteResult; onClose: () => void }) {
  const { item, route, verdict } = props;
  return (
    <div class="modal summary" role="dialog" aria-label="Summary">
      <div class="modal-head">
        <div>
          <strong>Delivery route summary</strong>
          <span>{item.name || 'Item'} · {item.w} × {item.d} × {item.h} cm{item.sections ? ' (largest section)' : ''}</span>
        </div>
        <button type="button" class="ghost" onClick={props.onClose}>Close</button>
      </div>
      <div class="summary-body">
        {verdict.status !== 'incomplete' && <p class={`summary-verdict ${verdict.status}`}>{HEADLINE[verdict.status]}</p>}
        <ol class="summary-list">
          {route.map((seg, i) => {
            const r = verdict.results[i];
            return (
              <li class={r.status}>
                <div>
                  <strong>{i + 1}. {KINDS[seg.kind].title}</strong>
                  <Badge status={r.status} />
                </div>
                {r.status !== 'incomplete' && (
                  <p>{clearanceText(r)}. {r.status === 'no' && !r.stages ? `Closest attempt: ${r.how}` : r.how}</p>
                )}
              </li>
            );
          })}
        </ol>
        <p class="small-print">Guidance only, based on the measurements entered. The item is checked as a solid block, carried in as delivered.</p>
      </div>
    </div>
  );
}

/* ---------- app ---------- */

export function App() {
  const [{ item, route }, setState] = useState<Saved>(initialState);
  const [canMeasure, setCanMeasure] = useState(false);
  const [showAr, setShowAr] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    arMeasureSupported().then(setCanMeasure);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ item, route }));
    } catch {
      /* private mode: carry on without saving */
    }
  }, [item, route]);

  const setItem = (patch: Partial<Item>) => setState((s) => ({ ...s, item: { ...s.item, ...patch } }));
  const setRoute = (fn: (r: Segment[]) => Segment[]) => setState((s) => ({ ...s, route: fn(s.route) }));
  const setValue = (id: string, key: string, value: number | null) =>
    setRoute((r) => r.map((s) => (s.id === id ? { ...s, v: { ...s.v, [key]: value } } : s)));
  const move = (i: number, by: number) =>
    setRoute((r) => {
      const next = [...r];
      const [seg] = next.splice(i, 1);
      next.splice(i + by, 0, seg);
      return next;
    });

  const dims = itemDims(item);
  const itemWarn = useMemo(() => itemWarnings(item), [item]);
  const routeWarn = useMemo(() => route.map(segmentWarnings), [route]);
  const flaggedSteps = routeWarn.map((w, i) => (w.length ? i + 1 : 0)).filter(Boolean);
  const verdict = useMemo(() => checkRoute(item, route), [item, route]);
  const worstSeg = verdict.worst >= 0 ? route[verdict.worst] : null;
  const worstRes = verdict.worst >= 0 ? verdict.results[verdict.worst] : null;

  const renderFields = (seg: Segment, i: number) => {
    const def = KINDS[seg.kind];
    const blocks: any[] = [];
    let numbers: FieldDef[] = [];
    const flush = () => {
      if (!numbers.length) return;
      const batch = numbers;
      numbers = [];
      blocks.push(
        <div class={batch.length === 2 ? 'grid3 two' : batch.length > 3 ? 'grid3 many' : 'grid3'}>
          {batch.map((f) => (
            <NumberField
              label={f.label}
              letter={f.letter}
              unit={f.unit}
              warn={routeWarn[i].some((w) => w.key === f.key)}
              value={seg.v[f.key]}
              onChange={(v) => setValue(seg.id, f.key, v)}
              onMeasure={
                canMeasure && !f.unit
                  ? async () => {
                      const cm = await arMeasure(`${def.title}: ${f.label.toLowerCase()}`);
                      if (cm !== null) setValue(seg.id, f.key, cm);
                    }
                  : undefined
              }
            />
          ))}
        </div>,
      );
    };
    for (const f of def.fields) {
      if (f.group) {
        flush();
        blocks.push(<h4>{f.group}</h4>);
      }
      if (f.choice) {
        flush();
        blocks.push(<ChoiceField label={f.label} options={f.choice} value={seg.v[f.key]} onChange={(v) => setValue(seg.id, f.key, v)} />);
      } else numbers.push(f);
    }
    flush();
    return blocks;
  };

  return (
    <main>
      <header class="hero">
        <p class="eyebrow">Delivery route checker</p>
        <h1>Will it fit?</h1>
        <p>
          Walk the route from your front door to the room. We check every doorway, corner and staircase — including
          the turns a tape measure alone can't tell you about.
        </p>
      </header>

      <section class="card">
        <h2><i>1</i> Your item</h2>
        <label class="field wide">
          <span>Product name</span>
          <div class="input">
            <input type="text" value={item.name} placeholder="e.g. Double wardrobe" onInput={(e) => setItem({ name: (e.target as HTMLInputElement).value })} />
          </div>
        </label>
        <div class="grid3">
          <NumberField label="Width" value={item.w} warn={itemWarn.some((w) => w.key === 'w')} onChange={(w) => setItem({ w })} />
          <NumberField label="Depth" value={item.d} warn={itemWarn.some((w) => w.key === 'd')} onChange={(d) => setItem({ d })} />
          <NumberField label="Height" value={item.h} warn={itemWarn.some((w) => w.key === 'h')} onChange={(h) => setItem({ h })} />
        </div>
        <Warnings list={itemWarn} onFix={(key, value) => setItem({ [key]: value })} />
        <label class="tick">
          <input type="checkbox" checked={!!item.sections} onChange={(e) => setItem({ sections: (e.target as HTMLInputElement).checked })} />
          <span>
            Arrives in sections
            <small>{item.sections ? 'Enter the size of the largest section above — that is the piece that has to get through.' : 'Tick this if it is delivered in two or more pieces and joined in the room.'}</small>
          </span>
        </label>
        <button type="button" class="secondary" disabled={!dims} onClick={() => setShowAr(true)}>
          See it at true size in your space
        </button>
      </section>

      <section>
        <h2 class="loose"><i>2</i> Your delivery route</h2>
        <p class="lede">
          Add each tight spot in order, starting at the front door.
          {canMeasure
            ? ' Type measurements in, or tap the camera icon to measure with your phone.'
            : ' Use a tape measure and type the numbers in, in centimetres.'}
        </p>

        {route.map((seg, i) => {
          const def = KINDS[seg.kind];
          const res = verdict.results[i];
          return (
            <article class={`card step ${res.status}`} key={seg.id}>
              <div class="step-head">
                <h3><b>{i + 1}</b> {def.title}</h3>
                <div class="tools">
                  <button type="button" class="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">↑</button>
                  <button type="button" class="ghost" disabled={i === route.length - 1} onClick={() => move(i, 1)} aria-label="Move later">↓</button>
                  <button type="button" class="ghost" onClick={() => setRoute((r) => r.filter((s) => s.id !== seg.id))} aria-label={`Remove ${def.title}`}>✕</button>
                </div>
              </div>
              <p class="tip">{def.tip}</p>
              <Guide kind={seg.kind} />
              {renderFields(seg, i)}
              <Warnings list={routeWarn[i]} onFix={(key, value) => setValue(seg.id, key, value)} />
              {res.status !== 'incomplete' && (
                <div class="result">
                  <div class="result-text">
                    <p><Badge status={res.status} /> <strong>{clearanceText(res)}</strong></p>
                    {res.stages && <Stages list={res.stages} />}
                    <p class="how">{res.status === 'no' && !res.stages && seg.kind !== 'room' ? `Closest attempt: ${res.how}` : res.how}</p>
                  </div>
                  {res.diagram && <DiagramView d={res.diagram} status={res.status} />}
                </div>
              )}
            </article>
          );
        })}

        {adding ? (
          <div class="card add-menu">
            <p>What comes next on the route?</p>
            <div class="chips">
              {(Object.keys(KINDS) as SegmentKind[]).map((k) => (
                <button
                  type="button"
                  class="chip"
                  onClick={() => {
                    setRoute((r) => [...r, newSegment(k)]);
                    setAdding(false);
                  }}
                >
                  {KINDS[k].title}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button type="button" class="secondary add" onClick={() => setAdding(true)}>+ Add next step on the route</button>
        )}
      </section>

      <section class={`verdict ${verdict.status}`} aria-live="polite">
        <h2><i>3</i> Verdict</h2>
        {!dims && <p class="big">Enter your item's width, depth and height to begin.</p>}
        {dims && verdict.status === 'incomplete' && <p class="big">Add measurements for at least one step on the route.</p>}
        {dims && worstSeg && worstRes && verdict.status !== 'incomplete' && (
          <>
            <p class="big">{HEADLINE[verdict.status]}</p>
            <p>
              {verdict.status === 'no' ? 'Problem spot' : verdict.status === 'check' ? 'Closest spot' : 'Tightest spot'}:{' '}
              <b>step {verdict.worst + 1}, {KINDS[worstSeg.kind].title.toLowerCase()}</b> — {clearanceText(worstRes).toLowerCase()}.
            </p>
            {verdict.status === 'check' && (
              <p>Please ask the delivery team to check this before you order. A centimetre either way in the measurements could change the answer.</p>
            )}
            {verdict.incomplete > 0 && <p>{verdict.incomplete} step{verdict.incomplete > 1 ? 's' : ''} still need measurements and {verdict.incomplete > 1 ? "aren't" : "isn't"} included yet.</p>}
            <button type="button" class="on-colour" onClick={() => setShowSummary(true)}>Show summary</button>
          </>
        )}
        {dims && (flaggedSteps.length > 0 || itemWarn.length > 0) && (
          <p class="caution">
            Some measurements look unusual
            {flaggedSteps.length > 0 ? ` (step ${flaggedSteps.join(', ')})` : ' (your item)'}. Check them before relying
            on this result.
          </p>
        )}
        <p class="small">
          Guidance only. The item is checked as a solid block, carried in as delivered, at the sizes you enter — so
          results depend on accurate measurements and on every tight spot being added to the route.
        </p>
      </section>

      <div class="reset">
        {confirmReset ? (
          <>
            <span>Clear the item and the whole route?</span>
            <button type="button" class="ghost" onClick={() => setConfirmReset(false)}>Keep it</button>
            <button
              type="button"
              class="danger"
              onClick={() => {
                setState(blank());
                setConfirmReset(false);
                setAdding(false);
                window.scrollTo({ top: 0 });
              }}
            >
              Yes, start again
            </button>
          </>
        ) : (
          <button type="button" class="ghost" onClick={() => setConfirmReset(true)}>Start again</button>
        )}
      </div>

      {showAr && dims && <ArPreview item={item} onClose={() => setShowAr(false)} />}
      {showSummary && <Summary item={item} route={route} verdict={verdict} onClose={() => setShowSummary(false)} />}
    </main>
  );
}
