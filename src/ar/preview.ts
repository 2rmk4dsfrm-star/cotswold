/**
 * True-size AR preview. Builds a simple box model of the item at real scale and
 * hands it to <model-viewer>, which opens WebXR on Android and AR Quick Look on iPhone.
 */
import type { Dims } from '../fit/engine';

export async function loadViewer(): Promise<void> {
  await import('@google/model-viewer');
}

/** Fetches the 3D libraries ahead of time so the preview opens without a network connection. */
export function warm(): void {
  loadViewer().catch(() => {});
  import('three').catch(() => {});
  import('three/examples/jsm/exporters/GLTFExporter.js').catch(() => {});
  import('three/examples/jsm/utils/BufferGeometryUtils.js').catch(() => {});
}

/** Returns a blob URL for a GLB box of the given size (cm), sitting on the floor. */
export async function buildBoxModel(dims: Dims): Promise<string> {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
  const [w, d, h] = dims.map((c) => c / 100);
  const scene = new THREE.Scene();
  // Solid, not see-through: AR viewers ground and shade an opaque object far more convincingly.
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: 0xb98a5e, roughness: 0.75, metalness: 0 }),
  );
  body.position.y = h / 2;
  scene.add(body);

  // A ruler band round the base in alternating 10 cm stripes, so the size can be
  // checked against a tape measure and the footprint reads clearly on the floor.
  const STRIPE = 0.1;
  const bandH = Math.min(0.05, h / 4);
  const skin = 0.004;
  const dark: any[] = [];
  const light: any[] = [];
  const run = (length: number, place: (g: InstanceType<typeof THREE.BoxGeometry>, centre: number, len: number) => void) => {
    for (let i = 0, start = 0; start < length - 1e-6; i++, start += STRIPE) {
      const len = Math.min(STRIPE, length - start);
      const g = new THREE.BoxGeometry(1, 1, 1);
      place(g, -length / 2 + start + len / 2, len);
      (i % 2 ? light : dark).push(g);
    }
  };
  for (const side of [-1, 1]) {
    run(w, (g, c, len) => g.scale(len, bandH, skin).translate(c, bandH / 2, side * (d / 2 + skin / 2)));
    run(d, (g, c, len) => g.scale(skin, bandH, len).translate(side * (w / 2 + skin / 2), bandH / 2, c));
  }
  scene.add(new THREE.Mesh(mergeGeometries(dark), new THREE.MeshStandardMaterial({ color: 0x24362e, roughness: 0.8 })));
  scene.add(new THREE.Mesh(mergeGeometries(light), new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.8 })));
  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
  return URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
}
