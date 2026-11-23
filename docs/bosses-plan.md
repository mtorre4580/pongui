# Plan: un jefe por mundo

Guía de trabajo para construir los jefes de los mundos 2 a 10 (el del mundo 1 ya existe en
`feat/boss-world-1`). Cuando estén todos, este archivo se borra y lo que valga la pena queda en
`CLAUDE.md`.

## Objetivo

Que cada mundo termine en una pelea distinta, cada vez más difícil, que haya que intentar
varias veces. El jefe del mundo 1 solo camina, se acelera y salta: los siguientes tienen que
**hacer algo** (tirar cosas, romper el piso, atrapar la pelota, apagar la luz) y usar las
mecánicas de su mundo.

## Reglas que valen para todos

- **Originales.** Se pueden tomar ideas generales de los jefes clásicos de plataformas y
  aventuras (patrones, fases, ataques que se anuncian), pero nunca nombres, personajes,
  diseños ni música de un juego existente. Nombre, aspecto y sonido propios.
- **Sin ayuda.** No hay "Mirá al bot", ni estrellas, ni compartir, ni editor. Solo una línea con
  el objetivo (`game.bossHint.N`).
- **Justos.** Todo ataque se anuncia antes (un gesto, un brillo, una sombra) al menos 0,6 s.
  Nada mata sin aviso. El azar, si hay, sale de un generador con semilla fija: la pelea es la
  misma cada vez y se puede aprender.
- **Cómo se le pega.** Siempre rebotándole encima cuando está vulnerable. Lo que cambia de un
  jefe a otro es cuándo y cómo queda vulnerable.
- **Aturdido tras un golpe** hasta que la pelota vuelve a tocar el suelo (ya está en
  `BossFight`): no se encadenan golpes.
- **Perder una vida reinicia la pelea** (el jefe recupera sus golpes).
- **Dificultad creciente.** Más golpes (3 → 5), menos tiempo de aviso, más cosas a la vez y
  menos lugares seguros. Del mundo 4 en adelante no debería haber ningún lugar donde esperar
  para siempre.
- **Sonido propio.** Cada jefe tiene su música (otra nota base, otra escala, otro ritmo, otro
  timbre) y sus efectos. Todo sintetizado en `audio/music.ts` y `audio/sfx.ts`, sin archivos.
- **Canvas.** Sin `tint` ni `fillGradientStyle`; texturas vectoriales generadas una vez.

## Los diez jefes

| Mundo | Jefe | Golpes | Qué hace | Cómo se le pega |
|---|---|---|---|---|
| 1 Valle Saltarín | **Gruñón**, un bloque con cuernos | 3 | Camina, se acelera con cada golpe, salta | Rebote alto o caída desde una cornisa (hecho) |
| 2 Cuevas de Cristal | **Sierpe**, una serpiente de roca | 3 | Sale de agujeros del piso y las paredes (el agujero tiembla antes); hace caer estalactitas donde se ve una sombra | Rebotarle en la cabeza mientras está afuera; el musgo del piso solo deja rebotes bajos, así que hay que subir a las repisas |
| 3 Picos Nubosos | **Borrasca**, un pájaro de tormenta | 3 | Vuela arriba; tira rayos por columnas que primero se iluminan; sopla ráfagas que empujan la pelota de costado | Subir por las corrientes de aire y caerle encima desde una nube |
| 4 Taller de Engranajes | **Tuerca**, un robot con escudo | 4 | Dispara tornillos a ras del piso; las cintas empujan hacia él | El escudo solo se apaga al pisar el interruptor (bloques A/B); hay unos segundos para pegarle antes de que vuelva |
| 5 Laguna de Coral | **Tinta**, un pulpo | 4 | Arena bajo el agua; lanza burbujas de tinta que suben lento; sus tentáculos atrapan la pelota y la arrastran: hay que soltarse sacudiendo izquierda y derecha | Rebotarle en la cabeza cuando recoge los tentáculos; los portales sirven para cambiar de lado |
| 6 Picos Helados | **Ventisca**, un gigante de nieve | 4 | Tira bolas de nieve en arco que dejan hielo donde caen (la pelota patina); pisa fuerte y rompe el hielo fino | Hacerlo resbalar contra una pared con su propio hielo: queda sentado y vulnerable |
| 7 Núcleo de Brasas | **Brasa**, un dragón de lava | 4 | Escupe bolas de fuego en arco; el piso es de bloques que se desmoronan y él lo va rompiendo; los respiraderos se encienden con su ritmo | Caerle encima desde las plataformas que quedan; el piso roto no vuelve: la pelea tiene límite |
| 8 Estación Estelar | **Órbita**, un platillo | 5 | Gravedad baja; orbes que persiguen despacio; un rayo tractor que atrapa la pelota; los rebotadores devuelven todo | Rebotar en los rebotadores para alcanzarlo cuando baja a disparar el rayo |
| 9 Fortaleza Sombría | **Sombra**, un espectro | 5 | Apaga la luz (solo queda el círculo alrededor de la pelota); aparece y desaparece al ritmo de los bloques alternos; se teletransporta | Solo se le puede pegar cuando está sólido; sus ojos brillan en la oscuridad y delatan dónde va a aparecer |
| 10 Cumbre Arcoíris | **Rey Prisma**, el jefe final | 5 | Una fase por golpe, cada una con un ataque de los jefes anteriores: bolas de fuego, piso que se rompe, oscuridad, ráfagas, tentáculos | Queda vulnerable al completar un tramo de cada fase: el puente arcoíris aparece y lleva hasta él |

