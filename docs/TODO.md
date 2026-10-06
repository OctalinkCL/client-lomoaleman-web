# TODO

## Redirigir el QR de Colón a `/carta` y mostrar "Líquidos" solo para esa sucursal

**Estado:** pendiente (analizado el 2026-10-05, sin cambios en el código).

### Contexto

El QR impreso en la sucursal Colón apunta a:

```
https://www.lomoaleman.cl/wp-content/uploads/2023/12/carta_colon.pdf
```

Hoy esa URL sirve el PDF antiguo que está en `public/wp-content/uploads/2023/12/carta_colon.pdf`.
Se quiere que lleve a `lomoaleman.cl/carta` y que, al venir desde ese QR, la carta muestre la
sección "Líquidos", que solo existe en Colón. Hoy "Líquidos" se muestra a todos.

El sitio es estático (`output: "static"` en Astro, desplegado en Vercel con Cloudflare delante),
por lo que el flag se tiene que leer en el navegador, no en el servidor.

### Tareas

- [ ] **Redirect con flag** en `astro.config.mjs`. El nombre del parámetro (`sucursal`) es una propuesta.

  ```js
  "/wp-content/uploads/2023/12/carta_colon.pdf": {
    status: 302,
    destination: "/carta?sucursal=colon",
  },
  ```

- [ ] **Actualizar el redirect existente** de `/wordpress/wp-content/uploads/2023/12/carta_colon.pdf`
      para que también lleve a `/carta?sucursal=colon`. Es la URL que usa el botón "Carta" de la
      página del local Colón (`menu` en `src/data/branches.json`), y hoy redirige a `/carta` sin flag.
- [ ] **Marcar la sección** "Líquidos" en `src/data/menu.json` con algo como `"onlyBranches": ["colon"]`.
- [ ] **Detectar el flag** en `src/pages/carta.astro`: renderizar oculta toda sección que tenga
      `onlyBranches` y mostrarla con un script corto si la URL trae `?sucursal=` con una sucursal
      incluida en esa lista.
- [ ] **Persistir el flag** en `sessionStorage` (opcional), para que "Líquidos" siga visible si el
      cliente navega a otra página y vuelve a `/carta`.
- [ ] **Probar en un preview deploy** de Vercel (ver nota sobre `astro dev` más abajo).
- [ ] **Purgar la caché de Cloudflare** para la URL del PDF después del deploy.

### Por confirmar antes de implementar

- [ ] ¿`src/data/menu.json` se regenera desde Firebase u otra fuente? Si es un export, el campo
      `onlyBranches` se perdería al regenerar y la regla tendría que vivir en `carta.astro`.

### Notas

- **El redirect actual no cubre el QR.** El que existe es para `/wordpress/wp-content/...`; el QR
  apunta a `/wp-content/...`, sin `/wordpress`.
- **El PDF no estorba en producción.** En Vercel los redirects se evalúan antes que los archivos
  estáticos, así que no hace falta borrarlo. En `astro dev` probablemente se siga sirviendo el PDF,
  por eso la prueba debe hacerse en un preview deploy.
- **Caché de Cloudflare.** Si Cloudflare está como proxy, cachea los `.pdf` por defecto. Sin purgar,
  el QR puede seguir mostrando el PDF viejo por un tiempo.
- **302 en vez de 301.** Los celulares guardan los 301 de forma permanente; con 302 se puede cambiar
  el destino más adelante.
- **No es privado.** Cualquiera que escriba `?sucursal=colon` verá "Líquidos", y los datos van en el
  HTML aunque estén ocultos. Para una carta no debería importar.
