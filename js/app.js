/**
 * app.js — orquestación.
 *
 * Pide datos a data-service.js, se los pasa a render.js y conecta el
 * resultado con el DOM. No conoce el origen de los datos ni construye HTML
 * a mano: eso vive en las otras dos capas.
 */

import * as datos from './data-service.js';
import * as vistas from './render.js';

const el = {
  navDirectorio: document.getElementById('nav-directorio'),
  navIdeas: document.getElementById('nav-ideas'),
  vistaDirectorio: document.getElementById('vista-directorio'),
  vistaIdeas: document.getElementById('vista-ideas'),
  gridDocentes: document.getElementById('grid-docentes'),
  gridIdeas: document.getElementById('grid-ideas'),
  filtroArea: document.getElementById('filtro-area'),
  filtroEje: document.getElementById('filtro-eje'),
  filtroAreaIdeas: document.getElementById('filtro-area-ideas'),
  filtroEjeIdeas: document.getElementById('filtro-eje-ideas'),
  filtroOrigen: document.getElementById('filtro-origen'),
  buscadorIdeas: document.getElementById('buscador-ideas'),
  filtroSinTomadas: document.getElementById('filtro-sin-tomadas'),
  modal: document.getElementById('modal'),
  modalContenido: document.getElementById('modal-contenido'),
  modalCerrar: document.getElementById('modal-cerrar'),
  modalProyectos: document.getElementById('modal-proyectos'),
  proyectosContenido: document.getElementById('proyectos-contenido'),
  proyectosCerrar: document.getElementById('proyectos-cerrar'),
  proyectosVolver: document.getElementById('proyectos-volver')
};

// Docente y proyectos del perfil actualmente abierto: la vista "Ver todos los
// proyectos" los reutiliza en vez de volver a pedirlos.
let docenteActual = null;
let proyectosActuales = [];

// ---------------------------------------------------------------------
// Estado en la URL
// ---------------------------------------------------------------------

function leerParametros() {
  return new URLSearchParams(window.location.search);
}

function actualizarURL(cambios, { reemplazar = false } = {}) {
  const params = leerParametros();
  Object.entries(cambios).forEach(([clave, valor]) => {
    if (valor === null || valor === undefined || valor === '') {
      params.delete(clave);
    } else {
      params.set(clave, valor);
    }
  });
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
  if (reemplazar) {
    window.history.replaceState({}, '', url);
  } else {
    window.history.pushState({}, '', url);
  }
}

// ---------------------------------------------------------------------
// Filtro encadenado Área → Eje (compartido entre las dos vistas)
// ---------------------------------------------------------------------

/**
 * Puebla el select de áreas (una sola vez) y recalcula las opciones del
 * select de ejes a partir del área elegida. Devuelve el eje realmente
 * vigente: si el área cambió y el eje ya no pertenece a ella, se descarta.
 */
function sincronizarFiltroAreaEje(selectArea, selectEje, areas, areaSeleccionada, ejeSeleccionado) {
  if (selectArea.dataset.poblado !== 'true') {
    selectArea.innerHTML = vistas.renderOpcionesFiltro(areas.map((area) => area.nombre), 'Todas las áreas');
    selectArea.dataset.poblado = 'true';
  }
  selectArea.value = areaSeleccionada;

  const areaActual = areas.find((area) => area.nombre === areaSeleccionada);
  const ejesDisponibles = areaActual ? areaActual.ejes : [];

  selectEje.innerHTML = vistas.renderOpcionesFiltro(ejesDisponibles, 'Todos los ejes');
  selectEje.disabled = !areaActual;

  const ejeVigente = ejesDisponibles.includes(ejeSeleccionado) ? ejeSeleccionado : '';
  selectEje.value = ejeVigente;

  return ejeVigente;
}

// ---------------------------------------------------------------------
// Vista: Directorio de docentes
// ---------------------------------------------------------------------

