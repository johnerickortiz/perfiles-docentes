# Proyecto: Directorio de docentes y base de ideas de investigación

Sitio estático para el programa de Ingeniería de Sistemas de la Universidad Mariana
(Pasto, Nariño, Colombia). Ayuda a los estudiantes de 5º semestre a encontrar asesor
y tema de proyecto de grado, mostrando los perfiles de los 16 docentes y una base
consolidada de ideas de investigación.

Se publica en GitHub Pages. Es un sitio estático hoy, pero la arquitectura debe permitir
migrar a dinámico en el futuro sin reescribir el frontend.

## Contexto del programa

- La investigación estudiantil se condensa en los proyectos de grado.
- Dos modalidades de proyecto de grado: **proyecto de investigación** y
  **proyecto de desarrollo tecnológico** (enfocado en desarrollo de software).
- Según la ruta de investigación del programa, en 5º semestre los estudiantes
  empiezan a generar ideas y su propuesta, y para ello buscan un asesor.
- Terminología a respetar: usar **"socialización"** de forma consistente;
  referirse al **"comité de investigación del programa"** (no CIPRO ni variantes).

## Arquitectura: tres capas (regla central)

Separar datos, acceso a datos y presentación. Hoy estático; el día que migre a dinámico,
solo cambia la capa de acceso a datos.

1. **Datos** — archivos JSON en `/data/` (hoy). Mañana, respuestas de una API.
2. **Acceso a datos** — `js/data-service.js`: ÚNICO punto que toca la fuente de datos.
   Todo el resto llama a estas funciones, nunca a `fetch` directo. Migrar = cambiar
   solo el interior de estas funciones.
3. **Presentación** — `js/render.js`: recibe datos ya listos y devuelve HTML.
   No hace peticiones ni conoce el origen de los datos.

`js/app.js` orquesta: pide datos al data-service, se los pasa al render.

## Estructura de carpetas

```
/
├── index.html
├── /css/
│   └── styles.css
├── /js/
│   ├── data-service.js    ← la capa que cambiará al migrar a dinámico
│   ├── render.js          ← presentación (plantillas → HTML)
│   └── app.js             ← orquestación
├── /data/
│   ├── docentes.json
│   ├── ideas-externas.json
│   ├── ideas-tomadas.json
│   └── proyectos.json
├── /img/
│   └── docentes/          ← fotos nombradas por id: docente-01.jpg, etc.
└── /tools/
    └── excel_to_json.py   ← conversor Excel → JSON
```

## Buenas prácticas (mantener siempre)

- **IDs estables y únicos**, nunca referenciar por posición en el array.
  Mapean 1:1 a llaves primarias/foráneas si se migra a base de datos.
- **Datos normalizados, vistas derivadas.** La "base de ideas" NO se almacena:
  se calcula en tiempo de render recorriendo las ideas de los docentes + las ideas
  externas. Una idea vive en un solo lugar; las vistas la agregan (como un JOIN).
  Igual patrón para los **proyectos dirigidos**: viven en `data/proyectos.json`,
  no dentro del docente; `data-service.js` los une al perfil por `docenteId`
  cuando se abre el modal (`obtenerProyectosPorDocenteId`).
- **Renderizado por plantillas**, no HTML incrustado a mano: funciones que reciben
  un objeto y devuelven HTML.
- **Estado en la URL** (`?docente=docente-01`, `?area=...`, `?eje=...`) para
  vistas enlazables y compatibles con enrutamiento futuro.
- **Validación al cargar**: verificar campos requeridos antes de renderizar.
- Sin dependencias externas ni frameworks pesados. HTML/CSS/JS autónomo, coherente
  con las otras publicaciones del programa.

## Esquema de datos

### Taxonomía (data/config.json)

Hay UNA sola línea de investigación institucional, con 4 áreas temáticas, y cada
área tiene sus propios ejes temáticos. `config.json` es la ÚNICA fuente de esta
taxonomía — ni docentes.json ni ideas-externas.json la redefinen, solo la referencian
por nombre exacto.

