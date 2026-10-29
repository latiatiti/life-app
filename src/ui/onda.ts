/** Onda al tocar: un círculo que se abre desde el dedo en los botones de la app (pedido de ella, 2026-10-29).
 * Una sola escucha para toda la app. Respeta "reducir movimiento" del teléfono. */
const BOTONES = '.btn, .medidor, .segmentado button, .ent-vivo button';

export function activarOndas() {
  const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  document.addEventListener('pointerdown', (ev) => {
    if (quieto?.matches) return;
    const b = (ev.target as Element | null)?.closest?.(BOTONES) as HTMLElement | null;
    if (!b || (b as HTMLButtonElement).disabled) return;
    const r = b.getBoundingClientRect();
    const d = Math.max(r.width, r.height);
    const o = document.createElement('span');
    o.className = 'onda';
    o.style.cssText = `width:${d}px;height:${d}px;left:${ev.clientX - r.left - d / 2}px;top:${ev.clientY - r.top - d / 2}px`;
    b.appendChild(o);
    setTimeout(() => o.remove(), 560);
  }, { passive: true });
}