async function pintarDirectorio() {
  const params = leerParametros();
  const areaSeleccionada = params.get('area') ?? '';
  const ejeSeleccionadoURL = params.get('eje') ?? '';

  const [docentes, config] = await Promise.all([
    datos.obtenerDocentes(),
    datos.obtenerConfig()
  ]);

  const ejeSeleccionado = sincronizarFiltroAreaEje(
    el.filtroArea, el.filtroEje, config.areas ?? [], areaSeleccionada, ejeSeleccionadoURL
  );
  if (ejeSeleccionado !== ejeSeleccionadoURL) {
    actualizarURL({ eje: ejeSeleccionado || null }, { reemplazar: true });
  }

  const docentesFiltrados = docentes.filter((docente) => {
    if (!areaSeleccionada) return true;
    const entrada = docente.areas.find((a) => a.area === areaSeleccionada);
    if (!entrada) return false;
    if (ejeSeleccionado && !entrada.ejes.includes(ejeSeleccionado)) return false;
    return true;
  });

  // Disponibles primero; dentro de cada grupo se conserva el orden original
  // (por id) gracias a que Array.prototype.sort es estable.
  const docentesOrdenados = [...docentesFiltrados].sort((a, b) => {
    if (a.disponible === b.disponible) return 0;
    return a.disponible ? -1 : 1;
  });

  el.gridDocentes.innerHTML = vistas.renderGridDocentes(docentesOrdenados);

  const idDocente = params.get('docente');
  if (idDocente) {
    await abrirModalDocente(idDocente);
  } else {
    cerrarModal();
  }
}

async function abrirModalDocente(id) {
  const [docente, proyectos] = await Promise.all([
    datos.obtenerDocentePorId(id),
    datos.obtenerProyectosPorDocenteId(id)
  ]);
  docenteActual = docente ?? null;
  proyectosActuales = proyectos ?? [];

  if (!docente) {
    el.modalContenido.innerHTML = vistas.renderError('No se encontró el docente solicitado.');
  } else {
    el.modalContenido.innerHTML = vistas.renderModalDocente(docente, proyectos);
  }
  el.modal.classList.add('abierto');
  el.modal.setAttribute('aria-hidden', 'false');
}

function cerrarModal() {
  el.modal.classList.remove('abierto');
  el.modal.setAttribute('aria-hidden', 'true');
  cerrarModalProyectos();
}

function abrirModalProyectos() {
  if (!docenteActual) return;
  el.proyectosContenido.innerHTML = vistas.renderTodosLosProyectos(docenteActual, proyectosActuales);
  el.modalProyectos.classList.add('abierto');
  el.modalProyectos.setAttribute('aria-hidden', 'false');
}

function cerrarModalProyectos() {
  el.modalProyectos.classList.remove('abierto');
  el.modalProyectos.setAttribute('aria-hidden', 'true');
}

// ---------------------------------------------------------------------
// Vista: Base de ideas
// ---------------------------------------------------------------------

async function pintarBaseDeIdeas() {
  const params = leerParametros();
  const areaSeleccionada = params.get('area') ?? '';
  const ejeSeleccionadoURL = params.get('eje') ?? '';
  const origenSeleccionado = params.get('origen') ?? '';
  const textoBusqueda = (params.get('q') ?? '').trim().toLowerCase();
  const sinTomadas = params.get('sinTomadas') === '1';

  const [ideas, config] = await Promise.all([
    datos.obtenerBaseDeIdeas(),
    datos.obtenerConfig()
  ]);

  const ejeSeleccionado = sincronizarFiltroAreaEje(
    el.filtroAreaIdeas, el.filtroEjeIdeas, config.areas ?? [], areaSeleccionada, ejeSeleccionadoURL
  );
  if (ejeSeleccionado !== ejeSeleccionadoURL) {
    actualizarURL({ eje: ejeSeleccionado || null }, { reemplazar: true });
  }

  el.filtroOrigen.value = origenSeleccionado;
  el.buscadorIdeas.value = params.get('q') ?? '';
  el.filtroSinTomadas.checked = sinTomadas;

  const ideasFiltradas = ideas.filter((idea) => {
    if (sinTomadas && idea.tomada) return false;
    if (areaSeleccionada && idea.area !== areaSeleccionada) return false;
    if (ejeSeleccionado) {
      const coincideEje = idea.eje === ejeSeleccionado || (idea.ejesSecundarios ?? []).includes(ejeSeleccionado);
      if (!coincideEje) return false;
    }
    if (origenSeleccionado && idea.origen.tipo !== origenSeleccionado) return false;
    if (textoBusqueda) {
      const texto = `${idea.titulo} ${idea.descripcion}`.toLowerCase();
      if (!texto.includes(textoBusqueda)) return false;
    }
    return true;
  });

  el.gridIdeas.innerHTML = vistas.renderGridIdeas(ideasFiltradas);
}

// ---------------------------------------------------------------------
// Navegación entre vistas
// ---------------------------------------------------------------------

