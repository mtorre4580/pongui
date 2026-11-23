# Pongui: lanzamiento y redes

Guía de trabajo para publicar el juego y darlo a conocer. Los videos se generan con
`pnpm media:social` (quedan en `docs/social/es` y `docs/social/en`, fuera del repo). Llevan los
efectos de sonido del propio juego; la música se puede sumar desde la app de cada red.

## Antes de publicar (una sola vez)

1. Confirmar que "Pongui" sigue libre en Play Store, Instagram, TikTok y YouTube.
2. Comprar `pongui.com` en Cloudflare Registrar (y `pongui.app` si se quiere cubrir).
3. Cloudflare Pages: crear el proyecto `pongui` (Direct upload), conectar el dominio y cargar en
   GitHub las variables y secretos que lista el README (sección Deploy).
4. Umami Cloud: crear el sitio `pongui.com` y cargar su id en la variable `UMAMI_WEBSITE_ID`.
5. Cloudflare Email Routing: redirigir `hello@pongui.com` (aparece en la página de privacidad).
6. Google Search Console y Bing Webmaster Tools: verificar el dominio por DNS y enviar
   `https://pongui.com/sitemap.xml`.
7. Probar en dispositivos reales: instalar en Windows (Chrome/Edge), Android (Chrome) e iPhone
   (Safari → Compartir → Agregar a inicio), jugar sin conexión y abrir un nivel compartido por QR.
8. Pegar el link en WhatsApp y revisar que la vista previa muestre imagen y título.

## Perfiles

- Usuario: `@playpongui` en Instagram, TikTok y YouTube.
- Foto: `public/icons/icon-512.png`.
- Banner de YouTube: `docs/social/youtube-banner.png` (se genera con `pnpm media banner`).
- Link: `https://pongui.com/?utm_source=instagram` (cambiar `instagram` por `tiktok` o
  `youtube`): Umami muestra cuánta gente llega de cada red.
- Bio (ES): "🔴 100 niveles de rebotes · Gratis, sin descargar nada · Creá y compartí tus niveles 👇"
- Bio (EN): "🔴 100 bouncy puzzle levels · Free, nothing to download · Build and share your own 👇"

## Qué publicar

Tres publicaciones por semana; el mismo video va a Reels, TikTok y Shorts. Los videos casi no
llevan texto y la descripción va en español e inglés.

| Formato | Qué muestra | De dónde sale |
|---|---|---|
| Un mundo en 10 segundos | El último nivel del mundo, resuelto | `world-01.mp4` … `world-10.mp4` |
| Creá tu nivel | Pintar, probar y compartir con QR | `editor.mp4` |
| ¿Podés pasarlo? | Un nivel difícil hecho en el editor, con su link en la descripción | Grabación de pantalla propia |
| Detrás de escena | El bot que resuelve niveles, errores graciosos, cómo se hizo | Grabación de pantalla propia |

### Primeras tres semanas

| Semana | Publicación 1 | Publicación 2 | Publicación 3 |
|---|---|---|---|
| 1 | Mundo 1 (presentación) | Mundo 5 (portales y agua) | Creá tu nivel |
| 2 | Mundo 8 (gravedad baja) | ¿Podés pasarlo? | Mundo 3 (nubes y viento) |
| 3 | Mundo 9 (a oscuras) | Detrás de escena: el bot | Mundo 10 (el final) |

## Textos

Presentación:

> La pelota nunca para de rebotar. Vos decidís dónde cae. 100 niveles, gratis, en el navegador:
> link en la bio.
>
> The ball never stops bouncing. You decide where it lands. 100 levels, free, in your browser:
> link in bio.

Un mundo (cambiar número y nombre; la segunda frase es la de la tarjeta del mundo en la landing):

> Mundo 5: Laguna de Coral. Sumergite en el agua y viajá por portales. Jugalo gratis, link en la
> bio.
>
> World 5: Coral Lagoon. Dive underwater and travel through portals. Play free, link in bio.

Editor:

> Armá tu propio nivel y mandáselo a tus amigos con un QR. Sin cuenta, sin descargar nada.
>
> Build your own level and send it to your friends with a QR code. No account, no download.

Reto:

> Hice este nivel y casi nadie lo pasa. ¿Vos podés? Link en la bio.
>
> I made this level and almost nobody beats it. Can you? Link in bio.

Se juega en el celular:

> No hace falta instalar nada: abrí el link, girá el celu y jugá. También funciona sin conexión.
>
> Nothing to install: open the link, turn your phone sideways and play. Works offline too.

Hashtags (5 como máximo): `#indiegame #puzzlegame #webgame #juegosindie #gamedev`

## Dónde más publicarlo

| Cuándo | Dónde | Nota |
|---|---|---|
| Semana 0 | Amigos y conocidos | Mirar en Umami dónde abandona la gente y corregir antes de difundir |
| Semana 1 | Redes, r/WebGames, r/indiegames, Show HN, Product Hunt, grupos de gaming y de devs en español | Cada link con su `?utm_source=` |
| Semanas 2 a 4 | itch.io y Newgrounds (juego HTML5) | El build funciona desde un zip; enlazar a pongui.com |
| Más adelante | CrazyGames, Poki | Piden integrar su SDK y publicidad |

## Subir el juego a itch.io

1. Generar el paquete con `pnpm build:itch`: deja `pongui-itch.zip` en la raíz del proyecto.
2. En itch.io: **Upload new project**. Título `Pongui`, **Kind of project: HTML**, precio
   **No payments**.
3. Subir `pongui-itch.zip` y marcar **This file will be played in the browser**.
4. **Embed options:** tamaño `960 × 624`, activar **Fullscreen button** y **Mobile friendly**
   con orientación **Landscape**.
5. Descripción: el texto de presentación de esta guía, con el link
   `https://pongui.com/?utm_source=itch` y capturas de `docs/media/`.
6. Género **Puzzle**; etiquetas `puzzle`, `platformer`, `browser`, `level-editor`, `singleplayer`.
7. Dejarlo en **Draft**, probarlo con el botón de vista previa y recién ahí pasarlo a **Public**.

En esa versión el progreso se guarda en el navegador dentro de itch.io (aparte del de
pongui.com), no hay métricas, y los links que se comparten llevan a pongui.com.

## Qué mirar en Umami

- Visitas por día y de dónde vienen (`utm_source`, buscadores, links directos).
- Embudo: visita → `play_click` → `level_start` w1-01 → `level_complete` w1-01 → w1-05 → w2-01.
- `install`, `editor_open`, `level_shared` y `shared_level_opened`: si la gente instala y comparte.
- Search Console: impresiones y clics en Google (tarda de 2 a 6 semanas en moverse).

Señal para empezar con las apps nativas (a ajustar con datos reales): unas 1.000 personas por
semana, más del 30 % termina el mundo 1 y hay visitas que vuelven.
