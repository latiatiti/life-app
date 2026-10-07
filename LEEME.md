# LIFE — app personal (etapa 1: Hub + Economía + Pagos + Entreno + Stock + Comida)

## Probarla ya (sin instalar nada)

Abrí **`LIFE-demo.html`** con doble clic. Arranca en *modo local*: los datos quedan
guardados en ese navegador. Sirve para probar y empezar a cargar datos.

Primer paso: **Ajustes → Cargar mi configuración** carga tus cuentas, ingresos, gastos fijos,
básicos de la casa y platos. Después ajustá las cantidades reales del stock y tus saldos.

## Estructura del proyecto

```
life-app/
├─ src/
│  ├─ core/           Núcleo compartido
│  │  ├─ types.ts     Contrato de módulo (Modulo, Senal, ItemAgenda)
│  │  ├─ registry.ts  Lista de módulos activos  ← acá se enchufa uno nuevo
│  │  ├─ db.ts        Capa de datos (modo local o Supabase) + respaldo
│  │  ├─ auth.tsx     Inicio de sesión (solo en modo nube)
│  │  ├─ config.ts    Conexión a Supabase
│  │  ├─ format.ts    Plata, fechas, montos en formato argentino
│  │  └─ router.ts    Navegación (#/economia, #/pagos…)
│  ├─ hub/Hub.tsx     Pantalla de inicio: señales + agenda + resúmenes
│  ├─ modules/
│  │  ├─ economia/    Cuentas, categorías, movimientos, presupuestos
│  │  ├─ pagos/       Pagos recurrentes y vencimientos
│  │  ├─ entrenamiento/ Rutina, modo entrenando, progreso
│  │  ├─ stock/       Lo que hay en casa y lista de compras
│  │  ├─ alimentacion/ Comidas, platos, macros, agua y suplementos
│  │  └─ ajustes/     Conexión, respaldo
│  └─ ui/             Componentes visuales compartidos
├─ supabase/schema.sql  Tablas + seguridad por usuario
└─ public/            Ícono, manifest y service worker (app instalable)
```

## Cómo se conectan los módulos

Cada módulo exporta un objeto `Modulo` con:

- `pantallas`: sus pantallas.
- `Resumen`: la tarjeta que muestra en el hub.
- `useSenales()`: alertas y sugerencias (ej. “No alcanza para los pagos del mes”).
- `useAgenda()`: todo lo que tiene fecha (vencimientos, y más adelante tareas y eventos).

El hub junta señales y agenda de todos. Los módulos no se llaman entre sí salvo por el
modelo de datos compartido: Pagos lee las cuentas de Economía y, al pagar, crea el gasto.

## Pasar a la nube (PC + celular sincronizados)

1. Creá una cuenta gratis en https://supabase.com y un proyecto nuevo.
2. En el proyecto: **SQL Editor → New query**, pegá el contenido de `supabase/schema.sql` y tocá **Run**.
3. En **Authentication → Sign In / Providers → Email** podés desactivar “Confirm email” para no tener que confirmar el correo (uso personal).
4. En **Project Settings → API** copiá la *Project URL* y la clave *anon public*.
5. En la app: **Ajustes → Descargar respaldo** (para no perder lo cargado en modo local).
6. **Ajustes → Conectar**, pegá URL y clave, creá tu usuario y después **Importar respaldo**.

## Publicarla online e instalarla en el celular

Requiere Node.js 20 o superior (https://nodejs.org).

```bash
cd life-app
npm install
npm run dev          # para desarrollar: abre http://localhost:5173
npm run build        # genera la carpeta dist/ para publicar
npm run build:single # genera un único index.html (dist-single/) para abrir con doble clic
```

Para publicar: entrá a https://app.netlify.com/drop y arrastrá la carpeta `dist/`.
Con la dirección https que te da, abrila en el celular → menú del navegador →
**Agregar a pantalla principal**.

Opcional: copiá `.env.example` como `.env` con tus datos de Supabase antes de `npm run build`
para que la app publicada ya venga conectada.
