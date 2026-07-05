import { NIDABA_AUTH_SQL_URL } from "./config.js";
import { executeSQLAt } from "./sql.js";
import { sqlText } from "./sqlText.js";

export const STORAGE_KEY = "nidaba_session";

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRut(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw.startsWith("P")) return raw;
  const cleaned = raw.replace(/[.\-\s]/g, "");
  if (/^[0-9]+[0-9K]?$/.test(cleaned) && cleaned.length < 9) {
    return cleaned.padStart(9, "0");
  }
  return cleaned;
}

function normalizeSchemaName(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidServiceSchema(value) {
  return /^[a-z]{3}[0-9]{3}$/.test(normalizeSchemaName(value));
}

function createToken() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `nidaba-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveSession(bundle) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
  return bundle;
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function buildContextsSql(personaRutExpr, ownerExpr, options = {}) {
  const raw = options.raw === true;
  const ownerValue = raw ? ownerExpr : sqlText(ownerExpr);
  const personaRutValue = raw ? personaRutExpr : sqlText(personaRutExpr);

  if (!raw && ownerExpr === "root") {
    return `
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
       and us.persona_rut = ${personaRutValue}
       and us.activo
      where s.activo
      order by coalesce(us.es_contexto_principal, false) desc, s.nombre, s.servicio_id
    `;
  }

  if (raw) {
    return `
      select
        case
          when ${ownerValue} = 'root' then (
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
               and us.persona_rut = ${personaRutValue}
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
              where us.persona_rut = ${personaRutValue}
                and us.activo
                and s.activo
              order by us.es_contexto_principal desc, s.nombre, s.servicio_id
            ) x
          )
        end as contextos
    `;
  }

  return `
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
    where us.persona_rut = ${sqlText(personaRut)}
      and us.activo
      and s.activo
    order by us.es_contexto_principal desc, s.nombre, s.servicio_id
  `;
}

function parseJsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function executeAuthSQL(sql, requestId, source) {
  return executeSQLAt(NIDABA_AUTH_SQL_URL, sql, requestId, source);
}

function createAuthTrace(method, username) {
  return {
    method,
    username: normalizeUsername(username),
    authSqlUrl: NIDABA_AUTH_SQL_URL,
    at: new Date().toISOString(),
  };
}

export async function loginWithRoot(username, password) {
  const normalizedUsername = normalizeUsername(username);
  const rawPassword = String(password || "");

  if (!normalizedUsername || !rawPassword) {
    throw new Error("Debe indicar usuario y clave.");
  }

  const sql = `
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
          lower(u.username) = ${sqlText(normalizedUsername)}
          or lower(coalesce(u.email_acceso, '')) = ${sqlText(normalizedUsername)}
        )
        and u.password_hash = crypt(${sqlText(rawPassword)}, u.password_hash)
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
      ${buildContextsSql("(select persona_rut from usuario)", "(select owner from usuario)", { raw: true })}
    )
    select
      row_to_json(u) as usuario,
      coalesce((select contextos from contextos), '[]'::json) as contextos
    from usuario u
  `;

  const result = await executeAuthSQL(sql, `nidaba-login-${Date.now()}`, "nidaba-auth-login");
  const row = result.rows?.[0];
  if (!row?.usuario) {
    throw new Error("Credenciales inválidas.");
  }

  const user = parseJsonValue(row.usuario, null);
  const contexts = parseJsonValue(row.contextos, []);
  const token = createToken();
  const session = {
    token,
    user: {
      username: user.username,
      email: user.email_acceso,
      persona_rut: user.persona_rut,
      nombre_completo: user.nombre_completo,
      owner: user.owner,
      es_superusuario: user.es_superusuario,
    },
    contexts,
    activeContext: contexts[0] || null,
    createdAt: new Date().toISOString(),
    auth_trace: createAuthTrace("webhook-sql", normalizedUsername),
  };

  return {
    token,
    session,
    message: "Ingreso correcto.",
  };
}

export async function refreshStoredSession(bundle) {
  const current = bundle || loadSession();
  if (!current?.session?.user?.persona_rut || !current?.session?.user?.owner) {
    return null;
  }

  const user = current.session.user;
  const sql = `
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
        and u.persona_rut = ${sqlText(normalizeRut(user.persona_rut))}
        and lower(u.username) = ${sqlText(normalizeUsername(user.username))}
      limit 1
    ),
    contextos as (
      ${buildContextsSql("(select persona_rut from usuario)", "(select owner from usuario)", { raw: true })}
    )
    select
      row_to_json(u) as usuario,
      coalesce((select contextos from contextos), '[]'::json) as contextos
    from usuario u
  `;

  const result = await executeAuthSQL(sql, `nidaba-session-${Date.now()}`, "nidaba-auth-session");
  const row = result.rows?.[0];
  if (!row?.usuario) {
    clearSession();
    return null;
  }

  const refreshedUser = parseJsonValue(row.usuario, null);
  const contexts = parseJsonValue(row.contextos, []);
  const previousSchema = current.session.activeContext?.schema_name || null;
  const activeContext = previousSchema
    ? contexts.find((item) => item.schema_name === previousSchema) || contexts[0] || null
    : contexts[0] || null;

  const refreshed = {
    ...current,
    session: {
      ...current.session,
      user: {
        username: refreshedUser.username,
        email: refreshedUser.email_acceso,
        persona_rut: refreshedUser.persona_rut,
        nombre_completo: refreshedUser.nombre_completo,
        owner: refreshedUser.owner,
        es_superusuario: refreshedUser.es_superusuario,
      },
      contexts,
      activeContext,
    },
  };

  saveSession(refreshed);
  return refreshed;
}

export function switchStoredContext(bundle, schemaName) {
  const current = bundle || loadSession();
  const normalized = normalizeSchemaName(schemaName);
  const contexts = current?.session?.contexts || [];
  const target = contexts.find((item) => item.schema_name === normalized);
  if (!target) {
    throw new Error("No existe ese contexto para la sesión actual.");
  }

  const updated = {
    ...current,
    session: {
      ...current.session,
      activeContext: target,
    },
  };
  saveSession(updated);
  return updated;
}

export async function requestPasswordRecovery(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Debe indicar el correo de acceso.");
  }

  const sql = `
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
    where lower(coalesce(u.email_acceso, p.email, '')) = ${sqlText(normalizedEmail)}
      and u.activo
    returning token
  `;

  const result = await executeAuthSQL(sql, `nidaba-recover-${Date.now()}`, "nidaba-auth-recover");
  return {
    message: "Si el correo existe, la solicitud de recuperación quedó registrada.",
    token_dev: result.rows?.[0]?.token || null,
  };
}

export async function changePassword(username, currentPassword, newPassword) {
  const normalizedUsername = normalizeUsername(username);
  const current = String(currentPassword || "");
  const next = String(newPassword || "");

  if (!normalizedUsername || !current || !next) {
    throw new Error("Faltan datos para actualizar la clave.");
  }
  if (next.length < 8) {
    throw new Error("La nueva clave debe tener al menos 8 caracteres.");
  }

  const sql = `
    update root.usuarios_operadores
       set password_hash = crypt(${sqlText(next)}, gen_salt('bf', 10)),
           password_changed_at = now(),
           must_change_password = false,
           updated_at = now()
     where activo
       and (
         lower(username) = ${sqlText(normalizedUsername)}
         or lower(coalesce(email_acceso, '')) = ${sqlText(normalizedUsername)}
       )
       and password_hash = crypt(${sqlText(current)}, password_hash)
    returning usuario_operador_id
  `;

  const result = await executeAuthSQL(sql, `nidaba-change-${Date.now()}`, "nidaba-auth-change");
  if (!result.rows?.length) {
    throw new Error("No fue posible validar la clave actual.");
  }
  return { message: "Clave actualizada correctamente." };
}

export async function loadPublishedPersonas(schemaName) {
  const schema = normalizeSchemaName(schemaName);
  if (!isValidServiceSchema(schema)) {
    throw new Error("El esquema activo no es válido para operación contextual.");
  }

  const sql = `
    select rut, nombre_completo, email, telefono, tipo_persona, activa
    from ${schema}.personas
    order by nombre_completo, rut
  `;

  const result = await executeSQL(sql, `nidaba-personas-${Date.now()}`, "nidaba-context-personas");
  return result.rows || [];
}
