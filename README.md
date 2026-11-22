# Rebotín

Puzzle de pelota rebotadora para PC, tablet y celular, inspirado en los juegos de "pelota que rebota" de los 90. Es una PWA: se juega desde el navegador, se puede instalar como app y funciona sin conexión.

## Comandos

```bash
npm install
npm run dev       # servidor de desarrollo (http://localhost:5173)
npm test          # tests de física + verificación automática de que cada nivel tiene solución
npm run build     # build de producción en dist/
npm run preview   # sirve dist/ para probar la PWA (instalación y modo offline)
npm run icons     # regenera los íconos de public/icons
```

Atajo de desarrollo: `?nivel=5` en la URL abre directo el nivel 5. En modo dev, `await replay(4)` en la consola reproduce la solución automática del nivel 5.

## Publicar

`dist/` es un sitio estático: se puede subir a Cloudflare Pages, Netlify o GitHub Pages (usa rutas relativas, así que también anda en un subdirectorio). La instalación como app requiere HTTPS, que estos servicios ya dan.

## Cómo se juega

- La pelota rebota sola. ◀ ▶ (o A/D) la mueven en el aire.
- Mantener **saltar** (Espacio / botón grande) al tocar el piso da un rebote alto.
- Hay que juntar todas las gemas para abrir la salida.
- Hay 3 estrellas por nivel: completarlo, no perder vidas y bajar del tiempo objetivo.

## Editar o crear niveles

Cada nivel es un JSON en `src/levels/` con una grilla de 20×12 caracteres. Los archivos se cargan en orden alfabético.

| Carácter | Qué es |
|---|---|
| `#` | bloque sólido |
| `x` | frágil (se rompe después de 1 rebote) |
| `X` | frágil fuerte (3 rebotes) |
| `^` | fuego (mata; con una gota se apaga) |
| `s` | resorte (rebote de 6 bloques) |
| `<` `>` | rampa: te atrapa y te lanza siempre igual hacia ese lado (~5 bloques) |
| `w` | muro de ladrillos (el martillo rompe todo el muro conectado) |
| `*` | pinchos |
| `g` `d` `h` `l` | gema, gota, martillo, vida extra |
| `P` `E` | inicio y salida |

Alcances útiles para diseñar: el rebote normal sube 1 bloque y avanza ~2. El rebote alto sube 3 y avanza ~3. El resorte sube 6. `npm test` avisa si un nivel nuevo no tiene solución.
