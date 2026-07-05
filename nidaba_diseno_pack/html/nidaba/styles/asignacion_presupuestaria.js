import { executeSQL } from "./sql.js";
import { sqlInteger, sqlJson, sqlNullable, sqlText } from "./sqlText.js";
import {
  clearSession as clearStoredSession,
  loadSession,
  refreshStoredSession,
  saveSession,
} from "./auth.js";

const ASSIGNMENT_TYPE_CODE = "ASIGNACION_PRESUPUESTARIA";

let currentSession = null;
let bootstrapData = null;
let currentListView = "grabados";
let currentDocumentState = "grabado";

function toAmountNumber(value) {
  const normalized = String(value ?? "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.\-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatAmountInputValue(value) {
  const amount = Number(value || 0);
  if (!amount) return "";
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function setTopbarMessage(text) {
  const node = document.getElementById("topbar-status");
  if (node) node.textContent = text || "Sin novedades.";
}

function showMessage(targetId, text, type = "ok") {
  const node = document.getElementById(targetId);
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("error", type === "error");
  node.style.display = "block";
}

function clearMessage(targetId) {
  const node = document.getElementById(targetId);
  if (!node) return;
  node.textContent = "";
  node.classList.remove("error");
  node.style.display = "none";
}

function clearSession() {
  currentSession = null;
  clearStoredSession();
}

function requestId(label) {
  return `nidaba-${label}-${Date.now()}`;
}

function sqlSchemaName(schemaName) {
  const normalized = String(schemaName || "").trim().toLowerCase();
  if (!/^[a-z]{3}[0-9]{3}$/.test(normalized)) {
    throw new Error("El esquema activo no es válido para operación contextual.");
  }
  return `"${normalized}"`;
}

function parseSqlJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeSqlDate(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text;
}

function getCurrentOwner() {
  return currentSession?.session?.activeContext?.schema_name || "";
}

function getCurrentUsername() {
  return currentSession?.session?.user?.username || "";
}

function getCurrentReparticionName() {
  return currentSession?.session?.activeContext?.nombre_visible || "";
}

function buildDocumentListSql(owner) {
  const schema = sqlSchemaName(owner);
  return `
    with
    lista as (
      select
        d.fin_documento_id,
        d.numero_documento,
        d.fecha_documento,
        d.glosa,
        case when d.estado = 'cerrado' then 'cerrado' else 'grabado' end as estado,
        d.origen_externo as modo_operacion,
        p.codigo as periodo_codigo,
        p.nombre as periodo_nombre,
        d.reparticion_codigo,
        coalesce(sum(det.debe), 0)::numeric(18,2) as total_usos,
        coalesce(sum(det.haber), 0)::numeric(18,2) as total_fuentes
      from ${schema}.fin_documentos d
      join ${schema}.fin_tipos_documento td
        on td.fin_tipo_documento_id = d.fin_tipo_documento_id
      join ${schema}.fin_periodos p
        on p.fin_periodo_id = d.fin_periodo_id
      left join ${schema}.fin_documento_detalles det
        on det.fin_documento_id = d.fin_documento_id
       and det.estado = 'vigente'
      where td.codigo = ${sqlText(ASSIGNMENT_TYPE_CODE)}
        and d.estado in ('confirmado', 'cerrado')
      group by
        d.fin_documento_id,
        d.numero_documento,
        d.fecha_documento,
        d.glosa,
        d.estado,
        d.origen_externo,
        p.codigo,
        p.nombre,
        d.reparticion_codigo
    )
    select
      coalesce(
        (
          select json_agg(row_to_json(g) order by g.fecha_documento desc, g.fin_documento_id desc)
          from lista g
          where g.estado = 'grabado'
        ),
        '[]'::json
      ) as grabados,
      coalesce(
        (
          select json_agg(row_to_json(c) order by c.fecha_documento desc, c.fin_documento_id desc)
          from lista c
          where c.estado = 'cerrado'
        ),
        '[]'::json
      ) as cerrados
  `;
}

function buildBootstrapSql(owner) {
  const schema = sqlSchemaName(owner);
  return `
    with
    contexto as (
      select codigo, nombre, servicio_id
      from ${schema}.reparticiones_internas
      order by codigo
      limit 1
    ),
    periodos as (
      select fin_periodo_id, codigo, nombre, fecha_inicio, fecha_termino, orden
      from ${schema}.fin_periodos
      where activa
        and estado = 'abierto'
    ),
    cuentas as (
      select codigo, nombre, tipo_cuenta, naturaleza
      from ${schema}.fin_cuentas
      where activa
        and es_imputable
        and tipo_cuenta = 'resultado'
        and substr(codigo, 1, 1) in ('3', '4')
    ),
    lista_documentos as (
      select
        d.fin_documento_id,
        d.numero_documento,
        d.fecha_documento,
        d.glosa,
        case when d.estado = 'cerrado' then 'cerrado' else 'grabado' end as estado,
        d.origen_externo as modo_operacion,
        p.codigo as periodo_codigo,
        p.nombre as periodo_nombre,
        d.reparticion_codigo,
        coalesce(sum(det.debe), 0)::numeric(18,2) as total_usos,
        coalesce(sum(det.haber), 0)::numeric(18,2) as total_fuentes
      from ${schema}.fin_documentos d
      join ${schema}.fin_tipos_documento td
        on td.fin_tipo_documento_id = d.fin_tipo_documento_id
      join ${schema}.fin_periodos p
        on p.fin_periodo_id = d.fin_periodo_id
      left join ${schema}.fin_documento_detalles det
        on det.fin_documento_id = d.fin_documento_id
       and det.estado = 'vigente'
      where td.codigo = ${sqlText(ASSIGNMENT_TYPE_CODE)}
        and d.estado in ('confirmado', 'cerrado')
      group by
        d.fin_documento_id,
        d.numero_documento,
        d.fecha_documento,
        d.glosa,
        d.estado,
        d.origen_externo,
        p.codigo,
        p.nombre,
        d.reparticion_codigo
    )
    select
      (select row_to_json(ctx) from contexto ctx) as reparticion,
      coalesce(
        (
          select json_agg(row_to_json(p) order by p.orden, p.codigo)
          from periodos p
        ),
        '[]'::json
      ) as periods,
      json_build_object(
        'usos',
        coalesce(
          (
            select json_agg(row_to_json(c) order by c.codigo, c.nombre)
            from cuentas c
            where substr(c.codigo, 1, 1) = '4'
          ),
          '[]'::json
        ),
        'fuentes',
        coalesce(
          (
            select json_agg(row_to_json(c) order by c.codigo, c.nombre)
            from cuentas c
            where substr(c.codigo, 1, 1) = '3'
          ),
          '[]'::json
        )
      ) as accounts,
      coalesce(
        (
          select json_agg(row_to_json(g) order by g.fecha_documento desc, g.fin_documento_id desc)
          from lista_documentos g
          where g.estado = 'grabado'
        ),
        '[]'::json
      ) as grabados,
      coalesce(
        (
          select json_agg(row_to_json(c) order by c.fecha_documento desc, c.fin_documento_id desc)
          from lista_documentos c
          where c.estado = 'cerrado'
        ),
        '[]'::json
      ) as cerrados
  `;
}

function buildDocumentSql(owner, documentId) {
  const schema = sqlSchemaName(owner);
  return `
    with
    documento as (
      select
        d.fin_documento_id,
        d.numero_documento,
        d.fecha_documento,
        d.glosa,
        case when d.estado = 'cerrado' then 'cerrado' else 'grabado' end as estado,
        d.origen_externo as modo_operacion,
        d.fin_periodo_id,
        p.codigo as periodo_codigo,
        p.nombre as periodo_nombre,
        d.reparticion_codigo
      from ${schema}.fin_documentos d
      join ${schema}.fin_tipos_documento td
        on td.fin_tipo_documento_id = d.fin_tipo_documento_id
      join ${schema}.fin_periodos p
        on p.fin_periodo_id = d.fin_periodo_id
      where d.fin_documento_id = ${sqlInteger(documentId, "0")}
        and td.codigo = ${sqlText(ASSIGNMENT_TYPE_CODE)}
      limit 1
    )
    select
      d.*,
      coalesce(
        (
          select json_agg(
            json_build_object(
              'fin_documento_detalle_id', det.fin_documento_detalle_id,
              'numero_linea', det.numero_linea,
              'cuenta_codigo', c.codigo,
              'debe', det.debe,
              'haber', det.haber,
              'glosa', det.glosa,
              'cuenta_nombre', c.nombre,
              'circuito', case when det.debe > 0 then 'USOS' else 'FUENTES' end
            )
            order by det.numero_linea
          )
          from ${schema}.fin_documento_detalles det
          join ${schema}.fin_cuentas c
            on c.codigo = det.cuenta_codigo
          where det.fin_documento_id = d.fin_documento_id
            and det.estado = 'vigente'
        ),
        '[]'::json
      ) as detalles
    from documento d
  `;
}

function buildSaveDocumentSql(owner, payload) {
  const schema = sqlSchemaName(owner);
  const documentId = sqlInteger(payload.fin_documento_id, "null");
  const finPeriodoId = sqlInteger(payload.fin_periodo_id, "0");
  const numeroDocumento = sqlText(payload.numero_documento);
  const fechaDocumento = sqlText(payload.fecha_documento);
  const glosa = sqlNullable(payload.glosa);
  const totalDocumento = String(
    payload.detalles
      .filter((detail) => detail.circuito === "USOS")
      .reduce((sum, detail) => sum + Number(detail.debe || 0), 0)
      .toFixed(2)
  );
  const modoOperacion = sqlText(payload.modo_operacion);
  const detallesJson = sqlJson(payload.detalles);

  return `
    begin;

    drop table if exists pg_temp.nidaba_save_result;

    create temporary table nidaba_save_result (
      code text,
      message text,
      fin_documento_id bigint
    ) on commit drop;

    with
    contexto as (
      select codigo
      from ${schema}.reparticiones_internas
      order by codigo
      limit 1
    ),
    entrada as (
      select
        ${documentId}::bigint as fin_documento_id,
        ${finPeriodoId}::bigint as fin_periodo_id,
        ${numeroDocumento}::varchar as numero_documento,
        ${fechaDocumento}::date as fecha_documento,
        ${glosa}::text as glosa,
        ${modoOperacion}::varchar as modo_operacion,
        ${totalDocumento}::numeric(18,2) as total_documento
    ),
    existente as (
      select fin_documento_id, estado, numero_documento
      from ${schema}.fin_documentos
      where fin_documento_id = (select fin_documento_id from entrada)
    ),
    numero_generado as (
      with base as (
        select d.numero_documento
        from ${schema}.fin_documentos d
        join ${schema}.fin_tipos_documento t
          on t.fin_tipo_documento_id = d.fin_tipo_documento_id
        cross join entrada e
        where t.codigo = ${sqlText(ASSIGNMENT_TYPE_CODE)}
          and d.numero_documento like (
            case
              when e.modo_operacion = 'MODIFICACION_GLOBAL' then 'MG'
              else 'AP'
            end || '-' || extract(year from e.fecha_documento)::int::text || '-%'
          )
      )
      select
        (
          case
            when e.modo_operacion = 'MODIFICACION_GLOBAL' then 'MG'
            else 'AP'
          end
        ) || '-' || extract(year from e.fecha_documento)::int::text || '-' ||
        lpad((coalesce(max(split_part(base.numero_documento, '-', 3)::int), 0) + 1)::text, 4, '0') as numero_documento
      from entrada e
      left join base on true
      group by e.modo_operacion, e.fecha_documento
    ),
    numero_resuelto as (
      select
        coalesce(
          nullif((select numero_documento from entrada), ''),
          nullif((select numero_documento from existente limit 1), ''),
          (select numero_documento from numero_generado)
        ) as numero_documento
    ),
    estado_operacion as (
      select
        case
          when not exists (select 1 from contexto) then 'NO_CONTEXT'
          when (select fin_documento_id from entrada) is not null
            and not exists (select 1 from existente) then 'NOT_FOUND'
          when exists (select 1 from existente where estado = 'cerrado') then 'CLOSED'
          else 'OK'
        end as code
    ),
    actualizados as (
      update ${schema}.fin_documentos d
         set fin_periodo_id = e.fin_periodo_id,
             reparticion_codigo = c.codigo,
             numero_documento = nr.numero_documento,
             fecha_documento = e.fecha_documento,
             glosa = e.glosa,
             total_documento = e.total_documento,
             estado = 'confirmado',
             tipo_operacion = 'presupuesto',
             origen_externo = e.modo_operacion,
             updated_at = now()
        from entrada e
        cross join contexto c
        cross join numero_resuelto nr
        cross join estado_operacion op
       where op.code = 'OK'
         and e.fin_documento_id is not null
         and d.fin_documento_id = e.fin_documento_id
      returning d.fin_documento_id
    ),
    insertados as (
      insert into ${schema}.fin_documentos (
        fin_periodo_id,
        fin_tipo_documento_id,
        reparticion_codigo,
        numero_documento,
        fecha_documento,
        glosa,
        total_documento,
        estado,
        tipo_operacion,
        origen_externo
      )
      select
        e.fin_periodo_id,
        td.fin_tipo_documento_id,
        c.codigo,
        nr.numero_documento,
        e.fecha_documento,
        e.glosa,
        e.total_documento,
        'confirmado',
        'presupuesto',
        e.modo_operacion
      from entrada e
      cross join contexto c
      cross join numero_resuelto nr
      cross join (
        select fin_tipo_documento_id
        from ${schema}.fin_tipos_documento
        where codigo = ${sqlText(ASSIGNMENT_TYPE_CODE)}
        limit 1
      ) td
      cross join estado_operacion op
      where op.code = 'OK'
        and e.fin_documento_id is null
      returning fin_documento_id
    ),
    documento_guardado as (
      select fin_documento_id from actualizados
      union all
      select fin_documento_id from insertados
    )
    insert into nidaba_save_result (code, message, fin_documento_id)
    select
      op.code,
      case op.code
        when 'NO_CONTEXT' then 'El contexto activo no tiene repartición interna asociada.'
        when 'NOT_FOUND' then 'No existe el documento que intenta modificar.'
        when 'CLOSED' then 'El documento ya está cerrado y no puede modificarse.'
        else 'Documento grabado correctamente.'
      end as message,
      coalesce((select fin_documento_id from documento_guardado limit 1), 0) as fin_documento_id
    from estado_operacion op;

    delete from ${schema}.fin_documento_detalles
    where fin_documento_id = (
      select fin_documento_id
      from nidaba_save_result
      where code = 'OK'
      limit 1
    );

    insert into ${schema}.fin_documento_detalles (
      fin_documento_id,
      numero_linea,
      cuenta_codigo,
      reparticion_codigo,
      glosa,
      debe,
      haber,
      estado
    )
    select
      r.fin_documento_id,
      de.numero_linea,
      de.cuenta_codigo,
      c.codigo,
      de.glosa,
      de.debe,
      de.haber,
      'vigente'
    from nidaba_save_result r
    cross join (
      select codigo
      from ${schema}.reparticiones_internas
      order by codigo
      limit 1
    ) c
    cross join (
      select
        ord::int as numero_linea,
        nullif(btrim(coalesce(item->>'cuenta_codigo', '')), '') as cuenta_codigo,
        nullif(btrim(coalesce(item->>'glosa', '')), '') as glosa,
        coalesce((item->>'debe')::numeric, 0)::numeric(18,2) as debe,
        coalesce((item->>'haber')::numeric, 0)::numeric(18,2) as haber
      from jsonb_array_elements(${detallesJson}) with ordinality as t(item, ord)
    ) de
    where r.code = 'OK';

    select code, message, fin_documento_id
    from nidaba_save_result;

    commit;
  `;
}

function buildCloseDocumentSql(documentId, username) {
  const schema = sqlSchemaName(getCurrentOwner());
  return `
    select *
    from ${schema}.fn_cerrar_asignacion_presupuestaria(
      ${sqlInteger(documentId, "0")}::bigint,
      ${sqlText(username)}::varchar
    )
  `;
}

async function fetchAssignmentLists(owner) {
  const result = await executeSQL(
    buildDocumentListSql(owner),
    requestId("asignacion-list"),
    "nidaba-asignacion-list"
  );
  const row = result.rows?.[0] || {};
  return {
    grabados: parseSqlJson(row.grabados, []),
    cerrados: parseSqlJson(row.cerrados, []),
  };
}

async function fetchAssignmentBootstrap(owner) {
  const result = await executeSQL(
    buildBootstrapSql(owner),
    requestId("asignacion-bootstrap"),
    "nidaba-asignacion-bootstrap"
  );
  const row = result.rows?.[0];
  if (!row) {
    throw new Error("No fue posible cargar el contexto financiero.");
  }
  return {
    reparticion: parseSqlJson(row.reparticion, null),
    periods: parseSqlJson(row.periods, []),
    accounts: parseSqlJson(row.accounts, { usos: [], fuentes: [] }),
    lists: {
      grabados: parseSqlJson(row.grabados, []).map((item) => ({
        ...item,
        fecha_documento: normalizeSqlDate(item.fecha_documento),
      })),
      cerrados: parseSqlJson(row.cerrados, []).map((item) => ({
        ...item,
        fecha_documento: normalizeSqlDate(item.fecha_documento),
      })),
    },
  };
}

async function fetchAssignmentDocument(owner, documentId) {
  const result = await executeSQL(
    buildDocumentSql(owner, documentId),
    requestId("asignacion-documento"),
    "nidaba-asignacion-documento"
  );
  const row = result.rows?.[0];
  if (!row) {
    throw new Error("No existe el documento solicitado en el contexto activo.");
  }
  return {
    ...row,
    fecha_documento: normalizeSqlDate(row.fecha_documento),
    detalles: parseSqlJson(row.detalles, []),
  };
}

async function saveAssignmentDocument(owner, payload) {
  const result = await executeSQL(
    buildSaveDocumentSql(owner, payload),
    requestId("asignacion-save"),
    "nidaba-asignacion-save"
  );
  const row = result.rows?.[0];
  if (!row) {
    throw new Error("No fue posible grabar el documento.");
  }
  if (row.code !== "OK") {
    throw new Error(row.message || "No fue posible grabar el documento.");
  }
  return {
    message: row.message,
    fin_documento_id: Number(row.fin_documento_id || 0),
  };
}

async function closeAssignmentDocument(documentId, username) {
  const result = await executeSQL(
    buildCloseDocumentSql(documentId, username),
    requestId("asignacion-close"),
    "nidaba-asignacion-close"
  );
  const row = result.rows?.[0];
  if (!row) {
    throw new Error("No fue posible cerrar el documento.");
  }
  return row;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "";
  const normalized = normalizeSqlDate(value);
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL").format(date);
}

function renderTopbar() {
  const userNode = document.getElementById("topbar-user");
  const contextNode = document.getElementById("topbar-context");
  if (!userNode || !contextNode) return;

  if (!currentSession?.session) {
    userNode.textContent = "Sin sesión";
    contextNode.textContent = "Sin contexto";
    return;
  }

  userNode.textContent = currentSession.session.user.username;
  contextNode.textContent = currentSession.session.activeContext?.nombre_visible || "Pendiente";
}

function setEditingDisabled(disabled) {
  document.querySelectorAll("[data-editable='true']").forEach((node) => {
    node.disabled = disabled;
  });
}

function renderSession() {
  const meta = document.getElementById("auth-session-meta");
  const title = document.getElementById("auth-session-title");
  const ownerInput = document.getElementById("document-owner");
  const logoImage = document.getElementById("logia-logo-image");

  if (!currentSession?.session) {
    meta.innerHTML = `<div><dt>Estado</dt><dd>Sin sesión</dd></div>`;
    title.textContent = "Sesión requerida";
    ownerInput.value = "Sin contexto";
    logoImage.src = "./styles/nidaba-mark.svg";
    logoImage.alt = "Logo del servicio";
    setEditingDisabled(true);
    renderTopbar();
    return;
  }

  const { user, activeContext } = currentSession.session;
  title.textContent = user.nombre_completo || user.username;
  ownerInput.value = activeContext?.schema_name || "Sin contexto";
  logoImage.src = activeContext?.logo_image || "./styles/nidaba-mark.svg";
  logoImage.alt = activeContext?.nombre_visible ? `Logo de ${activeContext.nombre_visible}` : "Logo del servicio";

  meta.innerHTML = `
    <div><dt>Usuario</dt><dd>${user.username}</dd></div>
    <div><dt>RUT</dt><dd>${user.persona_rut}</dd></div>
    <div><dt>Servicio</dt><dd>${activeContext?.nombre_visible || "Sin contexto"}</dd></div>
    <div><dt>Esquema</dt><dd>${activeContext?.schema_name || "Sin contexto"}</dd></div>
  `;

  setEditingDisabled(currentDocumentState === "cerrado");
  renderTopbar();
}

function renderPeriods() {
  const select = document.getElementById("document-period");
  const periods = bootstrapData?.periods || [];
  select.innerHTML = periods
    .map((period, index) => `<option value="${period.fin_periodo_id}" ${index === 0 ? "selected" : ""}>${period.codigo} · ${period.nombre}</option>`)
    .join("");
}

function findSelectedPeriod() {
  const periodId = Number(document.getElementById("document-period").value || 0);
  return (bootstrapData?.periods || []).find((period) => Number(period.fin_periodo_id) === periodId) || null;
}

function isDateWithinSelectedPeriod(dateValue) {
  const period = findSelectedPeriod();
  if (!period || !dateValue) return false;
  return dateValue >= period.fecha_inicio && dateValue <= period.fecha_termino;
}

async function suggestNextDocumentNumber(owner, mode = null) {
  const schema = sqlSchemaName(owner);
  const year = Number((document.getElementById("document-date").value || new Date().toISOString().slice(0, 10)).slice(0, 4));
  const prefix = mode === "MODIFICACION_GLOBAL" ? "MG" : "AP";
  const sql = `
    with base as (
      select numero_documento
      from ${schema}.fin_documentos d
      join ${schema}.fin_tipos_documento t
        on t.fin_tipo_documento_id = d.fin_tipo_documento_id
      where t.codigo = ${sqlText(ASSIGNMENT_TYPE_CODE)}
        and d.numero_documento like ${sqlText(`${prefix}-${year}-%`)}
    )
    select
      ${sqlText(prefix)} || '-' || ${year}::text || '-' ||
      lpad((coalesce(max(split_part(numero_documento, '-', 3)::int), 0) + 1)::text, 4, '0') as numero
    from base
  `;
  const result = await executeSQL(sql, requestId("asignacion-numero"), "nidaba-asignacion-numero");
  return result.rows?.[0]?.numero || `${prefix}-${year}-0001`;
}

function prepareNewDocumentForm() {
  resetDocumentForm();
  document.getElementById("document-number").value = "";
  showMessage("document-form-message", "Documento listo para una nueva captura.", "ok");
  setTopbarMessage("Documento nuevo preparado.");
}

function getAccountsByCircuit(circuit) {
  return circuit === "USOS"
    ? bootstrapData?.accounts?.usos || []
    : bootstrapData?.accounts?.fuentes || [];
}

function buildAccountDisplay(account) {
  return `${account.codigo} · ${account.nombre}`;
}

function renderAccountDatalists() {
  for (const circuit of ["USOS", "FUENTES"]) {
    const node = document.getElementById(`accounts-${circuit}`);
    node.innerHTML = getAccountsByCircuit(circuit)
      .map((account) => `<option value="${buildAccountDisplay(account)}"></option>`)
      .join("");
  }
}

function resolveAccount(circuit, rawValue) {
  const value = String(rawValue || "").trim().toLowerCase();
  if (!value) return null;

  return getAccountsByCircuit(circuit).find((account) => {
    const display = buildAccountDisplay(account).toLowerCase();
    return display === value || String(account.codigo).toLowerCase() === value;
  }) || null;
}

function emptyLinesMessage(circuit) {
  return circuit === "USOS"
    ? `<tr><td colspan="5">Aún no hay líneas de usos.</td></tr>`
    : `<tr><td colspan="5">Aún no hay líneas de fuentes.</td></tr>`;
}

function syncAccountRow(row) {
  const circuit = row.dataset.circuit;
  const accountInput = row.querySelector(".account-input");
  const account = resolveAccount(circuit, accountInput.value);

  if (!account) {
    if (!row.dataset.accountCode) {
      row.dataset.accountCode = "";
    }
    return false;
  }

  row.dataset.accountCode = String(account.codigo);
  accountInput.value = buildAccountDisplay(account);
  return true;
}

function renderLineBodiesIfEmpty() {
  for (const circuit of ["USOS", "FUENTES"]) {
    const body = document.getElementById(circuit === "USOS" ? "usos-lines-body" : "fuentes-lines-body");
    if (!body.children.length) {
      body.innerHTML = emptyLinesMessage(circuit);
    }
  }
}

function addDetailRow(circuit, seed = {}) {
  const body = document.getElementById(circuit === "USOS" ? "usos-lines-body" : "fuentes-lines-body");
  if (body.children.length === 1 && body.textContent.includes("Aún no hay líneas")) {
    body.innerHTML = "";
  }

  const tr = document.createElement("tr");
  tr.dataset.circuit = circuit;
  tr.dataset.accountCode = seed.cuenta_codigo ? String(seed.cuenta_codigo) : "";

  tr.innerHTML = `
    <td>
      <input type="text" class="account-input" list="accounts-${circuit}" placeholder="${circuit === "USOS" ? "400000 · Cuenta de gasto" : "300000 · Cuenta de ingreso"}" data-editable="true">
    </td>
    <td class="amount-cell">
      ${circuit === "USOS"
        ? `<input type="text" inputmode="decimal" class="line-amount amount-input" value="${formatAmountInputValue(seed.amount || 0)}" data-editable="true">`
        : `<span class="amount-placeholder">-</span>`}
    </td>
    <td class="amount-cell">
      ${circuit === "FUENTES"
        ? `<input type="text" inputmode="decimal" class="line-amount amount-input" value="${formatAmountInputValue(seed.amount || 0)}" data-editable="true">`
        : `<span class="amount-placeholder">-</span>`}
    </td>
    <td>
      <input type="text" class="line-glosa" maxlength="240" value="${seed.glosa || ""}" placeholder="Glosa específica de la línea." data-editable="true">
    </td>
    <td>
      <button type="button" class="ghost-btn line-remove-btn" data-editable="true">Quitar</button>
    </td>
  `;

  const accountInput = tr.querySelector(".account-input");
  const amountInput = tr.querySelector(".line-amount");

  if (seed.accountDisplay) {
    accountInput.value = seed.accountDisplay;
    if (!tr.dataset.accountCode && seed.cuenta_codigo) {
      tr.dataset.accountCode = String(seed.cuenta_codigo);
    }
  }

  accountInput.addEventListener("change", () => {
    syncAccountRow(tr);
    recalculateTotals();
  });

  if (amountInput) {
    amountInput.addEventListener("input", recalculateTotals);
    amountInput.addEventListener("blur", () => {
      amountInput.value = formatAmountInputValue(toAmountNumber(amountInput.value));
      recalculateTotals();
    });
  }
  tr.querySelector(".line-glosa").addEventListener("input", recalculateTotals);
  tr.querySelector(".line-remove-btn").addEventListener("click", () => {
    tr.remove();
    renderLineBodiesIfEmpty();
    recalculateTotals();
  });

  body.appendChild(tr);
  if (currentDocumentState === "cerrado") {
    setEditingDisabled(true);
  }
  recalculateTotals();
}

function collectDetails() {
  const details = [];
  for (const circuit of ["USOS", "FUENTES"]) {
    const body = document.getElementById(circuit === "USOS" ? "usos-lines-body" : "fuentes-lines-body");
    for (const row of Array.from(body.querySelectorAll("tr"))) {
      if (row.textContent.includes("Aún no hay líneas")) continue;
      const accountOk = syncAccountRow(row);
      const storedAccountCode = String(row.dataset.accountCode || "").trim();
      const amount = toAmountNumber(row.querySelector(".line-amount")?.value || 0);
      const glosa = row.querySelector(".line-glosa").value.trim();
      if (!accountOk && !storedAccountCode && (amount > 0 || glosa)) {
        throw new Error(`Hay una cuenta inválida en ${circuit === "USOS" ? "usos" : "fuentes"}.`);
      }
      if ((!accountOk && !storedAccountCode) || amount <= 0) continue;
      details.push({
        circuito: circuit,
        cuenta_codigo: storedAccountCode || String(row.dataset.accountCode || "").trim(),
        debe: circuit === "USOS" ? amount : 0,
        haber: circuit === "FUENTES" ? amount : 0,
        glosa,
      });
    }
  }
  return details;
}

function recalculateTotals() {
  let totalUsos = 0;
  let totalFuentes = 0;
  let hasUsos = false;
  let hasFuentes = false;
  let valid = true;
  const fechaDocumento = document.getElementById("document-date").value;

  try {
    const details = collectDetails();
    for (const detail of details) {
      if (detail.circuito === "USOS") {
        totalUsos += Number(detail.debe);
        hasUsos = true;
      } else {
        totalFuentes += Number(detail.haber);
        hasFuentes = true;
      }
    }
  } catch {
    valid = false;
  }

  const difference = totalUsos - totalFuentes;
  document.getElementById("total-usos").textContent = formatCurrency(totalUsos);
  document.getElementById("total-fuentes").textContent = formatCurrency(totalFuentes);
  document.getElementById("difference-total").textContent = formatCurrency(difference);

  const balanceNode = document.getElementById("balance-status");
  if (!fechaDocumento || !isDateWithinSelectedPeriod(fechaDocumento)) {
    balanceNode.textContent = "Fecha fuera de período";
    balanceNode.className = "error-text";
    valid = false;
  } else if (!hasUsos || !hasFuentes) {
    balanceNode.textContent = "Incompleto";
    balanceNode.className = "warning-text";
    valid = false;
  } else if (Math.abs(difference) > 0.001) {
    balanceNode.textContent = "Descuadrado";
    balanceNode.className = "error-text";
    valid = false;
  } else {
    balanceNode.textContent = "Cuadrado";
    balanceNode.className = "ok-text";
  }

  const saveButton = document.getElementById("save-document-btn");
  const closeButton = document.getElementById("close-document-btn");
  const documentId = Number(document.getElementById("document-id").value || 0);
  if (saveButton) saveButton.disabled = !valid || currentDocumentState === "cerrado";
  if (closeButton) closeButton.disabled = !valid || currentDocumentState === "cerrado" || documentId <= 0;
}

function renderDocumentList() {
  const body = document.getElementById("documents-table-body");
  const list = bootstrapData?.lists?.[currentListView] || [];
  document.getElementById("tab-grabados-btn").classList.toggle("is-active", currentListView === "grabados");
  document.getElementById("tab-cerrados-btn").classList.toggle("is-active", currentListView === "cerrados");

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="7">No hay documentos ${currentListView === "cerrados" ? "cerrados" : "grabados"} en este contexto.</td></tr>`;
    return;
  }

  body.innerHTML = list.map((row) => `
    <tr data-document-id="${row.fin_documento_id}" class="document-row">
      <td>${row.numero_documento || ""}</td>
      <td>${formatDate(row.fecha_documento)}</td>
      <td>${row.periodo_codigo || ""}</td>
      <td>${row.reparticion_nombre || row.reparticion_codigo || getCurrentReparticionName() || ""}</td>
      <td>${formatCurrency(row.total_usos)}</td>
      <td>${formatCurrency(row.total_fuentes)}</td>
      <td>${row.estado}</td>
    </tr>
  `).join("");

  body.querySelectorAll(".document-row").forEach((row) => {
    row.addEventListener("click", async () => {
      await loadDocument(Number(row.dataset.documentId));
    });
  });
}

function resetDocumentForm() {
  document.getElementById("document-id").value = "";
  document.getElementById("document-status").value = "grabado";
  document.getElementById("document-mode").value = "INICIAL";
  document.getElementById("document-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("document-number").value = "";
  document.getElementById("document-glosa").value = "";
  document.getElementById("usos-lines-body").innerHTML = emptyLinesMessage("USOS");
  document.getElementById("fuentes-lines-body").innerHTML = emptyLinesMessage("FUENTES");
  currentDocumentState = "grabado";
  setEditingDisabled(false);
  clearMessage("document-form-message");
  recalculateTotals();
}

function fillDocument(documentData) {
  document.getElementById("document-id").value = documentData.fin_documento_id;
  document.getElementById("document-status").value = documentData.estado;
  document.getElementById("document-period").value = String(documentData.fin_periodo_id);
  document.getElementById("document-mode").value = documentData.modo_operacion || "INICIAL";
  document.getElementById("document-date").value = normalizeSqlDate(documentData.fecha_documento);
  document.getElementById("document-number").value = documentData.numero_documento || "";
  document.getElementById("document-glosa").value = documentData.glosa || "";
  document.getElementById("usos-lines-body").innerHTML = "";
  document.getElementById("fuentes-lines-body").innerHTML = "";

  for (const detail of documentData.detalles || []) {
    addDetailRow(detail.circuito, {
      cuenta_codigo: detail.cuenta_codigo,
      accountDisplay: `${detail.cuenta_codigo} · ${detail.cuenta_nombre}`,
      amount: detail.circuito === "USOS" ? detail.debe : detail.haber,
      glosa: detail.glosa || "",
    });
  }

  renderLineBodiesIfEmpty();
  currentDocumentState = documentData.estado;
  setEditingDisabled(currentDocumentState === "cerrado");
  recalculateTotals();
}

async function loadDocument(documentId) {
  const owner = getCurrentOwner();
  if (!owner) return;
  try {
    const documentData = await fetchAssignmentDocument(owner, documentId);
    fillDocument(documentData);
    showMessage("document-form-message", "Documento cargado correctamente.", "ok");
    setTopbarMessage(`Documento ${documentData.numero_documento || documentData.fin_documento_id} cargado.`);
  } catch (error) {
    showMessage("document-form-message", error.message, "error");
    setTopbarMessage(error.message);
  }
}

function buildPayload() {
  const details = collectDetails();
  if (!details.length) {
    throw new Error("Debe ingresar líneas de usos y fuentes antes de grabar.");
  }

  const periodId = Number(document.getElementById("document-period").value || 0);
  const numeroDocumento = document.getElementById("document-number").value.trim();
  const fechaDocumento = document.getElementById("document-date").value;
  const glosa = document.getElementById("document-glosa").value.trim();

  if (!periodId) {
    throw new Error("Debe seleccionar un período.");
  }
  if (!fechaDocumento) {
    throw new Error("Debe indicar la fecha del documento.");
  }
  if (!isDateWithinSelectedPeriod(fechaDocumento)) {
    throw new Error("La fecha del documento debe estar dentro del período seleccionado.");
  }
  if (!glosa) {
    throw new Error("Debe indicar la glosa total del documento.");
  }

  return {
    fin_documento_id: Number(document.getElementById("document-id").value || 0) || null,
    fin_periodo_id: periodId,
    numero_documento: numeroDocumento || null,
    fecha_documento: fechaDocumento,
    glosa,
    modo_operacion: document.getElementById("document-mode").value,
    detalles: details,
  };
}

async function saveDocument(closeAfter = false) {
  const owner = getCurrentOwner();
  const username = getCurrentUsername();
  if (!owner || !username) {
    showMessage("document-form-message", "Debe iniciar sesión antes de grabar.", "error");
    return;
  }

  try {
    const payload = buildPayload();
    if (closeAfter) {
      const fallbackLineGlosa = `${payload.numero_documento} ${payload.fecha_documento.slice(2).replaceAll("-", "/")}`;
      payload.detalles = payload.detalles.map((detail) => ({
        ...detail,
        glosa: detail.glosa?.trim() ? detail.glosa.trim() : fallbackLineGlosa,
      }));
    }
    const saved = await saveAssignmentDocument(owner, payload);
    const documentData = await fetchAssignmentDocument(owner, saved.fin_documento_id);
    fillDocument(documentData);
    showMessage("document-form-message", saved.message || "Documento grabado correctamente.", "ok");
    setTopbarMessage(saved.message || "Documento grabado correctamente.");

    bootstrapData.lists = await fetchAssignmentLists(owner);
    currentListView = "grabados";
    renderDocumentList();

    if (closeAfter) {
      const closed = await closeAssignmentDocument(saved.fin_documento_id, username);
      const closedDocument = await fetchAssignmentDocument(owner, saved.fin_documento_id);
      fillDocument(closedDocument);
      showMessage("document-form-message", closed.message || "Documento cerrado correctamente.", "ok");
      setTopbarMessage(closed.message || "Documento cerrado correctamente.");
      bootstrapData.lists = await fetchAssignmentLists(owner);
      currentListView = "cerrados";
      renderDocumentList();
    }
  } catch (error) {
    showMessage("document-form-message", error.message, "error");
    setTopbarMessage(error.message);
  }
}

async function refreshBootstrap() {
  const owner = getCurrentOwner();
  if (!owner) return;
  bootstrapData = await fetchAssignmentBootstrap(owner);
  renderPeriods();
  renderAccountDatalists();
  renderDocumentList();
  if (!document.getElementById("document-id").value) {
    resetDocumentForm();
  }
}

async function refreshSessionFromServer() {
  if (!currentSession?.token) return;
  try {
    const refreshed = await refreshStoredSession(currentSession);
    if (!refreshed) {
      clearSession();
      renderSession();
      showMessage("session-message", "Sesión no válida.", "error");
      setTopbarMessage("Sesión no válida.");
      return;
    }
    currentSession = refreshed;
    renderSession();
    await refreshBootstrap();
  } catch (error) {
    clearSession();
    renderSession();
    showMessage("session-message", error.message, "error");
    setTopbarMessage(error.message);
  }
}

document.getElementById("logout-btn")?.addEventListener("click", () => {
  clearSession();
  window.location.href = "./index.html";
});

document.getElementById("back-home-btn")?.addEventListener("click", () => {
  window.location.href = "./index.html";
});

document.getElementById("new-document-btn")?.addEventListener("click", () => {
  prepareNewDocumentForm();
});

document.getElementById("new-document-toolbar-btn")?.addEventListener("click", () => {
  prepareNewDocumentForm();
});

document.getElementById("save-document-btn")?.addEventListener("click", async () => {
  await saveDocument(false);
});

document.getElementById("close-document-btn")?.addEventListener("click", async () => {
  await saveDocument(true);
});

document.getElementById("add-uso-line-btn")?.addEventListener("click", () => {
  addDetailRow("USOS");
});

document.getElementById("add-fuente-line-btn")?.addEventListener("click", () => {
  addDetailRow("FUENTES");
});

document.getElementById("tab-grabados-btn")?.addEventListener("click", () => {
  currentListView = "grabados";
  renderDocumentList();
});

document.getElementById("tab-cerrados-btn")?.addEventListener("click", () => {
  currentListView = "cerrados";
  renderDocumentList();
});

document.getElementById("document-period")?.addEventListener("change", () => {
  recalculateTotals();
});

document.getElementById("document-date")?.addEventListener("change", () => {
  recalculateTotals();
});

document.getElementById("document-mode")?.addEventListener("change", async () => {
  const documentId = Number(document.getElementById("document-id").value || 0);
  if (documentId > 0 || currentDocumentState === "cerrado") return;
  document.getElementById("document-number").value = "";
});

currentSession = loadSession();
renderSession();
setTopbarMessage("Sin novedades.");
refreshSessionFromServer();
