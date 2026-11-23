import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ConSesion } from './core/auth';
import './tema/tema.css';
import './styles.css';
import { activarOndas } from './ui/onda';
import { Protegido } from './ui/Protegido';
import { capturarErrores } from './core/informes';

activarOndas();
capturarErrores();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConSesion>
      <Protegido nombre="LIFE" pantallaCompleta>
        <App />
      </Protegido>
    </ConSesion>
  </StrictMode>
);

// Service worker para instalarla como app (solo cuando está publicada en https).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
