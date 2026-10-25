# Plan: pedidos por WhatsApp desde la carta

**Estado:** etapa 1 (local) **cerrada** el 2026-10-25: funciona en iPhone y el pedido llega a
WhatsApp. Quedan mejoras de interfaz para una próxima etapa. El despliegue aún no se planifica.

## Objetivo

Que el cliente arme su pedido en la carta web y lo envíe con un toque al WhatsApp del local, en un
mensaje completo (productos, opciones, comentarios, retiro o delivery, nombre). Así se evita el ida
y vuelta de "hola, ¿qué tienen?". Todo lo demás (agotados, demoras, "hoy no hay reparto") se sigue
conversando por WhatsApp como hoy.

Se valida primero en Lomo Alemán con un MVP: lo mínimo que funcione, sin medición ni extras. Si
funciona, se aprende el modelo para un futuro microSaaS autoadministrable que se pueda vender a
otros restaurantes. El SaaS no se construye ahora.

## Contexto

### Datos de Vercel Analytics (últimos 30 días, a octubre 2026)

- 6.652 visitantes y 13.276 páginas vistas (+9%).
- `/carta`: 3.800 visitantes, unos 125 al día. Es la página más vista y hoy no tiene botón para pedir.
- `/`: 2.100. `/menu`: 1.500 (ver la sección de redirecciones: buena parte serían links rotos).
- Fuentes: Google 1.600, Instagram 1.600, WhatsApp 396.
- 94% desde el celular (iOS 48%, Android 46%).
- Patrón semanal: los domingos son los días altos y lunes y martes los bajos.

### Estado actual del código

- Sitio estático (Astro 5, `output: "static"`, Vercel con Cloudflare delante). El carro vive entero
  en el navegador y no necesita servidor.
- La carta general está en `src/data/menu.json` (11 secciones, 94 productos). Ya no se genera desde
  Firebase: se migró a archivo estático en febrero de 2026 (commit `1b52168`).
- Los Líquidos con alcohol de Colón están en `src/data/liquidos.json` y solo se muestran con
  `?sucursal=colon` (QR del local).
- Solo `src/pages/carta.astro` y `src/components/MenuSection.astro` leen la carta.
- Los locales están en `src/data/branches.json`. De los 16 locales, 13 tienen WhatsApp (`wsp`);
  Arauco, Chiguayante y Lota solo tienen teléfono.
- Página de local (`src/pages/local/[slug].astro`):
  - "Realizar Pedido" en realidad llama por teléfono (`tel:`).
  - "Pedido por Whastapp" (con error de tipeo) abre un chat con "Hola, quiero hacer un pedido".
- `src/pages/404.astro` manda **cualquier dirección inexistente** a `/menu`.
- `/menu` muestra un PDF (`public/img/menu.pdf`), no la carta con datos.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Alcance | Solo Lomo Alemán, como MVP |
| Precios y productos | Iguales en todos los locales |
| Carta del carro | Solo la carta general (`menu.json`), incluida su sección "Líquidos" sin alcohol (bebidas, café o té, Redbull, jugo, limonada) |
| Líquidos de Colón (alcohol) | **Fuera del carro**: no se puede vender alcohol a domicilio. Siguen como hoy, solo para ver en `/carta` con el QR del local, que es para consumo presencial |
| Retiro y delivery | Todos los locales hacen ambos. Se parte con el camino feliz |
| Agotados y excepciones | Se conversan por WhatsApp; el carro no los maneja |
| WhatsApp de los locales | WhatsApp normal (algunos Business), todo manual, sin respuesta automática |
| Quién puede recibir pedidos | MVP: el local que tiene WhatsApp puede; el que no tiene, no. Sin marca extra por ahora |
| Medición | **No en el MVP.** Se cuenta con `#pedidoweb` en los mensajes. Más adelante, Firebase (ver "Más adelante") |
| Desarrollo | Carta nueva en un JSON estático nuevo, servida en `/pedir`, que convivirá con `/carta`. Por ahora es interno (local); el despliegue se planifica después |
| Fuente de la carta | JSON estático ahora. Más adelante Firebase con la misma estructura, sin transformar nada |
| Cambios de carta | Congelados mientras conviven `/carta` y `/pedir` |
| WhatsApp de prueba | Mientras sea interno, **todo** pedido de `/pedir` va a `56932393772` |
| Pizzas | Tamaño único |
| Salsa de pizza | Solo salsa de tomate por ahora; debe quedar lista para agregar más |
| Sabor de bebida | Solo Pepsi por ahora; debe quedar lista para agregar más |
| Extras de pizza | Una porción por extra y se pueden repetir (ver detalle en la estructura) |
| Proteína de sandwiches | Mechada, Pollo, Churrasco, Lomo cerdo ahumado, Lomo centro |
| Proteína de completos "As" y "As Napolitano" | Mechada, Pollo, Churrasco, Lomo cerdo ahumado |
| Proteína de Arma tu ensalada | Las 5 del sandwich, más Huevo y Atún |
| Vegetales a elección | Nota obligatoria hasta tener la lista completa |
| Papas fritas | El subtítulo "Chica." es un error: se quita y los tamaños se ordenan |
| Redbull | Su única variante "x1" no aporta: pasa a precio directo ($1.900) |
| `/menu` y su PDF | Redirigir a `/carta` mientras se averigua de dónde vienen esos links |

