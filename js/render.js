/**
 * render.js — capa de presentación.
 *
 * Recibe datos ya resueltos (objetos JS) y devuelve HTML. No hace peticiones
 * ni conoce el origen de los datos: eso es responsabilidad exclusiva de
 * data-service.js. app.js es quien conecta ambas capas.
 */

/** Evita inyección de HTML al interpolar texto proveniente de los datos. */
function escapeHTML(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function inicialesDeNombre(nombre) {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join('');
}

function renderAvatar(docente) {
  const rutaFoto = `img/docentes/${docente.id}.jpg`;
  return `
    <div class="avatar">
      <img
        src="${escapeHTML(rutaFoto)}"
        alt="Foto de ${escapeHTML(docente.nombre)}"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
      />
      <div class="avatar-iniciales" style="display:none">${escapeHTML(inicialesDeNombre(docente.nombre))}</div>
    </div>
  `;
}

function renderEtiquetas(valores, claseExtra = '') {
  return valores.map((valor) => `<span class="etiqueta ${claseExtra}">${escapeHTML(valor)}</span>`).join('');
}

function nombresDeAreas(areas) {
  return (areas ?? []).map((entrada) => entrada.area);
}

/** Correo del docente, discreto y seleccionable. No se muestra si no hay contacto registrado. */
function renderCorreo(contacto) {
  const correo = contacto?.trim();
  if (!correo) return '';
  return `
    <p class="correo-contacto">
      <span class="correo-icono" aria-hidden="true">✉</span>
      <span class="correo-texto">${escapeHTML(correo)}</span>
    </p>
  `;
}

/** Tarjeta resumida de un docente para el grid del directorio. */
export function renderTarjetaDocente(docente) {
  return `
    <article class="tarjeta tarjeta-docente" data-id="${escapeHTML(docente.id)}" tabindex="0" role="button"
      aria-label="Ver perfil de ${escapeHTML(docente.nombre)}">
      ${renderAvatar(docente)}
      <h3 class="tarjeta-titulo">${escapeHTML(docente.nombre)}</h3>
      <p class="tarjeta-subtitulo">${escapeHTML(docente.titulos?.[0] ?? '')}</p>
      ${renderCorreo(docente.contacto)}
      <div class="etiquetas">${renderEtiquetas(nombresDeAreas(docente.areas), 'etiqueta-area')}</div>
    </article>
  `;
}

/** Grid completo de tarjetas de docentes. */
export function renderGridDocentes(docentes) {
  if (docentes.length === 0) {
    return renderMensajeVacio('No hay docentes que coincidan con el filtro seleccionado.');
  }
  return docentes.map(renderTarjetaDocente).join('');
}

const NOMBRES_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const LIMITE_PROYECTOS_VISIBLES = 2;

/** Formatea "AAAA-MM" como "mmm. AAAA" (ej. "2024-03" → "mar. 2024"). */
function formatearFecha(aaaaMm) {
  if (!aaaaMm) return '';
  const [anio, mes] = aaaaMm.split('-');
  const nombreMes = NOMBRES_MES[Number(mes) - 1] ?? mes;
  return `${nombreMes}. ${anio}`;
}

function renderProyecto(proyecto) {
  const rango = proyecto.estado === 'finalizado'
    ? `${formatearFecha(proyecto.fechaInicio)} – ${formatearFecha(proyecto.fechaFin)}`
    : `Desde ${formatearFecha(proyecto.fechaInicio)}`;
  const etiquetaAreaEje = proyecto.area
    ? `<span class="etiqueta etiqueta-area">${escapeHTML(proyecto.area)}</span><span class="etiqueta etiqueta-eje">${escapeHTML(proyecto.eje)}</span>`
    : '';
  return `
    <li class="proyecto">
      <div>
        <span class="proyecto-titulo">${escapeHTML(proyecto.titulo)}</span>
        <span class="proyecto-meta">${escapeHTML(rango)} · ${escapeHTML(proyecto.tipo)}</span>
      </div>
      <div class="etiquetas">
        <span class="etiqueta etiqueta-estado-${escapeHTML(proyecto.estado)}">${proyecto.estado === 'activo' ? 'Activo' : 'Finalizado'}</span>
        ${etiquetaAreaEje}
      </div>
    </li>
  `;
}

/** Agrupa y ordena los proyectos de un docente: finalizados por fechaFin desc., activos por fechaInicio desc. */
function ordenarProyectos(proyectos) {
  const finalizados = proyectos
    .filter((p) => p.estado === 'finalizado')
    .sort((a, b) => b.fechaFin.localeCompare(a.fechaFin));
  const activos = proyectos
    .filter((p) => p.estado === 'activo')
    .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
  return { finalizados, activos };
}

function renderListaOMensaje(proyectos, mensajeVacio) {
  return proyectos.length > 0
    ? `<ul class="lista-proyectos">${proyectos.map(renderProyecto).join('')}</ul>`
    : `<p class="texto-atenuado">${escapeHTML(mensajeVacio)}</p>`;
}

/** Grupo con TODOS los proyectos de ese estado (para la vista "Ver todos los proyectos"). */
function renderGrupoProyectos(titulo, proyectos, mensajeVacio) {
  const contador = proyectos.length > 0 ? ` (${proyectos.length})` : '';
  return `
    <div class="proyectos-grupo">
      <h4>${escapeHTML(titulo)}${contador}</h4>
      ${renderListaOMensaje(proyectos, mensajeVacio)}
    </div>
  `;
}

/** Grupo recortado a `limite` (para el resumen dentro del perfil). El contador refleja el total real. */
function renderGrupoProyectosResumen(titulo, proyectos, mensajeVacio, limite) {
  const contador = proyectos.length > 0 ? ` (${proyectos.length})` : '';
  return `
    <div class="proyectos-grupo">
      <h4>${escapeHTML(titulo)}${contador}</h4>
      ${renderListaOMensaje(proyectos.slice(0, limite), mensajeVacio)}
    </div>
  `;
}

/** Resumen de proyectos para el perfil: 2 finalizados + 2 activos más recientes, con botón hacia la vista completa. */
function renderProyectosDocente(proyectos) {
  if (!proyectos || proyectos.length === 0) {
    return '<p class="texto-atenuado">Sin proyectos registrados.</p>';
  }

  const { finalizados, activos } = ordenarProyectos(proyectos);
  const hayMasProyectos = finalizados.length > LIMITE_PROYECTOS_VISIBLES || activos.length > LIMITE_PROYECTOS_VISIBLES;
  const botonVerTodos = hayMasProyectos
    ? '<button type="button" class="boton-ver-mas" data-accion="ver-todos-proyectos">Ver todos los proyectos</button>'
    : '';

  return `
    <div class="proyectos-docente">
      ${renderGrupoProyectosResumen('Finalizados', finalizados, 'Sin proyectos finalizados aún.', LIMITE_PROYECTOS_VISIBLES)}
      ${renderGrupoProyectosResumen('Activos', activos, 'Sin proyectos activos actualmente.', LIMITE_PROYECTOS_VISIBLES)}
      ${botonVerTodos}
    </div>
  `;
}

/** Vista aparte con TODOS los proyectos del docente, separados por estado. */
export function renderTodosLosProyectos(docente, proyectos) {
  const { finalizados, activos } = ordenarProyectos(proyectos ?? []);
  return `
    <div class="proyectos-docente-completo">
      <p class="migas-pan">Perfil <span aria-hidden="true">›</span> Todos los proyectos</p>
      <h2 class="proyectos-completo-titulo">Todos los proyectos de ${escapeHTML(docente.nombre)}</h2>
      ${renderGrupoProyectos('Finalizados', finalizados, 'Sin proyectos finalizados aún.')}
      ${renderGrupoProyectos('Activos', activos, 'Sin proyectos activos actualmente.')}
    </div>
  `;
}

function renderEtiquetasAreaEje(idea) {
  const secundarios = (idea.ejesSecundarios ?? [])
    .map((eje) => `<span class="etiqueta etiqueta-eje-secundario">${escapeHTML(eje)}</span>`)
    .join('');
  return `
    <span class="etiqueta etiqueta-area">${escapeHTML(idea.area)}</span>
    <span class="etiqueta etiqueta-eje">${escapeHTML(idea.eje)}</span>
    ${secundarios}
  `;
}

function renderIdeaDeDocente(idea) {
  const objetivos = idea.objetivos && idea.objetivos.length > 0
    ? `<ul class="idea-objetivos">${idea.objetivos.map((obj) => `<li>${escapeHTML(obj)}</li>`).join('')}</ul>`
    : '';
  return `
    <li class="idea">
      <h4>${escapeHTML(idea.titulo)}</h4>
      <div class="etiquetas">${renderEtiquetasAreaEje(idea)}</div>
      <p>${escapeHTML(idea.descripcion)}</p>
      ${objetivos}
    </li>
  `;
}

function renderAreaConEjes(entradaArea) {
  return `
    <div class="area-docente">
      <span class="etiqueta etiqueta-area">${escapeHTML(entradaArea.area)}</span>
      <div class="ejes-lista">${renderEtiquetas(entradaArea.ejes ?? [], 'etiqueta-eje')}</div>
    </div>
  `;
}

const ASUNTO_CONTACTO_POR_DEFECTO = 'Consulta sobre asesoría de proyecto de grado';

/** Botón "Escribir a [nombre]" con mailto:. Si el docente no tiene correo, se muestra desactivado en vez de abrir un correo vacío. */
function renderBotonContacto(docente) {
  const contacto = docente.contacto?.trim();
  const nombrePila = docente.nombre.split(' ')[0];

  if (!contacto) {
    return `<span class="boton boton-primario boton-deshabilitado" aria-disabled="true">Sin correo de contacto</span>`;
  }

  const asunto = encodeURIComponent(ASUNTO_CONTACTO_POR_DEFECTO);
  return `<a href="mailto:${escapeHTML(contacto)}?subject=${asunto}" class="boton boton-primario">Escribir a ${escapeHTML(nombrePila)}</a>`;
}

/** Contenido completo del modal de perfil de un docente. `proyectos` viene ya resuelto (join hecho por app.js). */
export function renderModalDocente(docente, proyectos = []) {
  const bloqueProyectos = renderProyectosDocente(proyectos);

  const ideas = docente.ideasInvestigacion?.length
    ? `<ul class="lista-ideas">${docente.ideasInvestigacion.map(renderIdeaDeDocente).join('')}</ul>`
    : '<p class="texto-atenuado">Sin ideas de investigación registradas.</p>';

  const areas = docente.areas?.length
    ? `<div class="lista-areas-docente">${docente.areas.map(renderAreaConEjes).join('')}</div>`
    : '<p class="texto-atenuado">Sin áreas registradas.</p>';

  return `
    <div class="modal-perfil">
      <header class="modal-perfil-header">
        ${renderAvatar(docente)}
        <div>
          <h2>${escapeHTML(docente.nombre)}</h2>
          <p class="tarjeta-subtitulo">${docente.titulos?.map(escapeHTML).join(' · ') ?? ''}</p>
          ${renderCorreo(docente.contacto)}
          <div class="etiquetas">${renderEtiquetas(nombresDeAreas(docente.areas), 'etiqueta-area')}</div>
        </div>
      </header>

      <section>
        <h3>Áreas y ejes temáticos</h3>
        ${areas}
      </section>

      <section>
        <h3>Proyectos dirigidos</h3>
        ${bloqueProyectos}
      </section>

      <section>
        <h3>Ideas de investigación</h3>
        ${ideas}
      </section>

      <footer class="modal-perfil-footer">
        ${renderBotonContacto(docente)}
      </footer>
    </div>
  `;
}

function renderEtiquetaOrigen(origen) {
  if (origen.tipo === 'docente') {
    return `<a href="?vista=directorio&docente=${encodeURIComponent(origen.id)}" class="etiqueta etiqueta-origen etiqueta-origen-docente">${escapeHTML(origen.nombre)}</a>`;
  }
  return `<span class="etiqueta etiqueta-origen etiqueta-origen-externa" title="${escapeHTML(origen.contactoReferencia ?? '')}">${escapeHTML(origen.fuente)}</span>`;
}

function truncar(texto, maxCaracteres = 160) {
  if (texto.length <= maxCaracteres) return texto;
  return `${texto.slice(0, maxCaracteres).trimEnd()}…`;
}

/** Tarjeta de una idea (de docente o externa) para la base de ideas. */
export function renderTarjetaIdea(idea) {
  return `
    <article class="tarjeta tarjeta-idea">
      <h3 class="tarjeta-titulo">${escapeHTML(idea.titulo)}</h3>
      <p class="tarjeta-extracto">${escapeHTML(truncar(idea.descripcion ?? ''))}</p>
      <div class="etiquetas">
        <span class="etiqueta etiqueta-area">${escapeHTML(idea.area)}</span>
        <span class="etiqueta etiqueta-eje">${escapeHTML(idea.eje)}</span>
        ${renderEtiquetaOrigen(idea.origen)}
      </div>
    </article>
  `;
}

/** Grid completo de tarjetas de la base de ideas. */
export function renderGridIdeas(ideas) {
  if (ideas.length === 0) {
    return renderMensajeVacio('No hay ideas que coincidan con los filtros seleccionados.');
  }
  return ideas.map(renderTarjetaIdea).join('');
}

/** Opciones de un <select> a partir de una lista de valores. */
export function renderOpcionesFiltro(valores, etiquetaTodos = 'Todas') {
  return [`<option value="">${escapeHTML(etiquetaTodos)}</option>`]
    .concat(valores.map((valor) => `<option value="${escapeHTML(valor)}">${escapeHTML(valor)}</option>`))
    .join('');
}

export function renderMensajeVacio(texto) {
  return `<p class="mensaje-vacio">${escapeHTML(texto)}</p>`;
}

export function renderError(texto) {
  return `<p class="mensaje-error">${escapeHTML(texto)}</p>`;
}
