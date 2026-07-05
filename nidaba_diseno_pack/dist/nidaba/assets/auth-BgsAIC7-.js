(function(){const o=document.createElement("link").relList;if(o&&o.supports&&o.supports("modulepreload"))return;for(const t of document.querySelectorAll('link[rel="modulepreload"]'))n(t);new MutationObserver(t=>{for(const r of t)if(r.type==="childList")for(const a of r.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&n(a)}).observe(document,{childList:!0,subtree:!0});function s(t){const r={};return t.integrity&&(r.integrity=t.integrity),t.referrerPolicy&&(r.referrerPolicy=t.referrerPolicy),t.crossOrigin==="use-credentials"?r.credentials="include":t.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(t){if(t.ep)return;t.ep=!0;const r=s(t);fetch(t.href,r)}})();const l=window.NIDABA_CONFIG||{},$=l.sqlUrl||l.SQL_URL||l.apiSqlUrl||"http://192.168.5.8:5678/webhook/ejecuta-sql",L=l.authSqlUrl||l.AUTH_SQL_URL||l.rootSqlUrl||l.ROOT_SQL_URL||$,q=l.sqlSource||l.SQL_SOURCE||"nidaba-frontend";async function U(e,o,s,n=q){const t=await fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sql:o,request_id:s,source:n})}),r=await t.json().catch(()=>null);if(!t.ok)throw new Error((r==null?void 0:r.message)||(r==null?void 0:r.error)||`Error HTTP ${t.status} al ejecutar SQL.`);if(!(r!=null&&r.ok))throw new Error((r==null?void 0:r.error)||"La consulta SQL no fue ejecutada correctamente.");return r}async function T(e,o,s=q){return U($,e,o,s)}function u(e){return`'${String(e??"").replace(/'/g,"''")}'`}function z(e){const o=String(e??"").trim();return o?u(o):"null"}function P(e,o="null"){if(e==null||e==="")return o;const s=Number(e);return Number.isInteger(s)?String(s):o}function J(e){return`${u(JSON.stringify(e??null))}::jsonb`}const h="nidaba_session";function f(e){return String(e||"").trim().toLowerCase()}function E(e){return String(e||"").trim().toLowerCase()}function A(e){const o=String(e||"").trim().toUpperCase();if(o.startsWith("P"))return o;const s=o.replace(/[.\-\s]/g,"");return/^[0-9]+[0-9K]?$/.test(s)&&s.length<9?s.padStart(9,"0"):s}function g(e){return String(e||"").trim().toLowerCase()}function D(e){return/^[a-z]{3}[0-9]{3}$/.test(g(e))}function I(){var e;return(e=globalThis.crypto)!=null&&e.randomUUID?globalThis.crypto.randomUUID():`nidaba-${Date.now()}-${Math.random().toString(36).slice(2,10)}`}function j(){try{return JSON.parse(localStorage.getItem(h)||"null")}catch{return null}}function N(e){return localStorage.setItem(h,JSON.stringify(e)),e}function Q(){localStorage.removeItem(h)}function O(e,o,s={}){const n=s.raw===!0,t=n?o:u(o),r=n?e:u(e);return n?`
      select
        case
          when ${t} = 'root' then (
            select json_agg(row_to_json(x))
            from (
              select
                s.servicio_id,
                s.nombre,
                s.nombre as nombre_visible,
                s.servicio_id as schema_name,
                s.logo_image,
                s.observacion as ayuda,
                s.persona_rut,
                coalesce(us.es_contexto_principal, false) as es_contexto_principal
              from root.servicios s
              left join root.usuarios_servicios us
                on us.servicio_id = s.servicio_id
               and us.persona_rut = ${r}
               and us.activo
              where s.activo
              order by coalesce(us.es_contexto_principal, false) desc, s.nombre, s.servicio_id
            ) x
          )
          else (
            select json_agg(row_to_json(x))
            from (
              select
                s.servicio_id,
                s.nombre,
                s.nombre as nombre_visible,
                s.servicio_id as schema_name,
                s.logo_image,
                s.observacion as ayuda,
                s.persona_rut,
                us.es_contexto_principal
              from root.usuarios_servicios us
              join root.servicios s
                on s.servicio_id = us.servicio_id
              where us.persona_rut = ${r}
                and us.activo
                and s.activo
              order by us.es_contexto_principal desc, s.nombre, s.servicio_id
            ) x
          )
        end as contextos
    `:`
    select
      s.servicio_id,
      s.nombre,
      s.nombre as nombre_visible,
      s.servicio_id as schema_name,
      s.logo_image,
      s.observacion as ayuda,
      s.persona_rut,
      us.es_contexto_principal
    from root.usuarios_servicios us
    join root.servicios s
      on s.servicio_id = us.servicio_id
    where us.persona_rut = ${u(personaRut)}
      and us.activo
      and s.activo
    order by us.es_contexto_principal desc, s.nombre, s.servicio_id
  `}function p(e,o){if(e==null)return o;if(typeof e=="object")return e;try{return JSON.parse(e)}catch{return o}}async function w(e,o,s){return U(L,e,o,s)}function R(e,o){return{method:e,username:f(o),authSqlUrl:L,at:new Date().toISOString()}}async function B(e,o){var d;const s=f(e),n=String(o||"");if(!s||!n)throw new Error("Debe indicar usuario y clave.");const t=`
    with usuario as (
      select
        u.usuario_operador_id,
        u.username,
        u.email_acceso,
        u.es_superusuario,
        u.owner,
        u.persona_rut,
        p.nombre_completo,
        p.email
      from root.usuarios_operadores u
      join root.personas p
        on p.rut = u.persona_rut
      where u.activo
        and (
          lower(u.username) = ${u(s)}
          or lower(coalesce(u.email_acceso, '')) = ${u(s)}
        )
        and u.password_hash = crypt(${u(n)}, u.password_hash)
      limit 1
    ),
    acceso as (
      update root.usuarios_operadores u
         set ultimo_acceso_at = now(),
             updated_at = now()
        from usuario x
       where u.usuario_operador_id = x.usuario_operador_id
      returning u.usuario_operador_id
    ),
    contextos as (
      ${O("(select persona_rut from usuario)","(select owner from usuario)",{raw:!0})}
    )
    select
      row_to_json(u) as usuario,
      coalesce((select contextos from contextos), '[]'::json) as contextos
    from usuario u
  `,a=(d=(await w(t,`nidaba-login-${Date.now()}`,"nidaba-auth-login")).rows)==null?void 0:d[0];if(!(a!=null&&a.usuario))throw new Error("Credenciales inválidas.");const i=p(a.usuario,null),c=p(a.contextos,[]),_=I(),m={token:_,user:{username:i.username,email:i.email_acceso,persona_rut:i.persona_rut,nombre_completo:i.nombre_completo,owner:i.owner,es_superusuario:i.es_superusuario},contexts:c,activeContext:c[0]||null,createdAt:new Date().toISOString(),auth_trace:R("webhook-sql",s)};return{token:_,session:m,message:"Ingreso correcto."}}async function V(e){var d,b,S,v,x,y;const o=e||j();if(!((b=(d=o==null?void 0:o.session)==null?void 0:d.user)!=null&&b.persona_rut)||!((v=(S=o==null?void 0:o.session)==null?void 0:S.user)!=null&&v.owner))return null;const s=o.session.user,n=`
    with usuario as (
      select
        u.username,
        u.email_acceso,
        u.es_superusuario,
        u.owner,
        u.persona_rut,
        p.nombre_completo,
        p.email
      from root.usuarios_operadores u
      join root.personas p
        on p.rut = u.persona_rut
      where u.activo
        and u.persona_rut = ${u(A(s.persona_rut))}
        and lower(u.username) = ${u(f(s.username))}
      limit 1
    ),
    contextos as (
      ${O("(select persona_rut from usuario)","(select owner from usuario)",{raw:!0})}
    )
    select
      row_to_json(u) as usuario,
      coalesce((select contextos from contextos), '[]'::json) as contextos
    from usuario u
  `,r=(x=(await w(n,`nidaba-session-${Date.now()}`,"nidaba-auth-session")).rows)==null?void 0:x[0];if(!(r!=null&&r.usuario))return Q(),null;const a=p(r.usuario,null),i=p(r.contextos,[]),c=((y=o.session.activeContext)==null?void 0:y.schema_name)||null,_=c?i.find(C=>C.schema_name===c)||i[0]||null:i[0]||null,m={...o,session:{...o.session,user:{username:a.username,email:a.email_acceso,persona_rut:a.persona_rut,nombre_completo:a.nombre_completo,owner:a.owner,es_superusuario:a.es_superusuario},contexts:i,activeContext:_}};return N(m),m}function k(e,o){var i;const s=e||j(),n=g(o),r=(((i=s==null?void 0:s.session)==null?void 0:i.contexts)||[]).find(c=>c.schema_name===n);if(!r)throw new Error("No existe ese contexto para la sesión actual.");const a={...s,session:{...s.session,activeContext:r}};return N(a),a}async function F(e){var t,r;const o=E(e);if(!o)throw new Error("Debe indicar el correo de acceso.");const s=`
    insert into root.usuarios_password_reset (
      usuario_operador_id,
      email_destino,
      solicitado_ip,
      observacion
    )
    select
      u.usuario_operador_id,
      coalesce(u.email_acceso, p.email),
      null,
      'Solicitud emitida desde frontend Nidaba'
    from root.usuarios_operadores u
    join root.personas p
      on p.rut = u.persona_rut
    where lower(coalesce(u.email_acceso, p.email, '')) = ${u(o)}
      and u.activo
    returning token
  `;return{message:"Si el correo existe, la solicitud de recuperación quedó registrada.",token_dev:((r=(t=(await w(s,`nidaba-recover-${Date.now()}`,"nidaba-auth-recover")).rows)==null?void 0:t[0])==null?void 0:r.token)||null}}async function H(e,o,s){var c;const n=f(e),t=String(o||""),r=String(s||"");if(!n||!t||!r)throw new Error("Faltan datos para actualizar la clave.");if(r.length<8)throw new Error("La nueva clave debe tener al menos 8 caracteres.");const a=`
    update root.usuarios_operadores
       set password_hash = crypt(${u(r)}, gen_salt('bf', 10)),
           password_changed_at = now(),
           must_change_password = false,
           updated_at = now()
     where activo
       and (
         lower(username) = ${u(n)}
         or lower(coalesce(email_acceso, '')) = ${u(n)}
       )
       and password_hash = crypt(${u(t)}, password_hash)
    returning usuario_operador_id
  `;if(!((c=(await w(a,`nidaba-change-${Date.now()}`,"nidaba-auth-change")).rows)!=null&&c.length))throw new Error("No fue posible validar la clave actual.");return{message:"Clave actualizada correctamente."}}async function K(e){const o=g(e);if(!D(o))throw new Error("El esquema activo no es válido para operación contextual.");const s=`
    select rut, nombre_completo, email, telefono, tipo_persona, activa
    from ${o}.personas
    order by nombre_completo, rut
  `;return(await executeSQL(s,`nidaba-personas-${Date.now()}`,"nidaba-context-personas")).rows||[]}export{z as a,J as b,Q as c,P as d,T as e,B as f,N as g,F as h,H as i,k as j,K as k,j as l,V as r,u as s};
