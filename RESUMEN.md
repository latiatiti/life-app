# LIFE · Resumen para recapitular

Estado al **30 de octubre de 2026**. Este archivo es para leer cuando vuelvas a sentarte con el sistema: qué hay, qué falta y qué te toca decidir a vos.

> Ojo: el repo sigue siendo público, así que acá no van montos ni datos personales. Los números reales están en la app.

## Dónde está todo

- **App publicada:** life-app-latiatiti.netlify.app (se actualiza sola cada vez que se aprueba un cambio en GitHub).
- **Vista previa de un cambio sin aprobar:** deploy-preview-N--life-app-latiatiti.netlify.app (N = número del PR).
- **Datos:** la nube de Supabase (proyecto "Life"), usuario `mauro`.
- **Conector para Claude** (`life-mcp`): ya funciona; Claude puede leer y cargar en tu LIFE.
- **Reglas fijas:** diseño en `docs/pilares-de-diseno.md`, seguridad en `docs/seguridad.md`, mapa de secciones en `docs/mapa-estructura.md`.

## Qué se hizo, por sección

| Sección | Qué tiene | Estado |
|---|---|---|
| **Diseño general** | Estilo "Signos vitales · modo juego", Inicio con 8 tarjetas, barra fina arriba, botón **+** para cargar rápido, DESHACER después de guardar, escala de colores por rendimiento (rojo → morado épico) y animaciones. | ✅ Publicado |
| **Entrenar** | Rutina de 3 días activa, ciclos, mapa muscular, ejercicios propios, Preparador. Pantalla de entrenar en una sola vista (cronómetro grande, − +, descanso con anillo, cierre que se guarda en Día). | ✅ Publicado |
| **Entrenar · El profe** | Te propone mejoras de la rutina de a una, con Aplicar / Ahora no. | ⏳ PR #12 sin aprobar |
| **Comida** | Sección propia: Asistente para ganar masa, Cuerpo (peso, cintura, metabolismo real), escaneo, canasta con suba de precios, avisos de agua y creatina, gasto en comida por mes desde el 1 de noviembre. | ⏳ PR #18 sin aprobar + tablas sin aplicar |
| **Plata** | Economía + Pagos juntos: ingresos con deuda, proyección día por día, "¿alcanza la plata?". Pagos fijos ya cargados en la nube (alquiler, gym, internet, seguro, celular). | ✅ Publicado |
| **Plata · Con Ulises** | Gastos compartidos con %, préstamos, "me pagó / le pagué", saldo en grande. | ⏳ PR #16 sin aprobar + tabla sin aplicar |
| **Plata · Mercado Pago** | Pestaña que trae saldo, cobros y pagos para revisar (y buscar el seguro). Tabla y función ya están en la nube. | ⏳ PR #19 + falta tu token |
| **Día** | Línea del día, semana tipo, calendario con feriados. Tu semana real ya está cargada en la nube. | ✅ Publicado |
| **Día · Tu tiempo** | Tiempo libre real, cosas de todos los días, cada cuánto vas al súper; herramientas nuevas del conector. | ⏳ PR #13 sin aprobar (ya está todo en la nube) |
| **Compras / Casa** | Lista única, precios online Carrefour/Vea/Jumbo, modo compra con escáner, ticket (QR y foto), reparto con Ulises, stock. | ✅ Publicado |
| **Sodería** | LIFE lee tu cuenta de repartidor: lo que te deben y los repartos del día; lo adeudado ya pasó a Plata. | ⏳ PR #15 sin aprobar |
| **Seguridad (Gonzalito)** | Encabezados de seguridad, service worker más seguro, Vite actualizado, permisos en la nube (avisos de Supabase de 10 a 5). | ✅ Publicado |
| **Respaldo en tu PC** | Instalador en la carpeta `life-respaldo-pc`: una copia de tus datos que se actualiza sola los domingos. | ✅ Listo para instalar |
| **Pantallas en una vista** | Boceto para que cada sección entre sin scroll (A mano / Vigilando / botones). | ⏳ Boceto esperando tu OK |
| **Agentes** | **Zonka** propone mejoras (informe esperando tus decisiones). **Gonzalito** cuida la seguridad. | — |

## Lo que te toca a vos (de más a menos urgente)

1. **Aprobar PRs** en GitHub (cada uno se publica solo al aprobarlo):
   - **#13** Día · Tu tiempo (listo y sin conflictos; arregla además el conector).
   - **#15** Sodería.
   - **#16** Con Ulises → antes, decir "sí" a crear su tabla en la nube.
   - **#18** Comida → antes, decir "sí" a sumar peso, cintura y hora a la nube.
   - **#19** Mercado Pago.
   - **#12** El profe.
2. **Mercado Pago:** crear la aplicación en mercadopago.com.ar/developers y pegar el Access Token en Supabase → Edge Functions → Secrets (`MP_ACCESS_TOKEN` y `MP_DUENO`). **Nunca en el chat.** Los pasos exactos están en el hilo "Conectar Mercado Pago a LIFE".
3. **Seguridad (con Claude en Chrome):** poner el repo **privado**, apagar el registro público en Supabase y activar la protección de contraseñas filtradas. El texto para pegar está en el hilo de Gonzalito.
4. **Cuenta de más** `mauro2@life.com`: contestar "sí, pausala" en el hilo de Gonzalito.
5. **Sodería automática:** pasar la dirección y una clave de solo lectura de la sodería.
6. **Datos que faltan:** minutos de platos, barrer y ordenar; confirmar gym del lunes (quedó 21 a 22:30); tu edad en Comida → Cuerpo.
7. **Boceto "una vista":** decir si te va o qué cambiar.
8. **Informe de Zonka:** marcar qué propuestas aceptás o descartás.

## PRs viejos para decidir si se cierran

- **#2** Entreno pantalla completa (lo reemplazó el #14, ya publicado): se puede cerrar.
- **#9** Grafo del código con Graphify: sirve para que Claude gaste menos leyendo; aprobar o cerrar.

## Próximos pasos sugeridos

1. Aprobar #13 y después los demás de a uno, probando cada vista previa en el celu.
2. Conectar Mercado Pago y ver si aparece el pago del seguro.
3. Cargar 2 semanas de comidas y pesarte en ayunas 2 o 3 veces por semana, para que Comida calcule tu metabolismo real.
4. Con el boceto aprobado, pasar todas las secciones a "una vista".
5. Retomar la hoja de ruta: chequeo diario de mañana/noche (propuesta de Zonka), avisos por WhatsApp, carga por foto o audio, y módulo Mercado.
