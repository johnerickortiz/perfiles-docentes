/**
 * data-service.js — capa de acceso a datos.
 *
 * ÚNICO módulo que conoce el origen de los datos (hoy: archivos JSON estáticos
 * en /data/). El resto de la aplicación llama solo a las funciones de este
 * archivo, nunca hace fetch directo. El día que se migre a una API dinámica,
 * solo el interior de estas funciones cambia.
 */

const RUTAS = {
  docentes: 'data/docentes.json',
  ideasExternas: 'data/ideas-externas.json',
  proyectos: 'data/proyectos.json',
  config: 'data/config.json'
};

const ESTADOS_PROYECTO = ['activo', 'finalizado'];
const TIPOS_PROYECTO = ['investigacion', 'desarrollo'];

// Caché en memoria para no repetir peticiones dentro de la misma sesión.
let cacheDocentes = null;
let cacheIdeasExternas = null;
let cacheProyectos = null;
let cacheConfig = null;
let cacheIndiceTaxonomia = null;

async function cargarJSON(ruta) {
  const respuesta = await fetch(ruta);
  if (!respuesta.ok) {
    throw new Error(`No se pudo cargar ${ruta}: ${respuesta.status} ${respuesta.statusText}`);
  }
  return respuesta.json();
}

/**
 * config.json es la única fuente de verdad de la taxonomía (línea → áreas → ejes).
 * Este índice (área → Set de sus ejes válidos) es lo que usa toda la validación
 * de docentes e ideas para rechazar áreas o ejes que no existan en el catálogo.
 */
async function obtenerIndiceTaxonomia() {
  if (!cacheIndiceTaxonomia) {
    const config = await obtenerConfig();
    cacheIndiceTaxonomia = new Map(
      (config.areas ?? []).map((area) => [area.nombre, new Set(area.ejes ?? [])])
    );
  }
  return cacheIndiceTaxonomia;
}

function validarAreasDeDocente(areas, indiceTaxonomia, contextoDocente) {
  if (!Array.isArray(areas) || areas.length === 0) {
    console.warn('Docente inválido: "areas" debe ser una lista no vacía.', contextoDocente);
    return false;
  }
  return areas.every((entrada) => {
    const ejesDelArea = entrada && indiceTaxonomia.get(entrada.area);
    if (!ejesDelArea) {
      console.warn(`Docente inválido: el área "${entrada?.area}" no existe en config.json.`, contextoDocente);
      return false;
    }
    if (!Array.isArray(entrada.ejes) || entrada.ejes.length === 0) {
      console.warn(`Docente inválido: el área "${entrada.area}" debe tener al menos un eje.`, contextoDocente);
      return false;
    }
    const ejesInvalidos = entrada.ejes.filter((eje) => !ejesDelArea.has(eje));
    if (ejesInvalidos.length > 0) {
      console.warn(`Docente inválido: ejes [${ejesInvalidos.join(', ')}] no pertenecen al área "${entrada.area}" en config.json.`, contextoDocente);
      return false;
    }
    return true;
  });
}

function validarDocente(docente, indiceTaxonomia) {
  const camposRequeridos = ['id', 'nombre', 'titulos', 'areas', 'contacto'];
  const faltantes = camposRequeridos.filter((campo) => !(campo in docente));
  if (faltantes.length > 0) {
    console.warn(`Docente inválido (faltan campos ${faltantes.join(', ')}):`, docente);
    return false;
  }
  return validarAreasDeDocente(docente.areas, indiceTaxonomia, docente);
}

/**
 * Válida tanto ideas de docentes como ideas externas: ambas comparten
 * `area` (obligatoria), `eje` principal (obligatorio) y `ejesSecundarios`
 * (opcional), y todos deben existir en config.json.
 */
function validarIdea(idea, indiceTaxonomia, camposExtra = []) {
  const camposRequeridos = ['id', 'titulo', 'descripcion', 'area', 'eje', ...camposExtra];
  const faltantes = camposRequeridos.filter((campo) => !(campo in idea));
  if (faltantes.length > 0) {
    console.warn(`Idea inválida (faltan campos ${faltantes.join(', ')}):`, idea);
    return false;
  }

  const ejesDelArea = indiceTaxonomia.get(idea.area);
  if (!ejesDelArea) {
    console.warn(`Idea inválida: el área "${idea.area}" no existe en config.json.`, idea);
    return false;
  }
  if (!ejesDelArea.has(idea.eje)) {
    console.warn(`Idea inválida: el eje "${idea.eje}" no pertenece al área "${idea.area}" en config.json.`, idea);
    return false;
  }

  const ejesSecundarios = idea.ejesSecundarios ?? [];
  const secundariosInvalidos = ejesSecundarios.filter((eje) => !ejesDelArea.has(eje));
  if (secundariosInvalidos.length > 0) {
    console.warn(`Idea inválida: ejesSecundarios [${secundariosInvalidos.join(', ')}] no pertenecen al área "${idea.area}" en config.json.`, idea);
    return false;
  }

  return true;
}

/**
 * Válida un proyecto dirigido. `area`/`eje` son opcionales, pero si se da uno
 * debe darse el otro y ambos deben existir en config.json (misma regla que
 * en las ideas). `fechaFin` es obligatoria solo cuando el proyecto ya finalizó.
 */