```json
{
  "linea": "Ingeniería, Informática y Computación",
  "areas": [
    {
      "nombre": "Ingeniería de Software",
      "ejes": ["Construcción y Evolución de Software", "..."]
    }
  ]
}
```

### Docente (data/docentes.json — array de objetos)

```json
{
  "id": "docente-01",
  "nombre": "Nombre Completo",
  "rol": "Profesor",
  "titulos": ["Ingeniero de Sistemas", "Magíster en..."],
  "areas": [
    { "area": "Ingeniería de Software", "ejes": ["Construcción y Evolución de Software"] },
    { "area": "Inteligencia Artificial y Ciencia de Datos", "ejes": ["Machine Learning (Aprendizaje automático)"] }
  ],
  "ideasInvestigacion": [
    {
      "id": "idea-01-01",
      "titulo": "Título temporal de la idea",
      "descripcion": "Descripción...",
      "area": "Inteligencia Artificial y Ciencia de Datos",
      "eje": "Machine Learning (Aprendizaje automático)",
      "ejesSecundarios": ["Data Science (Analítica de datos)"],
      "objetivos": ["Objetivo 1", "Objetivo 2"]
    }
  ],
  "contacto": "correo@umariana.edu.co"
}
```

- `rol`: `Profesor`, `Asistente` o `Director`. Si un docente no lo trae, se
  asume `Profesor` (ver `data-service.js`). Determina, junto con
  `proyectosActivos`, la disponibilidad del docente como asesor — ver
  "Disponibilidad del docente" más abajo.

### Proyecto dirigido (data/proyectos.json — array de objetos)

No vive dentro del docente: se une a su perfil por `docenteId` en tiempo de
render (mismo patrón JOIN que la base de ideas).

```json
{
  "id": "proy-01-01",
  "docenteId": "docente-01",
  "titulo": "Sistema de recomendación para bibliotecas universitarias",
  "estado": "finalizado",
  "fechaIdea": "2023-02",
  "fechaPropuesta": "2023-08",
  "fechaFin": "2024-06",
  "tipo": "desarrollo",
  "area": "Ingeniería de Software",
  "eje": "Construcción y Evolución de Software"
}
```

- `estado`: tres valores posibles, cada uno con más fechas que el anterior
  (un proyecto avanza de una etapa a la siguiente, nunca se saltan fechas):
  - `propuesta`: solo `fechaIdea`.
  - `proyecto`: `fechaIdea` + `fechaPropuesta`, sin `fechaFin`.
  - `finalizado`: las tres fechas — `fechaIdea`, `fechaPropuesta` y `fechaFin`.
- Fechas en formato `AAAA-MM`. Cada proyecto incluye **solo** las fechas que
  correspondan a su `estado` (no se rellenan las que aún no aplican). El
  antiguo campo `fechaInicio` ya no existe: el arranque formal del proyecto
  (lo que antes era `fechaInicio`) ahora es `fechaPropuesta`.
- `tipo`: `investigacion` o `desarrollo` (las dos modalidades). Puede faltar
  en un proyecto en etapa `propuesta`, cuando el tipo aún no está decidido.
- `area`/`eje` son **opcionales**, pero van juntos (si se da uno se debe dar el
  otro) y, como en las ideas, deben existir literalmente en `config.json`.
- En el perfil del docente se muestran por defecto solo los últimos 2
  finalizados (por `fechaFin` desc.) y los últimos 2 activos (por
  `fechaPropuesta` desc.). Si hay más, un botón "Ver todos los proyectos" abre
  un modal aparte (con su propio botón "Volver al perfil" y su X de cerrar)
  que lista TODOS los proyectos del docente, agrupados por estado con el
  mismo orden. Un estado sin proyectos se indica con un texto discreto en
  vez de ocultar la sección.

### Disponibilidad del docente (derivada, no se guarda)

No vive en ningún JSON: `data-service.js` la calcula al vuelo cada vez que
se piden docentes (`obtenerDocentes`), a partir del `rol` del docente y de
sus proyectos NO finalizados (estado `propuesta` o `proyecto`). Cada docente
sale de `obtenerDocentes`/`obtenerDocentePorId` con dos campos calculados:

