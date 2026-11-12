/**
 * True-size AR preview. Builds a simple box model of the item at real scale and
 * hands it to <model-viewer>, which opens WebXR on Android and AR Quick Look on iPhone.
 */
import type { Dims } from '../fit/engine';

export async function loadViewer(): Promise<void> {
  await import('@google/model-viewer');
}

/** Returns a blob URL for a GLB box of the given size (cm), sitting on the floor. */
export async function buildBoxModel(dims: Dims): Promise<string> {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const [w, d, h] = dims.map((c) => c / 100);
  const scene = new THREE.Scene();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: 0xb98a5e, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.82 }),
  );
  body.position.y = h / 2;
  scene.add(body);
  // A darker band round the base makes the footprint easy to read against a floor.
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(w * 1.002, Math.min(0.04, h / 4), d * 1.002),
    new THREE.MeshStandardMaterial({ color: 0x24362e, roughness: 0.8 }),
  );
  band.position.y = Math.min(0.02, h / 8);
  scene.add(band);
  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
  return URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
}