function validarProyecto(proyecto, indiceTaxonomia) {
  const camposRequeridos = ['id', 'docenteId', 'titulo', 'estado', 'fechaInicio', 'tipo'];
  const faltantes = camposRequeridos.filter((campo) => !(campo in proyecto));
  if (faltantes.length > 0) {
    console.warn(`Proyecto inválido (faltan campos ${faltantes.join(', ')}):`, proyecto);
    return false;
  }
  if (!ESTADOS_PROYECTO.includes(proyecto.estado)) {
    console.warn(`Proyecto inválido: estado "${proyecto.estado}" debe ser uno de [${ESTADOS_PROYECTO.join(', ')}].`, proyecto);
    return false;
  }
  if (!TIPOS_PROYECTO.includes(proyecto.tipo)) {
    console.warn(`Proyecto inválido: tipo "${proyecto.tipo}" debe ser uno de [${TIPOS_PROYECTO.join(', ')}].`, proyecto);
    return false;
  }
  if (proyecto.estado === 'finalizado' && !proyecto.fechaFin) {
    console.warn('Proyecto inválido: un proyecto finalizado debe tener "fechaFin".', proyecto);
    return false;
  }

  const tieneArea = proyecto.area !== undefined;
  const tieneEje = proyecto.eje !== undefined;
  if (tieneArea !== tieneEje) {
    console.warn('Proyecto inválido: "area" y "eje" deben darse juntos o no darse.', proyecto);
    return false;
  }
  if (tieneArea) {
    const ejesDelArea = indiceTaxonomia.get(proyecto.area);
    if (!ejesDelArea) {
      console.warn(`Proyecto inválido: el área "${proyecto.area}" no existe en config.json.`, proyecto);
      return false;
    }
    if (!ejesDelArea.has(proyecto.eje)) {
      console.warn(`Proyecto inválido: el eje "${proyecto.eje}" no pertenece al área "${proyecto.area}" en config.json.`, proyecto);
      return false;
    }
  }

  return true;
}

/** Devuelve todos los docentes, ya validados contra la taxonomía de config.json. */
export async function obtenerDocentes() {
  if (!cacheDocentes) {
    const [datos, indiceTaxonomia] = await Promise.all([
      cargarJSON(RUTAS.docentes),
      obtenerIndiceTaxonomia()
    ]);
    cacheDocentes = datos
      .filter((docente) => validarDocente(docente, indiceTaxonomia))
      .map((docente) => ({
        ...docente,
        ideasInvestigacion: (docente.ideasInvestigacion ?? []).filter((idea) => validarIdea(idea, indiceTaxonomia))
      }));
  }
  return cacheDocentes;
}

/** Devuelve un docente por su id, o undefined si no existe. */
export async function obtenerDocentePorId(id) {
  const docentes = await obtenerDocentes();
  return docentes.find((docente) => docente.id === id);
}

/** Devuelve las ideas externas (no asociadas a un docente), ya validadas. */
export async function obtenerIdeasExternas() {
  if (!cacheIdeasExternas) {
    const [datos, indiceTaxonomia] = await Promise.all([
      cargarJSON(RUTAS.ideasExternas),
      obtenerIndiceTaxonomia()
    ]);
    cacheIdeasExternas = datos.filter((idea) => validarIdea(idea, indiceTaxonomia, ['fuente']));
  }
  return cacheIdeasExternas;
}

/** Devuelve todos los proyectos dirigidos, ya validados. */
export async function obtenerProyectos() {
  if (!cacheProyectos) {
    const [datos, indiceTaxonomia] = await Promise.all([
      cargarJSON(RUTAS.proyectos),
      obtenerIndiceTaxonomia()
    ]);
    cacheProyectos = datos.filter((proyecto) => validarProyecto(proyecto, indiceTaxonomia));
  }
  return cacheProyectos;
}

/** Devuelve los proyectos dirigidos por un docente concreto. */
export async function obtenerProyectosPorDocenteId(docenteId) {
  const proyectos = await obtenerProyectos();
  return proyectos.filter((proyecto) => proyecto.docenteId === docenteId);
}

/** Devuelve la configuración global: la línea única y su árbol de áreas → ejes. */
export async function obtenerConfig() {
  if (!cacheConfig) {
    cacheConfig = await cargarJSON(RUTAS.config);
  }
  return cacheConfig;
}

/**
 * Vista derivada: base de ideas consolidada (ideas de docentes + ideas
 * externas). No se almacena en ningún archivo; se calcula aquí recorriendo
 * las fuentes normalizadas, como un JOIN.
 *
 * Cada idea se devuelve con un campo `origen` uniforme:
 *   { tipo: 'docente', id: 'docente-01', nombre: '...' }
 *   { tipo: 'externa', fuente: '...', contactoReferencia: '...' }
 */
export async function obtenerBaseDeIdeas() {
  const [docentes, ideasExternas] = await Promise.all([
    obtenerDocentes(),
    obtenerIdeasExternas()
  ]);

  const ideasDeDocentes = docentes.flatMap((docente) =>
    (docente.ideasInvestigacion || []).map((idea) => ({
      ...idea,
      origen: {
        tipo: 'docente',
        id: docente.id,
        nombre: docente.nombre
      }
    }))
  );

  const ideasDeExternas = ideasExternas.map((idea) => ({
    ...idea,
    origen: {
      tipo: 'externa',
      fuente: idea.fuente,
      contactoReferencia: idea.contactoReferencia
    }
  }));

  return [...ideasDeDocentes, ...ideasDeExternas];
}