## Estructura de la carta nueva

Un solo archivo, propuesto como `src/data/carta.json`, que reemplaza a `menu.json`. Sigue el modelo
de la industria (Uber Eats, Square, Toast) y está pensado para editarse a mano.

Este JSON y su esquema de validación son el **contrato** de la carta. Cuando la carta pase a
Firebase, lo que entregue Firebase debe cumplir el mismo esquema, y el carro no cambia.

### Conceptos

| Concepto | Qué es | Ejemplo |
|---|---|---|
| Categoría | Sección de la carta | Pizzas, Sandwichs |
| Producto | Algo que se pide | Alemán, Arma tu pizza |
| Variante | Elige una; define el **precio final** | Papas: Chica, Mediana, Grande, 1 Kilo |
| Grupo de opciones | Elecciones con mínimo y máximo; cada opción puede **sumar** precio | Proteína (1 de 5), Extras (0 a varios), Sabor |
| Nota obligatoria | Texto que el cliente debe escribir | "Indica tus 3 vegetales" |

### Reglas

1. **Identificador fijo** en todo (`"aleman"`, `"extra-palta"`), en minúsculas y con guiones. No
   cambia aunque cambie el nombre. Lo usan el carro guardado y, más adelante, "repetir último
   pedido", la medición, Firebase y el panel.
2. **Precios en pesos enteros** (CLP, sin decimales).
3. **Un producto tiene `price` o tiene `variants`, nunca ambos.** Cada variante tiene su precio final.
4. **Las opciones suman precio** (`price`, 0 si no se indica) y pueden repetirse hasta `maxQty`
   (1 si no se indica).
5. **`min` y `max` de un grupo cuentan unidades totales.** Con `min` ≥ 1 el grupo es obligatorio.
6. **Un grupo obligatorio con una sola opción se marca solo y no se muestra** (salsa de tomate,
   Pepsi). Al agregar opciones aparece la elección sin tocar código.
7. **Los grupos de una categoría los heredan todos sus productos.** Un producto puede sumar grupos
   propios.
8. **El orden en el archivo es el orden en pantalla.** Se elimina el campo `order`.
9. **`disabled: true`** oculta una categoría o un producto, como hoy.
10. **Se valida al construir el sitio.** Un esquema (por ejemplo zod, que viene con Astro) hace fallar
    el build si un grupo referenciado no existe, `min` > `max`, hay identificadores repetidos o un
    producto tiene `price` y `variants` a la vez.

### Grupos de opciones

