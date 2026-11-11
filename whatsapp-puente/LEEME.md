# Puente de WhatsApp de LIFE

Programa chiquito que mantiene **tu WhatsApp** vinculado a LIFE como un dispositivo más (igual que WhatsApp Web).
La app y Claude nunca hablan con WhatsApp: dejan y leen cosas en la base de LIFE, y el puente hace el resto.

```
Tu celular ──QR──▶ Puente (servidor prendido siempre) ──clave propia──▶ función whatsapp-puente ──▶ tablas wa_* de LIFE
                                                                                                 ▲
                                                           App (WhatsApp → Chats / Conexión) ────┤
                                                           Claude (whatsapp_chats / _leer / _enviar) ┘
```

## Qué guarda y qué no
- Solo chats de a dos (sin grupos), mensajes de **texto** de los últimos 30 días. Fotos y audios figuran como "📷 Foto" / "🎤 Audio", sin bajarlos.
- La sesión de WhatsApp (lo que permite entrar a tu cuenta) se guarda **cifrada** con `WA_CIFRADO`, que vive **solo** en el servidor del puente. Sin esa clave, lo que está en la base no sirve.
- El puente **no** tiene la clave service_role de Supabase: usa `WA_PUENTE_CLAVE`, que solo abre la función `whatsapp-puente`.
- No escribe textos ni números en el registro (logs).
- Tope: 40 mensajes por día desde LIFE (20 de Claude), de a uno con 3 a 5 s entre cada uno.

## Riesgo
WhatsApp no tiene una forma oficial de vincular un número personal a un programa. Esto usa la misma conexión que
WhatsApp Web (librería Baileys). Con uso personal y pocos mensajes el riesgo es bajo, pero existe: WhatsApp puede
cerrar la sesión o, en casos de mucho volumen o spam, bloquear el número. Por eso los topes y el OK antes de cada envío.

## Instalar (una sola vez)

1. **Claves** (en cualquier compu con Node, o pedíselas a Claude):
   ```
   node -e "console.log('WA_PUENTE_CLAVE=' + require('crypto').randomBytes(32).toString('base64url'))"
   node -e "console.log('WA_CIFRADO=' + require('crypto').randomBytes(32).toString('hex'))"
   ```
   Guardalas en un lugar seguro (gestor de contraseñas). **Nunca** en el repo ni en un chat compartido.
2. **Supabase** (proyecto Life):
   - Aplicar `supabase/whatsapp-web.sql`.
   - Desplegar la función `whatsapp-puente` **sin** verificación de JWT.
   - Secretos de la función: `WA_PUENTE_CLAVE` (la del paso 1) y `WA_DUENO` (tu user_id).
   - Redesplegar `life-mcp` (suma whatsapp_chats, whatsapp_leer y whatsapp_enviar).
3. **Servidor del puente** (cualquiera que corra Docker o Node 20+ prendido siempre), con estas variables:
   - `LIFE_FUNCION` = `https://<proyecto>.supabase.co/functions/v1/whatsapp-puente`
   - `WA_PUENTE_CLAVE` = la misma del paso 1
   - `WA_CIFRADO` = la del paso 1
   Con Docker: `docker build -t life-wa . && docker run -d --restart=always --env-file .env life-wa`.
   Sin Docker: `npm ci && npm start` (en Windows, dejarlo como tarea que arranca con la compu).
4. En LIFE: **WhatsApp → Conexión → Conectar mi WhatsApp** y escanear el QR desde
   WhatsApp → Dispositivos vinculados → Vincular un dispositivo.

## Desconectar
LIFE → WhatsApp → Conexión → Desconectar, o desde el celular: WhatsApp → Dispositivos vinculados → LIFE → Cerrar sesión.
En los dos casos el puente borra la sesión guardada.