Los nombres son en español neutro; cada uno necesita su nombre en `en`, `es` y `pt-BR`
(`boss.N`). Si un diseño no resulta justo o divertido al implementarlo, se cambia: la tabla es
el punto de partida, no un contrato.

## Trabajo técnico previo: el motor

Hoy `BossFight` (`src/game/boss.ts`) solo sabe mover un bloque de lado a lado. Antes del jefe 2
hay que generalizarlo, sin romper al Gruñón:

- **Cerebro por jefe.** Una interfaz (`BossBrain` o similar) con el comportamiento de cada jefe,
  y `BossFight` como el marco común: vulnerable o no, golpes, aturdimiento, fases, eventos.
- **Proyectiles.** Lista de objetos con posición, velocidad, gravedad, radio y vida; matan al
  tocar. Algunos se pueden rebotar o esquivar por arriba.
- **Cambios en la arena.** El jefe puede cambiar baldosas del `World` (romper piso, poner
  hielo, encender respiraderos) y avisar a la escena para que las redibuje.
- **Fuerzas sobre la pelota.** Empujones (viento), agarre (la pelota queda sujeta hasta que el
  jugador se suelta) y oscuridad (reusar el velo de los niveles oscuros).
- **Avisos.** Cada ataque tiene un estado "anunciando" que la vista dibuja.
- **Azar con semilla.** Nunca `Math.random` en la lógica.
- Todo puro y con tests en `src/game/`, como hasta ahora. La escena solo dibuja.

En la vista: `gfx/bossView.ts` pasa a tener una textura por jefe y a dibujar proyectiles y
avisos. En el audio: `startBossMusic` recibe un tema (nota base, escala, tempo, timbre) en vez
de solo una nota.

Si `play.js` supera su presupuesto, se sube el límite en `bundle-budget.json` (decisión ya
tomada: el juego puede pesar más mientras siga siendo ágil) o se pasa el código de jefes a un
chunk aparte. Lighthouse tiene que seguir en 100.

## Cómo se prueba cada jefe

Nadie los va a jugar a mano antes de revisar, así que cada uno necesita:

1. **Un guion que lo vence** en `tests/boss.test.ts`, jugando con una estrategia que una
   persona podría seguir. Es lo que garantiza que no quede imposible.
2. **Un guion ingenuo que pierde** (quedarse quieto, correr siempre para un lado): garantiza
   que no sea trivial ni tenga un lugar seguro para siempre.
3. **Tests de cada ataque**: que se anuncia, que mata si no se esquiva, que se puede esquivar.
4. **La pelea corrida en la escena real** con teclas, como se hizo con el Gruñón, y capturas
   de pantalla de cada fase adjuntas al PR.
5. Los checks de siempre: `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, `pnpm build`,
   `pnpm check:bundle`, `pnpm test:e2e`, `pnpm validate:levels`.

## Ramas y PRs

Una cadena, cada rama sale de la anterior, todas a partir de `feat/boss-world-1`:

```
main
└─ feat/boss-world-1      (PR abierto: Gruñón, desbloqueo, música)
   └─ feat/boss-engine    motor generalizado, Gruñón sin cambios de comportamiento
      └─ feat/boss-world-2
         └─ feat/boss-world-3
            └─ … hasta feat/boss-world-10
```

- Un PR por rama, con la plantilla del repo completa, apuntando a la rama anterior.
- Cada PR de jefe: su `BossDef`/cerebro y su arena en `bosses/index.ts`, su mundo en
  `BOSS_WORLDS`, su textura, su tema musical y sus efectos, sus textos en tres idiomas, sus
  tests y la actualización de `CLAUDE.md`.
- Al agregar un mundo a `BOSS_WORLDS`, quien ya tenía abierto el mundo siguiente lo conserva
  (ya lo resuelve `unlocked` en el guardado; hay un test en `tests/unlock.test.ts` que hay que
  extender).
- El último PR actualiza la landing (mencionar los jefes), el README y borra este archivo.

## Qué queda para revisar a mano

Lo que ningún test puede decir y hay que probar jugando: si cada jefe es divertido, si la
dificultad sube pareja de uno a otro, si los avisos se entienden y cómo suena cada música.
Cada PR tiene que listar con honestidad qué se verificó con tests y qué no.
