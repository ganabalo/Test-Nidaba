import{l as ue,c as me,r as le,e as $,s as l,a as _e,b as fe,d as j}from"./auth-BgsAIC7-.js";const w="ASIGNACION_PRESUPUESTARIA";let a=null,r=null,b="grabados",p="grabado";function oe(e){const o=String(e??"").replace(/\./g,"").replace(/,/g,".").replace(/[^0-9.\-]/g,""),t=Number(o);return Number.isFinite(t)?t:0}function O(e){const o=Number(e||0);return o?new Intl.NumberFormat("es-CL",{minimumFractionDigits:0,maximumFractionDigits:2}).format(o):""}function f(e){const o=document.getElementById("topbar-status");o&&(o.textContent=e||"Sin novedades.")}function _(e,o,t="ok"){const n=document.getElementById(e);n&&(n.textContent=o,n.classList.toggle("error",t==="error"),n.style.display="block")}function ge(e){const o=document.getElementById(e);o&&(o.textContent="",o.classList.remove("error"),o.style.display="none")}function T(){a=null,me()}function x(e){return`nidaba-${e}-${Date.now()}`}function B(e){const o=String(e||"").trim().toLowerCase();if(!/^[a-z]{3}[0-9]{3}$/.test(o))throw new Error("El esquema activo no es válido para operación contextual.");return`"${o}"`}function g(e,o){if(e==null)return o;if(typeof e=="object")return e;try{return JSON.parse(e)}catch{return o}}function v(e){if(!e)return"";const o=String(e).trim();if(!o)return"";const t=o.match(/^(\d{4}-\d{2}-\d{2})/);return t?t[1]:o}function C(){var e,o;return((o=(e=a==null?void 0:a.session)==null?void 0:e.activeContext)==null?void 0:o.schema_name)||""}function be(){var e,o;return((o=(e=a==null?void 0:a.session)==null?void 0:e.user)==null?void 0:o.username)||""}function pe(){var e,o;return((o=(e=a==null?void 0:a.session)==null?void 0:e.activeContext)==null?void 0:o.nombre_visible)||""}function he(e){const o=B(e);return`
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
      from ${o}.fin_documentos d
      join ${o}.fin_tipos_documento td
        on td.fin_tipo_documento_id = d.fin_tipo_documento_id
      join ${o}.fin_periodos p
        on p.fin_periodo_id = d.fin_periodo_id
      left join ${o}.fin_documento_detalles det
        on det.fin_documento_id = d.fin_documento_id
       and det.estado = 'vigente'
      where td.codigo = ${l(w)}
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
  `}function ye(e){const o=B(e);return`
    with
    contexto as (
      select codigo, nombre, servicio_id
      from ${o}.reparticiones_internas
      order by codigo
      limit 1
    ),
    periodos as (
      select fin_periodo_id, codigo, nombre, fecha_inicio, fecha_termino, orden
      from ${o}.fin_periodos
      where activa
        and estado = 'abierto'
    ),
    cuentas as (
      select codigo, nombre, tipo_cuenta, naturaleza
      from ${o}.fin_cuentas
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
      from ${o}.fin_documentos d
      join ${o}.fin_tipos_documento td
        on td.fin_tipo_documento_id = d.fin_tipo_documento_id
      join ${o}.fin_periodos p
        on p.fin_periodo_id = d.fin_periodo_id
      left join ${o}.fin_documento_detalles det
        on det.fin_documento_id = d.fin_documento_id
       and det.estado = 'vigente'
      where td.codigo = ${l(w)}
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
  `}function Ee(e,o){const t=B(e);return`
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
      from ${t}.fin_documentos d
      join ${t}.fin_tipos_documento td
        on td.fin_tipo_documento_id = d.fin_tipo_documento_id
      join ${t}.fin_periodos p
        on p.fin_periodo_id = d.fin_periodo_id
      where d.fin_documento_id = ${j(o,"0")}
        and td.codigo = ${l(w)}
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
          from ${t}.fin_documento_detalles det
          join ${t}.fin_cuentas c
            on c.codigo = det.cuenta_codigo
          where det.fin_documento_id = d.fin_documento_id
            and det.estado = 'vigente'
        ),
        '[]'::json
      ) as detalles
    from documento d
  `}function we(e,o){const t=B(e),n=j(o.fin_documento_id,"null"),d=j(o.fin_periodo_id,"0"),c=l(o.numero_documento),s=l(o.fecha_documento),i=_e(o.glosa),u=String(o.detalles.filter(h=>h.circuito==="USOS").reduce((h,y)=>h+Number(y.debe||0),0).toFixed(2)),N=l(o.modo_operacion),D=fe(o.detalles);return`
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
      from ${t}.reparticiones_internas
      order by codigo
      limit 1
    ),
    entrada as (
      select
        ${n}::bigint as fin_documento_id,
        ${d}::bigint as fin_periodo_id,
        ${c}::varchar as numero_documento,
        ${s}::date as fecha_documento,
        ${i}::text as glosa,
        ${N}::varchar as modo_operacion,
        ${u}::numeric(18,2) as total_documento
    ),
    existente as (
      select fin_documento_id, estado, numero_documento
      from ${t}.fin_documentos
      where fin_documento_id = (select fin_documento_id from entrada)
    ),
    numero_generado as (
      with base as (
        select d.numero_documento
        from ${t}.fin_documentos d
        join ${t}.fin_tipos_documento t
          on t.fin_tipo_documento_id = d.fin_tipo_documento_id
        cross join entrada e
        where t.codigo = ${l(w)}
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
      update ${t}.fin_documentos d
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
      insert into ${t}.fin_documentos (
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
        from ${t}.fin_tipos_documento
        where codigo = ${l(w)}
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

    delete from ${t}.fin_documento_detalles
    where fin_documento_id = (
      select fin_documento_id
      from nidaba_save_result
      where code = 'OK'
      limit 1
    );

    insert into ${t}.fin_documento_detalles (
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
      from ${t}.reparticiones_internas
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
      from jsonb_array_elements(${D}) with ordinality as t(item, ord)
    ) de
    where r.code = 'OK';

    select code, message, fin_documento_id
    from nidaba_save_result;

    commit;
  `}function ve(e,o){return`
    select *
    from ${B(C())}.fn_cerrar_asignacion_presupuestaria(
      ${j(e,"0")}::bigint,
      ${l(o)}::varchar
    )
  `}async function M(e){var n;const t=((n=(await $(he(e),x("asignacion-list"),"nidaba-asignacion-list")).rows)==null?void 0:n[0])||{};return{grabados:g(t.grabados,[]),cerrados:g(t.cerrados,[])}}async function Ie(e){var n;const t=(n=(await $(ye(e),x("asignacion-bootstrap"),"nidaba-asignacion-bootstrap")).rows)==null?void 0:n[0];if(!t)throw new Error("No fue posible cargar el contexto financiero.");return{reparticion:g(t.reparticion,null),periods:g(t.periods,[]),accounts:g(t.accounts,{usos:[],fuentes:[]}),lists:{grabados:g(t.grabados,[]).map(d=>({...d,fecha_documento:v(d.fecha_documento)})),cerrados:g(t.cerrados,[]).map(d=>({...d,fecha_documento:v(d.fecha_documento)}))}}}async function U(e,o){var d;const n=(d=(await $(Ee(e,o),x("asignacion-documento"),"nidaba-asignacion-documento")).rows)==null?void 0:d[0];if(!n)throw new Error("No existe el documento solicitado en el contexto activo.");return{...n,fecha_documento:v(n.fecha_documento),detalles:g(n.detalles,[])}}async function Se(e,o){var d;const n=(d=(await $(we(e,o),x("asignacion-save"),"nidaba-asignacion-save")).rows)==null?void 0:d[0];if(!n)throw new Error("No fue posible grabar el documento.");if(n.code!=="OK")throw new Error(n.message||"No fue posible grabar el documento.");return{message:n.message,fin_documento_id:Number(n.fin_documento_id||0)}}async function $e(e,o){var d;const n=(d=(await $(ve(e,o),x("asignacion-close"),"nidaba-asignacion-close")).rows)==null?void 0:d[0];if(!n)throw new Error("No fue posible cerrar el documento.");return n}function E(e){return new Intl.NumberFormat("es-CL",{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(e||0))}function xe(e){if(!e)return"";const o=v(e),t=new Date(`${o}T00:00:00`);return Number.isNaN(t.getTime())?e:new Intl.DateTimeFormat("es-CL").format(t)}function H(){var t;const e=document.getElementById("topbar-user"),o=document.getElementById("topbar-context");if(!(!e||!o)){if(!(a!=null&&a.session)){e.textContent="Sin sesión",o.textContent="Sin contexto";return}e.textContent=a.session.user.username,o.textContent=((t=a.session.activeContext)==null?void 0:t.nombre_visible)||"Pendiente"}}function I(e){document.querySelectorAll("[data-editable='true']").forEach(o=>{o.disabled=e})}function L(){const e=document.getElementById("auth-session-meta"),o=document.getElementById("auth-session-title"),t=document.getElementById("document-owner"),n=document.getElementById("logia-logo-image");if(!(a!=null&&a.session)){e.innerHTML="<div><dt>Estado</dt><dd>Sin sesión</dd></div>",o.textContent="Sesión requerida",t.value="Sin contexto",n.src="./styles/nidaba-mark.svg",n.alt="Logo del servicio",I(!0),H();return}const{user:d,activeContext:c}=a.session;o.textContent=d.nombre_completo||d.username,t.value=(c==null?void 0:c.schema_name)||"Sin contexto",n.src=(c==null?void 0:c.logo_image)||"./styles/nidaba-mark.svg",n.alt=c!=null&&c.nombre_visible?`Logo de ${c.nombre_visible}`:"Logo del servicio",e.innerHTML=`
    <div><dt>Usuario</dt><dd>${d.username}</dd></div>
    <div><dt>RUT</dt><dd>${d.persona_rut}</dd></div>
    <div><dt>Servicio</dt><dd>${(c==null?void 0:c.nombre_visible)||"Sin contexto"}</dd></div>
    <div><dt>Esquema</dt><dd>${(c==null?void 0:c.schema_name)||"Sin contexto"}</dd></div>
  `,I(p==="cerrado"),H()}function Be(){const e=document.getElementById("document-period"),o=(r==null?void 0:r.periods)||[];e.innerHTML=o.map((t,n)=>`<option value="${t.fin_periodo_id}" ${n===0?"selected":""}>${t.codigo} · ${t.nombre}</option>`).join("")}function Ne(){const e=Number(document.getElementById("document-period").value||0);return((r==null?void 0:r.periods)||[]).find(o=>Number(o.fin_periodo_id)===e)||null}function te(e){const o=Ne();return!o||!e?!1:e>=o.fecha_inicio&&e<=o.fecha_termino}function ne(){re(),document.getElementById("document-number").value="",_("document-form-message","Documento listo para una nueva captura.","ok"),f("Documento nuevo preparado.")}function de(e){var o,t;return e==="USOS"?((o=r==null?void 0:r.accounts)==null?void 0:o.usos)||[]:((t=r==null?void 0:r.accounts)==null?void 0:t.fuentes)||[]}function F(e){return`${e.codigo} · ${e.nombre}`}function Le(){for(const e of["USOS","FUENTES"]){const o=document.getElementById(`accounts-${e}`);o.innerHTML=de(e).map(t=>`<option value="${F(t)}"></option>`).join("")}}function je(e,o){const t=String(o||"").trim().toLowerCase();return t&&de(e).find(n=>F(n).toLowerCase()===t||String(n.codigo).toLowerCase()===t)||null}function A(e){return e==="USOS"?'<tr><td colspan="5">Aún no hay líneas de usos.</td></tr>':'<tr><td colspan="5">Aún no hay líneas de fuentes.</td></tr>'}function ce(e){const o=e.dataset.circuit,t=e.querySelector(".account-input"),n=je(o,t.value);return n?(e.dataset.accountCode=String(n.codigo),t.value=F(n),!0):(e.dataset.accountCode||(e.dataset.accountCode=""),!1)}function ae(){for(const e of["USOS","FUENTES"]){const o=document.getElementById(e==="USOS"?"usos-lines-body":"fuentes-lines-body");o.children.length||(o.innerHTML=A(e))}}function k(e,o={}){const t=document.getElementById(e==="USOS"?"usos-lines-body":"fuentes-lines-body");t.children.length===1&&t.textContent.includes("Aún no hay líneas")&&(t.innerHTML="");const n=document.createElement("tr");n.dataset.circuit=e,n.dataset.accountCode=o.cuenta_codigo?String(o.cuenta_codigo):"",n.innerHTML=`
    <td>
      <input type="text" class="account-input" list="accounts-${e}" placeholder="${e==="USOS"?"400000 · Cuenta de gasto":"300000 · Cuenta de ingreso"}" data-editable="true">
    </td>
    <td class="amount-cell">
      ${e==="USOS"?`<input type="text" inputmode="decimal" class="line-amount amount-input" value="${O(o.amount||0)}" data-editable="true">`:'<span class="amount-placeholder">-</span>'}
    </td>
    <td class="amount-cell">
      ${e==="FUENTES"?`<input type="text" inputmode="decimal" class="line-amount amount-input" value="${O(o.amount||0)}" data-editable="true">`:'<span class="amount-placeholder">-</span>'}
    </td>
    <td>
      <input type="text" class="line-glosa" maxlength="240" value="${o.glosa||""}" placeholder="Glosa específica de la línea." data-editable="true">
    </td>
    <td>
      <button type="button" class="ghost-btn line-remove-btn" data-editable="true">Quitar</button>
    </td>
  `;const d=n.querySelector(".account-input"),c=n.querySelector(".line-amount");o.accountDisplay&&(d.value=o.accountDisplay,!n.dataset.accountCode&&o.cuenta_codigo&&(n.dataset.accountCode=String(o.cuenta_codigo))),d.addEventListener("change",()=>{ce(n),m()}),c&&(c.addEventListener("input",m),c.addEventListener("blur",()=>{c.value=O(oe(c.value)),m()})),n.querySelector(".line-glosa").addEventListener("input",m),n.querySelector(".line-remove-btn").addEventListener("click",()=>{n.remove(),ae(),m()}),t.appendChild(n),p==="cerrado"&&I(!0),m()}function ie(){var o;const e=[];for(const t of["USOS","FUENTES"]){const n=document.getElementById(t==="USOS"?"usos-lines-body":"fuentes-lines-body");for(const d of Array.from(n.querySelectorAll("tr"))){if(d.textContent.includes("Aún no hay líneas"))continue;const c=ce(d),s=String(d.dataset.accountCode||"").trim(),i=oe(((o=d.querySelector(".line-amount"))==null?void 0:o.value)||0),u=d.querySelector(".line-glosa").value.trim();if(!c&&!s&&(i>0||u))throw new Error(`Hay una cuenta inválida en ${t==="USOS"?"usos":"fuentes"}.`);!c&&!s||i<=0||e.push({circuito:t,cuenta_codigo:s||String(d.dataset.accountCode||"").trim(),debe:t==="USOS"?i:0,haber:t==="FUENTES"?i:0,glosa:u})}}return e}function m(){let e=0,o=0,t=!1,n=!1,d=!0;const c=document.getElementById("document-date").value;try{const h=ie();for(const y of h)y.circuito==="USOS"?(e+=Number(y.debe),t=!0):(o+=Number(y.haber),n=!0)}catch{d=!1}const s=e-o;document.getElementById("total-usos").textContent=E(e),document.getElementById("total-fuentes").textContent=E(o),document.getElementById("difference-total").textContent=E(s);const i=document.getElementById("balance-status");!c||!te(c)?(i.textContent="Fecha fuera de período",i.className="error-text",d=!1):!t||!n?(i.textContent="Incompleto",i.className="warning-text",d=!1):Math.abs(s)>.001?(i.textContent="Descuadrado",i.className="error-text",d=!1):(i.textContent="Cuadrado",i.className="ok-text");const u=document.getElementById("save-document-btn"),N=document.getElementById("close-document-btn"),D=Number(document.getElementById("document-id").value||0);u&&(u.disabled=!d||p==="cerrado"),N&&(N.disabled=!d||p==="cerrado"||D<=0)}function S(){var t;const e=document.getElementById("documents-table-body"),o=((t=r==null?void 0:r.lists)==null?void 0:t[b])||[];if(document.getElementById("tab-grabados-btn").classList.toggle("is-active",b==="grabados"),document.getElementById("tab-cerrados-btn").classList.toggle("is-active",b==="cerrados"),!o.length){e.innerHTML=`<tr><td colspan="7">No hay documentos ${b==="cerrados"?"cerrados":"grabados"} en este contexto.</td></tr>`;return}e.innerHTML=o.map(n=>`
    <tr data-document-id="${n.fin_documento_id}" class="document-row">
      <td>${n.numero_documento||""}</td>
      <td>${xe(n.fecha_documento)}</td>
      <td>${n.periodo_codigo||""}</td>
      <td>${n.reparticion_nombre||n.reparticion_codigo||pe()||""}</td>
      <td>${E(n.total_usos)}</td>
      <td>${E(n.total_fuentes)}</td>
      <td>${n.estado}</td>
    </tr>
  `).join(""),e.querySelectorAll(".document-row").forEach(n=>{n.addEventListener("click",async()=>{await Ce(Number(n.dataset.documentId))})})}function re(){document.getElementById("document-id").value="",document.getElementById("document-status").value="grabado",document.getElementById("document-mode").value="INICIAL",document.getElementById("document-date").value=new Date().toISOString().slice(0,10),document.getElementById("document-number").value="",document.getElementById("document-glosa").value="",document.getElementById("usos-lines-body").innerHTML=A("USOS"),document.getElementById("fuentes-lines-body").innerHTML=A("FUENTES"),p="grabado",I(!1),ge("document-form-message"),m()}function q(e){document.getElementById("document-id").value=e.fin_documento_id,document.getElementById("document-status").value=e.estado,document.getElementById("document-period").value=String(e.fin_periodo_id),document.getElementById("document-mode").value=e.modo_operacion||"INICIAL",document.getElementById("document-date").value=v(e.fecha_documento),document.getElementById("document-number").value=e.numero_documento||"",document.getElementById("document-glosa").value=e.glosa||"",document.getElementById("usos-lines-body").innerHTML="",document.getElementById("fuentes-lines-body").innerHTML="";for(const o of e.detalles||[])k(o.circuito,{cuenta_codigo:o.cuenta_codigo,accountDisplay:`${o.cuenta_codigo} · ${o.cuenta_nombre}`,amount:o.circuito==="USOS"?o.debe:o.haber,glosa:o.glosa||""});ae(),p=e.estado,I(p==="cerrado"),m()}async function Ce(e){const o=C();if(o)try{const t=await U(o,e);q(t),_("document-form-message","Documento cargado correctamente.","ok"),f(`Documento ${t.numero_documento||t.fin_documento_id} cargado.`)}catch(t){_("document-form-message",t.message,"error"),f(t.message)}}function De(){const e=ie();if(!e.length)throw new Error("Debe ingresar líneas de usos y fuentes antes de grabar.");const o=Number(document.getElementById("document-period").value||0),t=document.getElementById("document-number").value.trim(),n=document.getElementById("document-date").value,d=document.getElementById("document-glosa").value.trim();if(!o)throw new Error("Debe seleccionar un período.");if(!n)throw new Error("Debe indicar la fecha del documento.");if(!te(n))throw new Error("La fecha del documento debe estar dentro del período seleccionado.");if(!d)throw new Error("Debe indicar la glosa total del documento.");return{fin_documento_id:Number(document.getElementById("document-id").value||0)||null,fin_periodo_id:o,numero_documento:t||null,fecha_documento:n,glosa:d,modo_operacion:document.getElementById("document-mode").value,detalles:e}}async function se(e=!1){const o=C(),t=be();if(!o||!t){_("document-form-message","Debe iniciar sesión antes de grabar.","error");return}try{const n=De();if(e){const s=`${n.numero_documento} ${n.fecha_documento.slice(2).replaceAll("-","/")}`;n.detalles=n.detalles.map(i=>{var u;return{...i,glosa:(u=i.glosa)!=null&&u.trim()?i.glosa.trim():s}})}const d=await Se(o,n),c=await U(o,d.fin_documento_id);if(q(c),_("document-form-message",d.message||"Documento grabado correctamente.","ok"),f(d.message||"Documento grabado correctamente."),r.lists=await M(o),b="grabados",S(),e){const s=await $e(d.fin_documento_id,t),i=await U(o,d.fin_documento_id);q(i),_("document-form-message",s.message||"Documento cerrado correctamente.","ok"),f(s.message||"Documento cerrado correctamente."),r.lists=await M(o),b="cerrados",S()}}catch(n){_("document-form-message",n.message,"error"),f(n.message)}}async function Oe(){const e=C();e&&(r=await Ie(e),Be(),Le(),S(),document.getElementById("document-id").value||re())}async function Te(){if(a!=null&&a.token)try{const e=await le(a);if(!e){T(),L(),_("session-message","Sesión no válida.","error"),f("Sesión no válida.");return}a=e,L(),await Oe()}catch(e){T(),L(),_("session-message",e.message,"error"),f(e.message)}}var P;(P=document.getElementById("logout-btn"))==null||P.addEventListener("click",()=>{T(),window.location.href="./index.html"});var z;(z=document.getElementById("back-home-btn"))==null||z.addEventListener("click",()=>{window.location.href="./index.html"});var G;(G=document.getElementById("new-document-btn"))==null||G.addEventListener("click",()=>{ne()});var K;(K=document.getElementById("new-document-toolbar-btn"))==null||K.addEventListener("click",()=>{ne()});var R;(R=document.getElementById("save-document-btn"))==null||R.addEventListener("click",async()=>{await se(!1)});var J;(J=document.getElementById("close-document-btn"))==null||J.addEventListener("click",async()=>{await se(!0)});var Q;(Q=document.getElementById("add-uso-line-btn"))==null||Q.addEventListener("click",()=>{k("USOS")});var X;(X=document.getElementById("add-fuente-line-btn"))==null||X.addEventListener("click",()=>{k("FUENTES")});var W;(W=document.getElementById("tab-grabados-btn"))==null||W.addEventListener("click",()=>{b="grabados",S()});var Y;(Y=document.getElementById("tab-cerrados-btn"))==null||Y.addEventListener("click",()=>{b="cerrados",S()});var V;(V=document.getElementById("document-period"))==null||V.addEventListener("change",()=>{m()});var Z;(Z=document.getElementById("document-date"))==null||Z.addEventListener("change",()=>{m()});var ee;(ee=document.getElementById("document-mode"))==null||ee.addEventListener("change",async()=>{Number(document.getElementById("document-id").value||0)>0||p==="cerrado"||(document.getElementById("document-number").value="")});a=ue();L();f("Sin novedades.");Te();
