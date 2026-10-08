import { useEffect, useRef, useState } from 'react';

/**
 * Lector de códigos de barras con la cámara trasera. Usa ZXing (anda en iPhone, donde Safari
 * no trae lector propio). La librería se carga recién al abrir la cámara para no pesar en el inicio.
 */
export function Escaner({ onCodigo, pausado }: { onCodigo: (codigo: string) => void; pausado: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const ultimo = useRef({ codigo: '', t: 0 });
  const cb = useRef(onCodigo);
  cb.current = onCodigo;
  const pausa = useRef(pausado);
  pausa.current = pausado;

  useEffect(() => {
    let parar: (() => void) | null = null;
    let vivo = true;
    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'), import('@zxing/library'),
        ]);
        const pistas = new Map();
        pistas.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128]);
        const lector = new BrowserMultiFormatReader(pistas, { delayBetweenScanAttempts: 120 });
        if (!vivo || !video.current) return;
        const controles = await lector.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false },
          video.current,
          (res) => {
            if (!res || pausa.current) return;
            const codigo = res.getText();
            const ahora = Date.now();
            // El mismo código leído seguido cuenta una sola vez.
            if (codigo === ultimo.current.codigo && ahora - ultimo.current.t < 2500) return;
            ultimo.current = { codigo, t: ahora };
            try { navigator.vibrate?.(80); } catch { /* iPhone no vibra desde la web */ }
            cb.current(codigo);
          },
        );
        if (!vivo) controles.stop(); else parar = () => controles.stop();
      } catch (e) {
        const m = (e as Error).message || String(e);
        setError(/permission|denied|NotAllowed/i.test(m)
          ? 'No tengo permiso para usar la cámara. En el iPhone: Ajustes → Safari → Cámara → Permitir, y volvé a abrir.'
          : `No pude abrir la cámara (${m}). Podés escribir el código o el nombre abajo.`);
      }
    })();
    return () => { vivo = false; parar?.(); };
  }, []);

  return (
    <div className="com-escaner">
      {error ? <p className="nota texto-critico">{error}</p> : (
        <>
          <video ref={video} playsInline muted autoPlay />
          <div className="com-mira" aria-hidden="true" />
          {pausado && <div className="com-pausa">Completá el producto ↓</div>}
        </>
      )}
    </div>
  );
}
