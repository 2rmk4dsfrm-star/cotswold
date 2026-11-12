/**
 * Camera tape measure using WebXR hit-testing (Android Chrome and other
 * WebXR-capable browsers; not available in iPhone Safari).
 * The customer taps two points on real surfaces and gets the distance between them.
 */

export async function arMeasureSupported(): Promise<boolean> {
  const xr = (navigator as any).xr;
  if (!xr?.isSessionSupported) return false;
  try {
    return await xr.isSessionSupported('immersive-ar');
  } catch {
    return false;
  }
}

/** Opens the AR tape measure. Resolves with a distance in cm, or null if cancelled. */
export async function arMeasure(label: string): Promise<number | null> {
  const THREE = await import('three');

  const overlay = document.createElement('div');
  overlay.className = 'ar-overlay';
  overlay.innerHTML = `
    <div class="ar-top"><strong></strong><span class="ar-status">Move your phone slowly until a ring appears on the surface.</span></div>
    <div class="ar-readout" hidden></div>
    <div class="ar-actions">
      <button type="button" data-act="cancel">Cancel</button>
      <button type="button" data-act="redo" hidden>Redo</button>
      <button type="button" data-act="use" class="primary" hidden>Use this</button>
    </div>`;
  overlay.querySelector('strong')!.textContent = label;
  document.body.appendChild(overlay);
  const status = overlay.querySelector<HTMLElement>('.ar-status')!;
  const readout = overlay.querySelector<HTMLElement>('.ar-readout')!;
  const btn = (act: string) => overlay.querySelector<HTMLButtonElement>(`[data-act="${act}"]`)!;
  // Taps on the buttons must not also drop a measuring point.
  overlay.querySelector('.ar-actions')!.addEventListener('beforexrselect', (e) => e.preventDefault());

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.xr.enabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2));

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.025, 0.035, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const dotGeo = new THREE.SphereGeometry(0.012, 16, 16);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xf2b84b });
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf2b84b }));
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);

  let points: InstanceType<typeof THREE.Vector3>[] = [];
  let dots: InstanceType<typeof THREE.Mesh>[] = [];
  const reticlePos = new THREE.Vector3();

  const show = (cm: number, final: boolean) => {
    readout.hidden = false;
    readout.textContent = `${cm.toFixed(1)} cm`;
    btn('use').hidden = !final;
    btn('redo').hidden = points.length === 0;
  };
  const reset = () => {
    dots.forEach((d) => scene.remove(d));
    dots = [];
    points = [];
    line.visible = false;
    readout.hidden = true;
    btn('use').hidden = true;
    btn('redo').hidden = true;
    status.textContent = 'Aim the ring at one edge and tap.';
  };

  let session: any;
  try {
    session = await (navigator as any).xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: overlay },
    });
  } catch {
    overlay.remove();
    renderer.dispose();
    return null;
  }

  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);
  const viewerSpace = await session.requestReferenceSpace('viewer');
  const hitSource = await session.requestHitTestSource({ space: viewerSpace });

  return new Promise<number | null>((resolve) => {
    let result: number | null = null;

    session.addEventListener('select', () => {
      if (!reticle.visible || points.length >= 2) return;
      const p = reticlePos.clone();
      points.push(p);
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(p);
      scene.add(dot);
      dots.push(dot);
      if (points.length === 1) {
        status.textContent = 'Now aim at the opposite edge and tap.';
        btn('redo').hidden = false;
      } else {
        result = points[0].distanceTo(points[1]) * 100;
        status.textContent = 'Camera measurements are accurate to about 2–3 cm. Use a tape measure for tight spots.';
        show(result, true);
      }
    });

    btn('cancel').onclick = () => {
      result = null;
      session.end();
    };
    btn('redo').onclick = reset;
    btn('use').onclick = () => session.end();

    session.addEventListener('end', () => {
      renderer.setAnimationLoop(null);
      hitSource.cancel?.();
      renderer.dispose();
      overlay.remove();
      resolve(result === null ? null : Math.round(result * 2) / 2);
    });

    renderer.setAnimationLoop((_t: number, frame: any) => {
      if (!frame) return;
      const hits = frame.getHitTestResults(hitSource);
      const pose = hits.length ? hits[0].getPose(renderer.xr.getReferenceSpace()) : null;
      reticle.visible = !!pose && points.length < 2;
      if (pose) {
        reticle.matrix.fromArray(pose.transform.matrix);
        reticlePos.setFromMatrixPosition(reticle.matrix);
        if (points.length === 0 && status.textContent!.startsWith('Move')) status.textContent = 'Aim the ring at one edge and tap.';
      }
      if (points.length >= 1) {
        const end = points.length === 2 ? points[1] : reticlePos;
        lineGeo.setFromPoints([points[0], end]);
        line.visible = points.length === 2 || !!pose;
        if (points.length === 1 && pose) show(points[0].distanceTo(end) * 100, false);
      }
      renderer.render(scene, camera);
    });
  });
}
