/**
 * Service worker registration. New versions activate on their own and the
 * page reloads once to run them. Saved games live in localStorage, which
 * service-worker updates never touch, so the reload keeps the current game.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !globalThis.isSecureContext) return;

  // Only reload when replacing an older version, never on the very first install.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
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
