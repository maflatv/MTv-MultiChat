# Puente de Kick

Kick entrega los eventos de su API oficial (chat, follows, subs, KICKs...) solo a una dirección pública de Internet. Este pequeño servidor los recibe, comprueba que vienen de Kick y se los pasa a la app de cada streamer. También completa el inicio de sesión, porque es el único sitio que puede guardar el secreto de la aplicación de Kick.

Solo hay que montarlo una vez, para todos los usuarios de MTv MultiChat. Funciona en el plan gratuito de Cloudflare Workers.

## 1. Publicar el puente en Cloudflare

1. Crea una cuenta gratuita en https://dash.cloudflare.com/sign-up.
2. En esta carpeta, inicia sesión y publica:
   ```
   npx wrangler@4 login
   npx wrangler@4 deploy
   ```
3. Anota la dirección que te da, por ejemplo `https://mtv-multichat-kick.<tu-subdominio>.workers.dev`. A partir de aquí la llamamos `PUENTE`.

## 2. Registrar la aplicación en Kick

1. En Kick: **Ajustes → Desarrollador** (https://kick.com/settings/developer). Kick pide tener la verificación en dos pasos activada.
2. **Crear aplicación**:
   - Nombre: `MTv MultiChat`
   - Redirect URL: `PUENTE/callback`
   - Permisos (scopes): `user:read`, `channel:read`, `events:subscribe`, `channel:rewards:read`, `kicks:read`
   - Activa **Enable Webhooks** y pon como Webhook URL: `PUENTE/webhook`
3. Copia el **Client ID** y el **Client Secret**.

## 3. Guardar las claves en el puente

```
npx wrangler@4 secret put KICK_CLIENT_ID
npx wrangler@4 secret put KICK_CLIENT_SECRET
```

Para comprobarlo, abre `PUENTE/config`: debe mostrar tu `client_id`.

## 4. Decirle a la app dónde está el puente

Pon la dirección de `PUENTE` en `PUENTE_POR_DEFECTO`, en `lib/conectores/kick.js`, para que todos los usuarios la tengan sin configurar nada. Mientras tanto, se puede pegar en el dock (Kick → Servidor puente).

## Notas

- El secreto de Kick nunca sale de Cloudflare: la app solo conoce el Client ID.
- El puente no guarda mensajes ni tokens. Cada evento se reenvía en el momento a las apps conectadas de ese canal.
- Si el webhook falla durante más de un día, Kick quita las suscripciones. La app vuelve a suscribirse sola al conectarse.
- Kick limita a 1.000 los canales con chat suscrito mientras la aplicación no está verificada. Para más usuarios hay que pedir la verificación a Kick.