| Id | Nombre | min / max | Opciones | Se usa en |
|---|---|---|---|---|
| `proteina-sandwich` | Proteína | 1 / 1 | Mechada, Pollo, Churrasco, Lomo cerdo ahumado, Lomo centro | Sandwichs de la casa, Sandwichs |
| `proteina-completo` | Proteína | 1 / 1 | Mechada, Pollo, Churrasco, Lomo cerdo ahumado | As, As Napolitano |
| `proteina-ensalada` | Proteína | 1 / 1 | Mechada, Pollo, Churrasco, Lomo cerdo ahumado, Lomo centro, Huevo, Atún | Arma tu ensalada |
| `proteina-pizza` | Proteína | 1 / 1 | Mechada, Pollo, Churrasco, Pepperoni, Atún, Lomo ahumado | Arma tu pizza |
| `salsa-pizza` | Salsa | 1 / 1 | Salsa de tomate | Arma tu pizza |
| `extras-pizza` | Extras | 0 / 10 | Porción de camarón +5.500, Carne de vacuno +4.000, Carne de pollo +4.000, Tocino +4.000, Queso +2.500, Pepperoni +2.500, Choclo +2.500, Palta +2.500 (cada uno repetible) | Todas las pizzas |
| `sabor-bebida` | Sabor | 1 / 1 | Pepsi | Bebidas, Bebidas 1,5 lt |
| `acompanamiento` | Acompañamiento | 1 / 1 | Papas fritas, Ensalada | Lomo a lo pobre, Pollo a lo pobre |
| `bbq` | Salsa BBQ | 0 / 1 | Con salsa BBQ | Americana |
| `agregado-otro` | Agregado | 1 / 1 | Los 17 de "Otros" (choclo, tomate, porotos verdes, huevo frito…) | Otros (Agregados, $1.000) |
| `tipo-aji` | Ají | 1 / 1 | Verde, Ahumado | Ají verde o ahumado |

Los 6 productos "Extra: …" de Pizzas dejan de ser productos sueltos y pasan a `extras-pizza`.

Productos con nota obligatoria mientras no esté la lista de vegetales:

| Producto | Nota |
|---|---|
| Arma tu pizza | Indica tus 3 vegetales |
| Kiel | Indica tus 5 vegetales |
| Sandwich vegetariano | Indica tus 5 vegetales |
| Arma tu ensalada | Indica tus 3 vegetales |

Cuando llegue la lista se crea un grupo `vegetales` (`min` = `max` = 3 o 5) y se quita la nota.
Solo cambian datos.

### Ejemplo (abreviado)

```json
{
  "version": 2,
  "currency": "CLP",
  "optionGroups": {
    "proteina-sandwich": {
      "name": "Proteína", "min": 1, "max": 1,
      "options": [
        { "id": "mechada", "name": "Mechada" },
        { "id": "pollo", "name": "Pollo" },
        { "id": "churrasco", "name": "Churrasco" },
        { "id": "lomo-cerdo-ahumado", "name": "Lomo cerdo ahumado" },
        { "id": "lomo-centro", "name": "Lomo centro" }
      ]
    },
    "extras-pizza": {
      "name": "Extras", "min": 0, "max": 10,
      "options": [
        { "id": "camaron", "name": "Porción de camarón", "price": 5500, "maxQty": 3 },
        { "id": "palta", "name": "Palta", "price": 2500, "maxQty": 3 }
      ]
    },
    "sabor-bebida": {
      "name": "Sabor", "min": 1, "max": 1,
      "options": [{ "id": "pepsi", "name": "Pepsi" }]
    }
  },
  "categories": [
    {
      "id": "sandwichs-casa",
      "name": "Sandwichs de la casa",
      "optionGroups": ["proteina-sandwich"],
      "items": [
        { "id": "aleman", "name": "Alemán", "description": "Chucrut, pepinillos, tomate y mayo.", "price": 7990 }
      ]
    },
    {
      "id": "pizzas",
      "name": "Pizzas",
      "optionGroups": ["extras-pizza"],
      "items": [
        {
          "id": "arma-tu-pizza", "name": "Arma tu pizza", "price": 15500,
          "description": "1 proteína, 3 vegetales, 1 salsa y queso.",
          "optionGroups": ["proteina-pizza", "salsa-pizza"],
          "requiredNote": "Indica tus 3 vegetales"
        }
      ]
    },
    {
      "id": "papas-fritas",
      "name": "Papas Fritas",
      "items": [
        {
          "id": "papas-fritas", "name": "Papas fritas",
          "variants": [
            { "id": "chica", "name": "Chica", "price": 3000 },
            { "id": "mediana", "name": "Mediana", "price": 5000 },
            { "id": "grande", "name": "Grande", "price": 6000 },
            { "id": "kilo", "name": "1 Kilo", "price": 8000 }
          ]
        }
      ]
    },
    {
      "id": "liquidos",
      "name": "Líquidos",
      "items": [
        {
          "id": "bebida", "name": "Bebidas",
          "optionGroups": ["sabor-bebida"],
          "variants": [
            { "id": "250", "name": "250cc", "price": 1200 },
            { "id": "350", "name": "350cc", "price": 1600 },
            { "id": "500", "name": "500cc", "price": 1800 }
          ]
        }
      ]
    }
  ]
}
```

