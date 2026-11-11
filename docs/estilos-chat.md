# Estilos visuales del chat: investigación y decisiones

Fecha: 11/11/2026.

## Qué hacen otras herramientas

- **Streamlabs Chat Box**: de serie solo permite el color y el tamaño de letra. La transparencia del fondo y las fuentes propias requieren escribir CSS a mano. Es una queja habitual en los foros de OBS.
- **Widgets de StreamElements y otros creadores** (de pago o comunitarios): ofrecen varias disposiciones (burbuja, mínimo solo texto, tarjeta, degradado, neón, cristal) y colores editables. Los widgets multiplataforma marcan cada mensaje con el **logotipo o un punto de color de la plataforma** y muestran las **insignias del canal**.
- **Social Stream Ninja**: muchas plantillas, pero se configuran con parámetros en la URL o con CSS.

## Legibilidad sobre vídeo (reglas prácticas, no estándares medidos)

- Probar a tamaño real: en móvil el overlay se ve a la mitad del tamaño diseñado, y la compresión emborrona el texto pequeño.
- Un **contorno o sombra oscura de 1–2 px** mejora mucho la lectura sobre fondos variados. Un contorno grueso queda caricaturesco.
- Un **fondo semitransparente** detrás del texto ayuda en partidas brillantes o con mucho movimiento.
- Interlineado de unas 1,3–1,5 veces el tamaño de letra. Pocos tamaños distintos y no saturar la pantalla de texto.

## Insignias por plataforma

- **Twitch**: streamer (cámara roja), moderador (espada verde), VIP (diamante rosa), fundador (los primeros suscriptores), suscriptor (insignias propias del canal) y verificado (partner).
- **YouTube**: propietario (nombre resaltado en amarillo), moderador (llave azul), miembro (insignia propia de cada canal) y verificado.
- **Kick**: streamer, moderador, VIP, OG, fundador, suscriptor (insignias del canal por antigüedad), verificado y regalador de subs.
- **TikTok**: moderador, suscriptor e insignias de nivel de fan (imágenes).

## Decisiones en MTv MultiChat

1. **Logotipo real de cada plataforma** delante de cada mensaje (Simple Icons, licencia CC0), en tres estilos: a color, como insignia (logo sobre su color) o blanco.
2. **Insignias**: se usa la imagen que da la plataforma cuando existe: Twitch con sesión iniciada, miembro de YouTube y TikTok. Cuando no hay imagen, se dibuja una insignia propia con el color y el símbolo de esa plataforma. Cada plataforma solo muestra sus propios rangos.
3. **Tamaño y transparencia** sin CSS: tamaño de letra, transparencia del fondo, transparencia del chat entero (en porcentaje) y contorno del texto (ninguno / fino / grueso).
4. **Dock**: tamaño de letra propio. En la app de escritorio, además, transparencia de la ventana y "siempre encima" para ver el chat sobre el juego.

## Fuentes

- Streamlabs: https://support.streamlabs.com/hc/en-us/articles/360043747714-How-to-Add-a-Chat-Box-Overlay-to-Streamlabs-Desktop
- OBS (CSS del chat de Streamlabs): https://obsproject.com/forum/threads/how-can-i-use-css-file-to-change-streamlabs-chat-box-font-in-browser-source.96050/latest
- Widget multiplataforma con logotipos e insignias: https://github.com/ahmetenesdur/streamelements-overlays
- Ultimate MultiStyle Chat (7 estilos): https://store.streamspell.com/products/ultimate-multistyle-chat
- Citrus chat overlay (contorno y sombra): https://docs.citrus.fyi/utilities/chat-overlay.html
- Tipografía en directos: https://onestream.live/blog/typography-in-live-streaming-and-content-creation/
- Fuentes legibles para chat: https://overlayfonts-l4.pages.dev/overlay-fonts-for-minimalist-aesthetic-twitch-tech-channels-modern-minimalist-fonts
- Insignias de Twitch: https://primagames.com/featured/all-twitch-chat-badges-and-meanings
- Insignias de Kick: https://stream-rise.com/blog/how-to-add-sub-badges-on-kick
- Simple Icons: https://simpleicons.org

## Comparación con Social Stream Ninja (opciones visuales del overlay)

Social Stream Ninja tiene más de 70 parámetros visuales que se escriben en la URL del overlay (`parameters.md`). Elegimos los esenciales y les dimos un solo control en el editor:

| Social Stream Ninja (URL) | MTv MultiChat (editor) |
|---|---|
| `fontcolor`, `namecolor`, `colorednames` | Color del texto; color de los nombres: el del usuario, el de la plataforma o uno fijo |
| `chroma`, `transparent`, `opacity` | Color del fondo, transparencia del fondo, transparencia del chat |
| `font`, `googlefont`, `fontweight` | Fuente (del sistema o de Google) y grosor |
| `nooutline`, `stroke*`, `bolder`, `thinner` | Contorno: ninguno, fino o grueso |
| `compact`, `padding` | Separación: compacta, normal o amplia |
| `emoji` | Tamaño de los emotes |
| `twolines` | Nombre y mensaje en una o dos líneas |
| `alignright`, `alignbottom`, `reverse` | Lado (izquierda o derecha) y por dónde entran los mensajes |
| `sequence` | Agrupar mensajes seguidos de la misma persona |
| `fadedtop` | Difuminar el borde del chat |
| `trim` | Cortar mensajes largos |
| `limit`, `showtime` | Mensajes a la vez, desaparecen tras |
| `fadein`, `swipe*`, `animatein` | Animación: deslizar, aparecer o ninguna |
| `hidesource`, `noavatar`, `nobadges` | Mostrar logotipo, avatares o insignias |
| `hidecommands`, `hidefrom` | Ocultar comandos y bots |
| `bubble` | Estilo Burbujas |

Lo que **no** se incluye, por ser poco usado o por complicar el editor: CSS o JavaScript propios, modo horizontal, texto de derecha a izquierda, filtros por sentimiento, colas y fijados automáticos, sincronización entre varios docks y la decena de variantes de resaltado.

Para que no sea engorroso, el editor tiene **estilos rápidos** de un clic (Oscuro, Claro, Neón, Solo texto, Cristal) y las opciones están agrupadas en secciones plegables: Estilo, Colores, Texto, Disposición, Qué se muestra y Filtros. Los nombres se ajustan solos para leerse tanto sobre fondo oscuro como claro.
