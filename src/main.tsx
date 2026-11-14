import { render } from 'preact';
import { App } from './app';
import './styles.css';

render(<App />, document.getElementById('app')!);

// Offline support: once the page has loaded, keep a copy of everything it needs,
// including the 3D viewer, so a lost signal mid-visit does not break it.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      fetch(location.href).catch(() => {});
      for (const entry of performance.getEntriesByType('resource')) fetch(entry.name).catch(() => {});
      const { warm } = await import('./ar/preview');
      warm();
    } catch {
      /* offline support is a bonus; the tool works without it */
    }
  });
}