async function mostrarVista(nombreVista) {
  const esDirectorio = nombreVista !== 'ideas';

  el.vistaDirectorio.hidden = !esDirectorio;
  el.vistaIdeas.hidden = esDirectorio;
  el.navDirectorio.classList.toggle('activo', esDirectorio);
  el.navIdeas.classList.toggle('activo', !esDirectorio);
  el.navDirectorio.setAttribute('aria-selected', String(esDirectorio));
  el.navIdeas.setAttribute('aria-selected', String(!esDirectorio));

  if (esDirectorio) {
    await pintarDirectorio();
  } else {
    await pintarBaseDeIdeas();
  }
}

function vistaActualDesdeURL() {
  return leerParametros().get('vista') === 'ideas' ? 'ideas' : 'directorio';
}

// ---------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------

function conectarEventos() {
  el.navDirectorio.addEventListener('click', () => {
    actualizarURL({ vista: null, docente: null, area: null, eje: null });
    mostrarVista('directorio');
  });

  el.navIdeas.addEventListener('click', () => {
    actualizarURL({ vista: 'ideas', docente: null, area: null, eje: null });
    mostrarVista('ideas');
  });

  el.filtroArea.addEventListener('change', () => {
    actualizarURL({ area: el.filtroArea.value || null, eje: null }, { reemplazar: true });
    pintarDirectorio();
  });

  el.filtroEje.addEventListener('change', () => {
    actualizarURL({ eje: el.filtroEje.value || null }, { reemplazar: true });
    pintarDirectorio();
  });

  el.gridDocentes.addEventListener('click', (evento) => {
    if (evento.target.closest('.correo-contacto')) return;
    const tarjeta = evento.target.closest('.tarjeta-docente');
    if (!tarjeta) return;
    actualizarURL({ docente: tarjeta.dataset.id });
    abrirModalDocente(tarjeta.dataset.id);
  });

  el.gridDocentes.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Enter' && evento.key !== ' ') return;
    const tarjeta = evento.target.closest('.tarjeta-docente');
    if (!tarjeta) return;
    evento.preventDefault();
    actualizarURL({ docente: tarjeta.dataset.id });
    abrirModalDocente(tarjeta.dataset.id);
  });

  el.modalCerrar.addEventListener('click', () => {
    actualizarURL({ docente: null }, { reemplazar: true });
    cerrarModal();
  });

  el.modal.addEventListener('click', (evento) => {
    if (evento.target === el.modal) {
      actualizarURL({ docente: null }, { reemplazar: true });
      cerrarModal();
    }
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    if (el.modalProyectos.classList.contains('abierto')) {
      cerrarModalProyectos();
    } else if (el.modal.classList.contains('abierto')) {
      actualizarURL({ docente: null }, { reemplazar: true });
      cerrarModal();
    }
  });

  el.modalContenido.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-accion="ver-todos-proyectos"]');
    if (!boton) return;
    abrirModalProyectos();
  });

  el.proyectosCerrar.addEventListener('click', () => {
    actualizarURL({ docente: null }, { reemplazar: true });
    cerrarModal();
  });

  el.proyectosVolver.addEventListener('click', () => {
    cerrarModalProyectos();
  });

  el.modalProyectos.addEventListener('click', (evento) => {
    if (evento.target === el.modalProyectos) {
      cerrarModalProyectos();
    }
  });

  el.filtroAreaIdeas.addEventListener('change', () => {
    actualizarURL({ area: el.filtroAreaIdeas.value || null, eje: null }, { reemplazar: true });
    pintarBaseDeIdeas();
  });

  el.filtroEjeIdeas.addEventListener('change', () => {
    actualizarURL({ eje: el.filtroEjeIdeas.value || null }, { reemplazar: true });
    pintarBaseDeIdeas();
  });

  el.filtroOrigen.addEventListener('change', () => {
    actualizarURL({ origen: el.filtroOrigen.value || null }, { reemplazar: true });
    pintarBaseDeIdeas();
  });

  el.filtroSinTomadas.addEventListener('change', () => {
    actualizarURL({ sinTomadas: el.filtroSinTomadas.checked ? '1' : null }, { reemplazar: true });
    pintarBaseDeIdeas();
  });

  let temporizadorBusqueda = null;
  el.buscadorIdeas.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => {
      actualizarURL({ q: el.buscadorIdeas.value || null }, { reemplazar: true });
      pintarBaseDeIdeas();
    }, 250);
  });

  window.addEventListener('popstate', () => {
    mostrarVista(vistaActualDesdeURL());
  });
}

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------

async function iniciar() {
  try {
    conectarEventos();
    await mostrarVista(vistaActualDesdeURL());
  } catch (error) {
    console.error(error);
    el.gridDocentes.innerHTML = vistas.renderError('No se pudieron cargar los datos del directorio. Intenta recargar la página.');
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
