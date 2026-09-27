/**
 * Service worker registration and update prompt. Saved games live in
 * localStorage, which service-worker updates never touch.
 */
export function registerServiceWorker({ onUpdateReady } = {}) {
  if (!('serviceWorker' in navigator) || !globalThis.isSecureContext) return;

  let reloadRequested = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadRequested) return;
    reloadRequested = false;
    location.reload();
  });

  const offer = (worker) => {
    if (!onUpdateReady) return;
    onUpdateReady(() => {
      reloadRequested = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  };

  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {});
      });
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  };

  if (document.readyState === 'complete') register();
  else addEventListener('load', register, { once: true });
}