## Flujo del cliente

### Entradas

1. **`/pedir` sin local:** arriba aparece "¿A qué local pides?". El local elegido se recuerda en el
   teléfono para la próxima visita.
2. **`/pedir?sucursal=X`:** llega con el local ya elegido, desde la página del local o el link en
   Instagram.
3. **Franja fija** con el local elegido: "Pidiendo a: **Baquedano** · cambiar".

Se elige el local **antes** de armar el pedido, para no perder un carro ya armado si el local
elegido no puede recibir pedidos.

### Según el local

| Local | Qué ve el cliente |
|---|---|
| Con WhatsApp | Botones "+", carro y envío por WhatsApp |
| Sin WhatsApp (Arauco, Chiguayante, Lota) | Carta de solo lectura y botón para llamar |

### Armar el pedido

- **Producto sin opciones:** botón "+", se agrega directo.
- **Producto con opciones:** se abre una hoja desde abajo con los grupos ("Extras: 2"), la nota
  obligatoria si corresponde, un comentario opcional y la cantidad. El botón
  "Agregar · $18.000" se habilita solo cuando lo obligatorio está completo.
- **Barra fija abajo:** "Ver pedido (3) · $23.970".

### Enviar

Formulario mínimo:

- Nombre.
- Retiro o delivery.
- Dirección (solo si es delivery).
- Medio de pago (opcional: efectivo, transferencia, tarjeta).
- Comentario general (opcional).

El botón "Enviar por WhatsApp" abre `wa.me` con el mensaje escrito.

### Mensaje

```
Hola Lomo Alemán Baquedano 👋 quiero hacer este pedido:

• 1x Arma tu pizza — $20.500
   Proteína: Pollo · Salsa de tomate
   Vegetales: choclo, champiñón, morrón
   Extras: Palta x2 (+$5.000)
• 2x Alemán (Lomo centro) — $15.980
   Nota: uno sin mayo
• 1x Papas fritas Grande — $6.000
• 2x Bebida 500cc Pepsi — $3.600

Total referencial: $46.080
🛵 Delivery · Juan · Los Carrera 123, depto 45
Pago: transferencia

#pedidoweb
```

- "Total referencial" porque el local confirma el monto final.
- `#pedidoweb` permite que los locales cuenten los pedidos que llegan por esta vía. En el MVP es la
  única medición.
- La salsa de tomate y Pepsi salen en el mensaje aunque no se muestren como elección.

## Etapas

### Etapa 1: local (ahora)

Todo en el computador con `npm run dev` (`astro dev --host`). Se prueba desde celulares conectados
al mismo wifi. No se despliega nada.

**1a. Carta nueva sin carro**

- [x] Crear `src/data/carta.json` con toda la carta general actual (`menu.json`) en la estructura
      nueva. Los Líquidos de Colón (`liquidos.json`) no entran.
- [x] Aplicar las correcciones: subtítulo de papas, orden de tamaños, extras de pizza como grupo,
      proteínas como grupos y notas obligatorias.
- [x] Esquema de validación que haga fallar el build ante errores (`src/lib/carta.ts`).
- [x] Crear `src/pages/pedir.astro` que lea `carta.json`, con el mismo aspecto que `/carta`
      (componente `src/components/CartaSection.astro`). Los extras de pizza se listan con su precio
      al final de la sección Pizzas.
- [x] Comparación automática de datos: 11 secciones y 88 productos, mismos nombres, precios,
      descripciones y orden. Solo difieren los cambios acordados (6 extras de pizza, subtítulo de
      papas y variante "x1" de Redbull).
- [ ] Revisión visual del equipo: misma cantidad de secciones y productos, mismos precios y mismo orden que `/carta`
      (salvo las correcciones acordadas).

**1b. Carro**

- [x] Selector de local (`?sucursal=X` o elección en pantalla), recordado en el teléfono, y franja
      "Pidiendo a".