- `proyectosActivos`: cuántos de sus proyectos están en `propuesta` o `proyecto`.
- `disponible`: `true`/`false`, según esta regla por `rol`:
  - **Director**: SIEMPRE `false` (no disponible), sin importar el conteo —
    el motivo es estructural (dedicación a la coordinación del programa), no
    de cupo.
  - **Profesor**: `false` (no disponible) con **5 o más** `proyectosActivos`.
  - **Asistente**: `false` (no disponible) con **4 o más** `proyectosActivos`
    (umbral más bajo que Profesor por su menor dedicación al programa).

En el directorio, los docentes disponibles se listan primero y los no
disponibles después; dentro de cada grupo se conserva el orden original (por
`id`). Las tarjetas no disponibles siguen siendo completamente clickeables —
la disponibilidad es solo informativa, nunca deshabilita el perfil.

### Idea externa (data/ideas-externas.json — array de objetos)

```json
{
  "id": "idea-ext-01",
  "titulo": "Necesidad detectada",
  "descripcion": "...",
  "area": "Tecnologías de la Información y Educación en Computación",
  "eje": "IoT (Internet de las Cosas)",
  "ejesSecundarios": [],
  "objetivos": [],
  "fuente": "Programa / Universidad / Entidad X",
  "contactoReferencia": "quién puede dar más info"
}
```

### Ideas tomadas (data/ideas-tomadas.json — objeto único)

Registra qué ideas de investigación ya fueron tomadas por un grupo de
estudiantes. Es una vista independiente que solo referencia ids — no vive
dentro de la idea ni la duplica (mismo principio de normalización que el
resto del esquema).

```json
{
  "descripcion": "Lista de IDs de ideas de investigación ya tomadas por un grupo.",
  "tomadas": ["idea-01-01", "idea-ext-01"]
}
```

- `tomadas`: array de ids de ideas ya tomadas. Pueden ser ideas de docentes
  (ej. `idea-01-01`, definidas dentro de `docentes.json`) o ideas externas
  (ej. `idea-ext-01`, definidas en `ideas-externas.json`).
- Para marcar una idea como tomada, agregar su id a `tomadas`; para
  liberarla, quitarlo de la lista.

### Notas de esquema

- `objetivos` es **opcional** por idea; si está vacío, no se muestra esa sección.
- `tipo` en proyectos: `investigacion` o `desarrollo` (las dos modalidades).
- **Distinción importante**: `areas` pertenece al DOCENTE — una lista de
  `{ area, ejes[] }`, ya que un docente puede pertenecer a varias áreas y, dentro
  de cada una, a varios ejes. `area` + `eje` (principal, obligatorio) +
  `ejesSecundarios` (opcional) pertenecen a la IDEA — de qué trata ese proyecto
  puntual. Son campos distintos: uno describe al docente, el otro a la idea.
- **Toda área y todo eje referenciado (por un docente o por una idea) debe
  existir literalmente en `config.json`**; data-service.js valida esto al
  cargar y descarta cualquier registro que referencie un área o eje inexistente,
  dejando constancia en consola.
- Las fotos NO van en el JSON: se asume la convención `/img/docentes/{id}.jpg`.
  Si falta una foto, mostrar avatar de iniciales como respaldo.

## Diseño de la interfaz

Tres vistas, mismo lenguaje visual (tarjetas + colores institucionales).

- **Directorio de docentes**: grid de tarjetas con foto + modal de detalle al hacer clic.
  Tarjeta: foto, nombre, títulos, áreas como etiquetas. Modal: perfil completo con
  áreas y ejes, proyectos dirigidos e ideas. Filtros encadenados **Área → Eje**
  (al elegir un área, el select de eje se repuebla con solo los ejes de esa área).
- **Perfil individual** (dentro del modal / vista): título, áreas/ejes, proyectos, ideas.
  Los proyectos se agrupan en Finalizados/Activos, mostrando solo los 2 más
  recientes de cada grupo; un botón "Ver todos los proyectos" abre un modal
  aparte con el listado completo, con su propio "Volver al perfil" y su X.
  El encabezado del modal (con la X de cerrar) queda fijo (`position: sticky`)
  al hacer scroll del contenido.