- [x] Locales sin WhatsApp: carta de solo lectura y botón para llamar.
- [x] Botón "+" y hoja de opciones con validación de mínimos y máximos.
- [x] Carro con barra fija, editar cantidad, quitar y comentario por producto.
- [x] El carro guarda solo identificadores, con un nombre de guardado propio de `/pedir`. Al abrirlo
      se recalculan los precios con la carta actual; si un producto ya no existe, se quita con un
      aviso.
- [x] Formulario de envío y armado del mensaje.
- [x] **Todos los envíos van a `56932393772`**, sin importar el local elegido. El nombre del local
      sí va en el mensaje, para revisar que quede bien.

Archivos de la etapa 1b: `src/lib/pedido.ts` (lógica: precios, validación, carro guardado y
mensaje), `src/scripts/pedir.ts` (pantalla), `src/pages/pedir.astro` y
`src/components/CartaSection.astro`. Se probó con pruebas automáticas de la lógica y un recorrido
en un navegador simulando un celular (elegir local, armar productos, pedido, envío, recarga, local
sin WhatsApp y carro con un producto que ya no existe).

Notas de la implementación:

- El mensaje va **sin emojis**, para evitar los "�" en algunos teléfonos. Se pueden sumar después de
  probar en teléfonos reales.
- La nota obligatoria tiene `label` y `placeholder` (`"Vegetales"` / `"Indica tus 3 vegetales"`),
  para que el mensaje diga "Vegetales: …".
- En la hoja de opciones y en el mensaje van primero los grupos del producto y después los de la
  categoría (pizza: proteína, salsa, extras).
- **Safari:** las hojas usan `flex-auto` y no `flex-1` en su caja interior. Con `flex-1`, Safari
  (iPhone y Mac) las dibuja con 4 px de alto: se oscurece la pantalla pero la hoja no aparece.
  Detectado en un iPhone 12 con iOS 18.7 y verificado en Safari de macOS con `safaridriver`.
- **Probar siempre también en Safari**, no solo en Chrome: la mitad del tráfico es iOS (48%).
- En `astro dev`, la barra de herramientas de Astro aparece abajo al centro y puede tapar la barra
  del pedido. No existe en producción; en desarrollo se puede minimizar o desactivar.

Agregado después del cierre funcional (2026-10-25):

- [x] **"Vaciar pedido"** siempre visible en la hoja del pedido, con confirmación.
- [x] **Aviso de pedido ya enviado:** al tocar "Enviar" se guarda la hora. Si el cliente vuelve con
      el mismo carro, aparece "Ya enviaste este pedido hace X" con "Empezar un pedido nuevo" o
      "Seguir con este pedido". Cualquier cambio en el carro borra la marca. El carro **no** se
      vacía solo al enviar, porque no sabemos si el mensaje se mandó en WhatsApp.
- [x] **Recordar mis datos en este teléfono** (casilla marcada por defecto): nombre, entrega,
      dirección y medio de pago se guardan solo en el navegador del cliente al enviar, y se
      rellenan la próxima vez. "Olvidar" los borra. El comentario no se guarda.
- [x] **Confirmación del local sin ventana extra:** el local se sigue recordando, pero justo encima
      del botón de enviar hay una tarjeta "Enviarás este pedido a Lomo Alemán X" con la dirección y
      "Cambiar", y el botón dice "Enviar pedido a X". "Cambiar" abre la lista sobre el pedido sin
      perderlo; si el nuevo local solo recibe por teléfono, el pedido se cierra con un aviso. Se
      descartó una ventana "¿Confirmas el local?" porque se aprueba por reflejo sin leer.

**Para dar por terminada la etapa 1:**

- [ ] La carta de `/pedir` calza 1 a 1 con `/carta` (sin los Líquidos de Colón).
- [ ] El carro funciona en iPhone y Android.
- [ ] El mensaje llega bien formateado a WhatsApp en iPhone, Android y WhatsApp Web (emojis,
      saltos de línea, largo).

## Despliegue (se planifica después)

Por ahora `/pedir` es un producto interno y no se despliega. El plan de despliegue se hace cuando
termine la etapa 1. Puntos ya identificados para ese plan:

- **`/carta` y `/pedir` conviven.** `/carta` es para mirar (QR del local, Google, quien solo quiere
  ver precios) y `/pedir` es para pedir (Instagram, WhatsApp, "Hacer pedido" de cada local).
- **Dos páginas, una sola carta.** `/carta` pasa a leer `carta.json` en modo solo lectura y se borra
  `menu.json`. `liquidos.json` sigue solo en `/carta` para Colón (`?sucursal=colon`), porque el QR
  de Colón es para consumo presencial.
- **Botón visible en `/carta`**: "¿Quieres pedir? Arma tu pedido →" hacia `/pedir`. No se muestra
  con `?sucursal=colon`, porque ahí el cliente está en el local.
- **Menú del sitio** (`AppHeader.astro`, hoy "Carta Online"): sumar "Pedir".
- **Página de local con WhatsApp:** "Hacer pedido" lleva a `/pedir?sucursal=X` y "Llamar" al
  teléfono. Corregir el tipeo de "Whastapp".
- **Primero interno en producción:** `/pedir` sin links y sin indexar en Google, con el número de
  prueba, y demo con el dueño desde su teléfono.
- **Marcha blanca con 2 o 3 locales voluntarios** (por ejemplo Lomas Coloradas, la página de local
  más visitada). Hace falta una marca por local (por ejemplo `pedidosWeb: true` en
  `branches.json`); si algo falla, se apaga y el local vuelve a funcionar como hoy.
- **Abrir a los 13 locales con WhatsApp** como mes gratis, con el kit de lanzamiento (link para la
  biografía de Instagram, QR para el mesón y las bolsas, texto de respuesta rápida) y el conteo
  semanal de `#pedidoweb`.
- **Google:** decidir si `/pedir` se indexa; lo simple es que `/carta` sea la página que Google
  muestra.
- **Quitar el número de prueba** antes de recibir pedidos reales.
- **Validar en producción** lo que no se ve en local, como la caché de Cloudflare.

## Aparte: redirecciones de `/menu`, el PDF y la página de error

No depende de `/pedir`; se puede hacer en cualquier momento porque solo lleva a la `/carta`
actual. El objetivo es juntar el tráfico donde va a estar el botón de pedir y descubrir qué links
viejos siguen activos.

- [ ] `/menu` → `/carta?utm_source=menu` (302).
- [ ] `/img/menu.pdf` → `/carta?utm_source=pdf` (302).
- [ ] `/locales/menu-ruta-litoral` → `/carta?utm_source=menu-ruta-litoral` (hoy apunta a `/menu`).
- [ ] `404.astro` → `/carta?utm_source=404&utm_content=<dirección original>`. Así, en la pestaña
      UTM Parameters de Vercel Analytics se ve qué direcciones rotas siguen recibiendo visitas.
- [ ] Revisar en una o dos semanas los links viejos detectados y decidir cuáles matar.
- [ ] Purgar la caché de Cloudflare del PDF después del despliegue.

302 y no 301, porque los celulares guardan los 301 para siempre y aún se está investigando.

Esto usa los parámetros `utm_*` que Vercel Analytics ya muestra; no es la medición del carro, que
quedó fuera del MVP.

## Fuera de alcance del MVP (a propósito)

- Medición del carro (eventos, contadores, registro de pedidos).
- Alcohol y cualquier producto de `liquidos.json`.
- Pagos en línea, agotados, horarios, zonas y costo de delivery.
- Cuentas de usuario y panel de administración.
- "Repetir mi último pedido": descartado por ahora (no se guarda el pedido una vez enviado).

Todo lo operativo se resuelve conversando por WhatsApp, como hoy.

## Más adelante (después del MVP)

### Medición en Firebase

- Contadores con `increment()` (agregar al carro, abrir el carro, enviar, por local y por día).
- Escribir a través de una ruta propia del sitio (Astro con Vercel permite rutas de servidor aunque
  el sitio sea estático). Así no se exponen credenciales, no se pueden inflar los números escribiendo
  directo, y no se carga la librería de Firebase en el celular.
- Enviar con `navigator.sendBeacon`, porque al tocar "Enviar" la página salta a WhatsApp y un envío
  normal se puede cortar.
- Además del contador, un registro anónimo por pedido enviado (local, productos, total y hora). Con
  eso salen el ticket promedio, los productos más pedidos y las horas peak, que es lo que justifica
  el reporte mensual. Sin nombre, dirección ni teléfono.
- Datos ordenados para varios clientes desde el inicio, por ejemplo `restaurantes/lomo-aleman/…`.
- "Enviado" significa que se abrió WhatsApp con el pedido, no que la persona lo mandó. Hay que leerlo
  junto con el conteo de `#pedidoweb` de los locales.
- Contar cuántas personas eligieron un local sin servicio, como argumento de venta para ese local.

### Carta en Firebase

- La estructura no cambia: lo que entregue Firebase cumple el mismo esquema que `carta.json`. Los
  identificadores fijos sirven directo como identificadores en Firebase.
- Decidir entonces:
  - **Cómo se guarda:** un documento con toda la carta o colecciones separadas para categorías,
    productos y grupos. Lo segundo es mejor para un panel de administración.
  - **Cuándo se lee:** al construir el sitio (exige republicar con cada cambio) o en el navegador
    del cliente (cambios al instante, pero una carga extra).
- Revisar por qué se salió de Firebase en febrero de 2026, para no repetir ese problema.

### Otras mejoras

- (Ninguna pendiente: "recordar datos" se hizo en la etapa 1; "repetir último pedido" se descartó.)

## Por confirmar

- [ ] **Lista completa de vegetales** (para pizza, ensalada, Kiel y vegetariano) y de los vegetales
      extra de pizza (hoy solo choclo y palta).
- [ ] **Sabores de bebida y salsas de pizza:** se agregan cuando lleguen.

## Riesgos y notas

- **Emojis en `wa.me`.** En algunos teléfonos llegan como "�". Si falla en las pruebas, el mensaje
  se envía sin emojis.
- **Largo del mensaje.** Un pedido grande sigue siendo bastante menos que el límite práctico de una
  URL, pero conviene probar un pedido de 15 o más productos.
- **Caché.** Cloudflare y la página de local (`max-age=3600`) pueden mostrar datos de hasta 1 hora
  atrás. El carro recalcula los precios al abrirse.
- **Escritorio.** En el computador (6% del tráfico) `wa.me` abre WhatsApp Web o la app de escritorio.
- **Sin medición en el MVP.** El único dato de uso es el conteo manual de `#pedidoweb` que hagan los
  locales. Conviene acordar con ellos cómo y cada cuánto lo reportan.

## Modelo comercial (propuesta para conversar con el dueño)

- **Puesta en marcha (pago único, la paga el dueño de la marca):** $400.000 – $700.000 CLP.
- **Mensualidad por local que quiera el servicio:** $7.000 – $10.000 CLP, desde el segundo mes.
  Incluye cambios de carta y soporte. El reporte mensual de pedidos por local llega cuando se sume
  la medición.
- **Primer mes gratis** para los 13 locales con WhatsApp.

Argumentos de venta:

1. **La demanda ya existe:** 3.800 personas al mes ven la carta, el 94% desde el celular, y hoy
   no tienen botón para pedir.
2. **El pedido llega completo** en un mensaje: menos tiempo de atención y menos errores de
   proteína o tamaño.
3. **0% de comisión**, frente al 20–30% que suelen cobrar las apps de delivery.
4. **No cambia nada en el local:** el pedido llega al mismo WhatsApp, sin tablet ni capacitación.
5. **Riesgo bajo:** un mes gratis.

Escenario (supuesto, no promesa): si el 3% de quienes ven la carta envía un pedido, son unos 110
pedidos al mes; con un ticket de $15.000, cerca de $1,7 millones al mes sin comisión.

## Visión microSaaS (referencia, no se construye ahora)

- La estructura de `carta.json` es la misma que necesitaría un panel de autoadministración:
  - **Carta:** productos, precios, opciones y agotados.
  - **Locales:** WhatsApp y horarios.
  - **Herramientas:** generador de links y QR por local.
  - **Estadísticas:** pedidos enviados.
- Camino: después de Lomo Alemán, ofrecerlo como adicional a 2 o 3 clientes de la agencia,
  configurado a mano. El panel se construye recién cuando configurar a mano ya no dé abasto.
- Regla desde ya: la carta, las opciones y los locales viven como datos, nunca escritos a mano en
  las páginas.