- **Base de ideas**: grid de tarjetas filtrable. Cada tarjeta: título, extracto de
  descripción, etiqueta de área, etiqueta de eje principal, y etiqueta de origen
  (docente concreto con enlace a su perfil, o entidad externa). Filtros: los mismos
  encadenados Área → Eje, por origen, más búsqueda por texto. La base combina ideas
  de docentes + externas.

### Colores institucionales (Universidad Mariana)

- Azul: `#1B3A6B`  ·  Teal: `#1A8A8F`  ·  Acento naranja: `#E8730C`
- Fondo claro de apoyo: `#EAF2F8`
- Gradiente azul→teal para héroes/encabezados, naranja para acentos/CTA.

## Taxonomía (línea → áreas → ejes)

Línea única: **Ingeniería, Informática y Computación**. Sus 4 áreas y ejes viven
en `data/config.json` (ver sección "Esquema de datos" arriba) — es el catálogo
único; no se duplica ni se hardcodea en el código.

- **Ingeniería de Software**: Ingeniería de Requisitos y Sistemas Sociotécnicos ·
  Diseño y Arquitectura de Software · Construcción y Evolución de Software ·
  Calidad del Software y Pruebas · Operaciones y DevOps · Medición, Métricas y
  Productividad en Software · Ingeniería de Software y Sistemas Inteligentes (IA)
- **Inteligencia Artificial y Ciencia de Datos**: Machine Learning (Aprendizaje
  automático) · Computer Vision (Visión por computadora) · Cognitive Computing
  (Sistemas cognitivos) · Data Science (Analítica de datos) · Knowledge Discovery
  (Descubrimiento de conocimiento)
- **Bioinformática y Modelamiento Computacional**: Modelamiento de sistemas
  biológicos · Aplicaciones biomédicas · Modelamiento físico y matemático
  (Física computacional)
- **Tecnologías de la Información y Educación en Computación**: Redes y
  telecomunicaciones · Ciberseguridad · IoT (Internet de las Cosas) · Seguridad
  de la información · TIC aplicadas a la educación · Gestión de sistemas de
  información

(Se ampliará al consultar con los demás profesores. Editar solo `config.json`
— el frontend y la validación se adaptan automáticamente.)

## Flujo de datos: Excel → JSON

- Fuente amigable de edición: `perfiles_docentes_datos.xlsx` con 5 hojas:
  `Catalogo`, `Docentes`, `Ideas docentes`, `Ideas externas`, `Proyectos`.
- En las columnas de lista dentro del Excel, los elementos se separan con ` | `.
- El conversor `tools/excel_to_json.py` lee el Excel y genera `data/docentes.json`,
  `data/ideas-externas.json` y `data/proyectos.json`. Las ideas de los docentes
  (hoja "Ideas docentes") se anidan dentro de su docente por `docenteId`; los
  proyectos (hoja "Proyectos") quedan planos en `proyectos.json`, también
  referenciando a su docente por `docenteId` — no se anidan, igual que en el JSON.
- Actualizar datos = editar el Excel, correr el conversor, hacer commit/push.
  El frontend no cambia. (Esta es la "etapa intermedia" hacia dinámico.)

## Ruta de migración a dinámico (referencia)

| Etapa | Datos | Qué cambia |
|-------|-------|-----------|
| Hoy | JSON estático en GitHub Pages | — |
| Intermedio | JSON generado desde Excel (o GitHub Action) | solo el build, no el frontend |
| Dinámico ligero | Sheets/Airtable/Supabase | solo `data-service.js` |
| Dinámico completo | API + BD + panel de edición | `data-service.js` + backend nuevo |

## Primeras tareas sugeridas

1. Crear el esqueleto de carpetas y las tres capas (`data-service.js`, `render.js`,
   `app.js`) con un `docentes.json` de ejemplo con 2 perfiles de prueba (con ideas
   y temáticas) y un `ideas-externas.json` de ejemplo.
2. Escribir `tools/excel_to_json.py`.
3. Construir la página: directorio (grid + modal), base de ideas (grid filtrable).
