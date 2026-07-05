import {
  clearSession as clearStoredSession,
  loadSession,
  refreshStoredSession,
  saveSession,
} from "./auth.js";
import { executeSQL } from "./sql.js";
import { sqlText } from "./sqlText.js";

const ENDPOINTS = {
  createUser: "/nidaba-api/admin/users",
  createService: "/nidaba-api/admin/services",
  personaLookup: "/nidaba-api/admin/persona-lookup",
};

let currentSession = null;
let lastCreatedServiceId = "";

function requestId(label) {
  return `nidaba-${label}-${Date.now()}`;
}

function normalizeRut(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw.startsWith("P")) {
    return raw;
  }
  const cleaned = raw.replace(/[.\-\s]/g, "");
  if (/^[0-9]+[0-9K]?$/.test(cleaned) && cleaned.length < 9) {
    return cleaned.padStart(9, "0");
  }
  return cleaned;
}

function formatRutForDisplay(value) {
  const normalized = normalizeRut(value);
  if (!normalized) return "";
  if (normalized.startsWith("P")) return normalized;
  if (!/^[0-9]{8}[0-9K]$/.test(normalized)) return String(value || "").trim().toUpperCase();

  const body = normalized.slice(0, 8);
  const dv = normalized.slice(8);
  return `${body.slice(0, 2)}.${body.slice(2, 5)}.${body.slice(5, 8)}-${dv}`;
}

function formatRutWhileTyping(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw.startsWith("P")) {
    return raw.slice(0, 50);
  }

  const cleaned = raw.replace(/[^0-9K]/g, "").slice(0, 9);
  if (cleaned.length <= 2) return cleaned;
  if (cleaned.length <= 5) return `${cleaned.slice(0, 2)}.${cleaned.slice(2)}`;
  if (cleaned.length <= 8) return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 5)}.${cleaned.slice(5)}`;
  return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 5)}.${cleaned.slice(5, 8)}-${cleaned.slice(8)}`;
}

function isValidRut(rut) {
  const value = normalizeRut(rut);
  if (!value) return false;

  if (value.startsWith("P")) {
    return value.length <= 50;
  }

  if (!/^[0-9]{8}[0-9K]$/.test(value)) {
    return false;
  }

  const digits = value.slice(0, 8);
  const dv = value.slice(8);
  let factor = 2;
  let sum = 0;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number(digits[index]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }

  const remainder = 11 - (sum % 11);
  const expectedDv = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  return dv === expectedDv;
}

function normalizeServiceId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
}

function formatServiceId(value) {
  return normalizeServiceId(value);
}

function isValidServiceId(value) {
  return /^[a-z]{3}[0-9]{3}$/.test(normalizeServiceId(value));
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

function setFieldMessage(targetId, text = "", type = "") {
  const node = document.getElementById(targetId);
  if (!node) return;
  node.textContent = text;
  node.className = `field-message${type ? ` ${type}` : ""}`;
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

function clearSession() {
  currentSession = null;
  clearStoredSession();
}

async function getJson(url, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new Error(body.error || "No fue posible completar la solicitud.");
  }
  return body;
}

async function postJson(url, payload, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new Error(body.error || "No fue posible completar la solicitud.");
  }
  return body;
}

function renderOwnerHelp() {
  const ownerSelect = document.getElementById("create-owner");
  const ownerHelp = document.getElementById("owner-help");
  const selected = currentSession?.session?.contexts?.find((context) => context.schema_name === ownerSelect?.value);
  if (ownerHelp) {
    ownerHelp.textContent = selected?.ayuda || "";
    ownerHelp.className = "field-message";
  }
}

function syncServiceSelection(serviceId) {
  const ownerSelect = document.getElementById("create-owner");
  if (!ownerSelect || !serviceId) return;
  ownerSelect.value = serviceId;
  renderOwnerHelp();
}

function validateRutField(showOkMessage = false) {
  const rutInput = document.getElementById("create-rut");
  if (!rutInput) return false;

  const rawValue = rutInput.value;
  const normalized = normalizeRut(rawValue);
  rutInput.value = formatRutForDisplay(rawValue);

  if (!normalized) {
    clearMessage("create-user-message");
    setFieldMessage("rut-message");
    return false;
  }

  if (!isValidRut(normalized)) {
    const message = "El RUT no es válido. Debe tener formato ##.###.###-# con módulo 11, salvo identificadores especiales con prefijo P.";
    showMessage("create-user-message", message, "error");
    setTopbarMessage(message);
    setFieldMessage("rut-message", message, "error");
    return false;
  }

  if (showOkMessage) {
    const message = normalized.startsWith("P")
      ? "Identificador especial validado."
      : `RUT validado correctamente: ${rutInput.value}`;
    showMessage("create-user-message", message, "ok");
    setTopbarMessage(message);
    setFieldMessage("rut-message", message, "ok");
  } else {
    clearMessage("create-user-message");
    setFieldMessage("rut-message");
  }

  return true;
}

function validateServiceIdField(showOkMessage = false) {
  const input = document.getElementById("service-id");
  if (!input) return false;
  input.value = formatServiceId(input.value);
  if (!input.value) {
    setFieldMessage("service-id-message", "Use tres letras y tres cifras. El formato operativo es xxx###.");
    return false;
  }
  if (!isValidServiceId(input.value)) {
    const message = "El ID debe tener formato xxx###, por ejemplo rlg000 o tmp999.";
    setFieldMessage("service-id-message", message, "error");
    return false;
  }
  if (showOkMessage) {
    setFieldMessage("service-id-message", "ID de servicio validado.", "ok");
  } else {
    setFieldMessage("service-id-message", "Use tres letras y tres cifras. El formato operativo es xxx###.");
  }
  return true;
}

function clearServiceRepresentative() {
  const nameInput = document.getElementById("service-person-name");
  if (nameInput) nameInput.value = "";
  setFieldMessage("service-rut-message");
}

async function lookupServiceRepresentative(showSuccess = true) {
  const rutInput = document.getElementById("service-rut");
  const nameInput = document.getElementById("service-person-name");
  if (!rutInput || !nameInput) return null;

  rutInput.value = formatRutForDisplay(rutInput.value);
  const rut = normalizeRut(rutInput.value);
  if (!rut) {
    clearServiceRepresentative();
    return null;
  }

  if (!isValidRut(rut)) {
    const message = "El RUT identificador no es válido.";
    setFieldMessage("service-rut-message", message, "error");
    nameInput.value = "";
    return null;
  }

  try {
    const data = await postJson(ENDPOINTS.personaLookup, { rut }, currentSession?.token);
    nameInput.value = data.persona?.nombre_completo || "";
    rutInput.value = formatRutForDisplay(rut);
    if (showSuccess) {
      setFieldMessage("service-rut-message", "Persona representante encontrada.", "ok");
    } else {
      setFieldMessage("service-rut-message");
    }
    return data.persona || null;
  } catch (error) {
    nameInput.value = "";
    setFieldMessage("service-rut-message", error.message, "error");
    return null;
  }
}

function openServiceModal() {
  const modal = document.getElementById("service-modal");
  if (!modal) return;
  modal.hidden = false;
  clearMessage("service-create-message");
  setFieldMessage("service-id-message", "Use tres letras y tres cifras. El formato operativo es xxx###.");
  setFieldMessage("service-rut-message");
  document.getElementById("service-id")?.focus();
}

function closeServiceModal() {
  const modal = document.getElementById("service-modal");
  const form = document.getElementById("service-create-form");
  if (form) form.reset();
  clearMessage("service-create-message");
  clearServiceRepresentative();
  setFieldMessage("service-id-message", "Use tres letras y tres cifras. El formato operativo es xxx###.");
  if (modal) modal.hidden = true;
}

function renderSession() {
  const meta = document.getElementById("auth-session-meta");
  const title = document.getElementById("auth-session-title");
  const logoImage = document.getElementById("logia-logo-image");
  const ownerSelect = document.getElementById("create-owner");
  const superuserInput = document.getElementById("create-superuser");
  const formInputs = Array.from(document.querySelectorAll("#user-create-form input, #user-create-form select, #user-create-form button"));
  const modalButton = document.getElementById("open-service-modal-btn");
  const assignPermissionsButton = document.getElementById("assign-permissions-btn");

  if (!currentSession?.session) {
    meta.innerHTML = `<div><dt>Estado</dt><dd>Sin sesión</dd></div>`;
    title.textContent = "Sesión requerida";
    logoImage.src = "./styles/nidaba-mark.svg";
    logoImage.alt = "Logo del servicio";
    formInputs.forEach((input) => { input.disabled = true; });
    if (modalButton) modalButton.disabled = true;
    if (assignPermissionsButton) assignPermissionsButton.disabled = true;
    renderTopbar();
    return;
  }

  const { user, contexts, activeContext } = currentSession.session;

  if (!user.es_superusuario) {
    showMessage("session-message", "Esta función está disponible solo para superusuario.", "error");
    formInputs.forEach((input) => { input.disabled = true; });
    if (modalButton) modalButton.disabled = true;
    if (assignPermissionsButton) assignPermissionsButton.disabled = true;
  } else {
    clearMessage("session-message");
    formInputs.forEach((input) => { input.disabled = false; });
    if (modalButton) modalButton.disabled = false;
    if (assignPermissionsButton) assignPermissionsButton.disabled = false;
  }

  title.textContent = user.nombre_completo || user.username;
  logoImage.src = activeContext?.logo_image || "./styles/nidaba-mark.svg";
  logoImage.alt = activeContext?.nombre_visible
    ? `Logo de ${activeContext.nombre_visible}`
    : "Logo del servicio";

  meta.innerHTML = `
    <div><dt>Usuario</dt><dd>${user.username}</dd></div>
    <div><dt>RUT</dt><dd>${user.persona_rut}</dd></div>
    <div><dt>Superusuario</dt><dd>${user.es_superusuario ? "Sí" : "No"}</dd></div>
    <div><dt>Contexto</dt><dd>${activeContext?.nombre_visible || "Sin contexto"}</dd></div>
  `;

  ownerSelect.innerHTML = (contexts || [])
    .map((context) => {
      const selected = context.schema_name === activeContext?.schema_name ? "selected" : "";
      return `<option value="${context.schema_name}" ${selected}>${context.nombre_visible || context.nombre}</option>`;
    })
    .join("");

  if (lastCreatedServiceId && (contexts || []).some((context) => context.schema_name === lastCreatedServiceId)) {
    ownerSelect.value = lastCreatedServiceId;
  }

  renderOwnerHelp();

  superuserInput.checked = false;
  superuserInput.disabled = !user.es_superusuario;
  renderTopbar();
}

async function refreshSession() {
  if (!currentSession?.token) {
    renderSession();
    return;
  }

  try {
    const refreshed = await refreshStoredSession(currentSession);
    if (!refreshed) {
      clearSession();
      renderSession();
      return;
    }
    currentSession = refreshed;
    renderSession();
  } catch (error) {
    clearSession();
    renderSession();
    showMessage("session-message", error.message, "error");
    setTopbarMessage(error.message);
  }
}

async function ensureUserServiceLink(personaRut, servicioId) {
  const sql = `
    insert into root.usuarios_servicios (
      persona_rut,
      servicio_id,
      es_contexto_principal,
      activo
    )
    values (
      ${sqlText(personaRut)},
      ${sqlText(servicioId)},
      true,
      true
    )
    on conflict (persona_rut, servicio_id) do update
      set es_contexto_principal = true,
          activo = true,
          updated_at = now()
    returning persona_rut, servicio_id, es_contexto_principal, activo
  `;

  const result = await executeSQL(sql, requestId("usuarios-servicios-upsert"), "nidaba-usuarios-servicios");
  return result.rows?.[0] || null;
}

async function assignPermissionsToSelectedService() {
  const ownerSelect = document.getElementById("create-owner");
  const servicioId = normalizeServiceId(ownerSelect?.value);
  if (!servicioId) {
    throw new Error("Debe seleccionar primero el servicio que desea aprovisionar.");
  }

  const sql = `
    call root.sp_provision_servicio_schema(
      ${sqlText(servicioId)},
      ${sqlText(currentSession?.session?.user?.username || "frontend")}
    );
  `;

  await executeSQL(sql, requestId("provision-servicio"), "nidaba-provision-servicio");
  return {
    servicio_id: servicioId,
    ok: true,
    message: `Esquema ${servicioId} aprovisionado correctamente.`,
  };
}

document.getElementById("go-home-btn")?.addEventListener("click", () => {
  window.location.href = "./index.html";
});

document.getElementById("back-home-btn")?.addEventListener("click", () => {
  window.location.href = "./index.html";
});

document.getElementById("go-personas-btn")?.addEventListener("click", () => {
  window.location.href = "./personas.html";
});

document.getElementById("logout-btn")?.addEventListener("click", () => {
  clearSession();
  window.location.href = "./index.html";
});

document.getElementById("create-superuser")?.addEventListener("change", (event) => {
  const ownerSelect = document.getElementById("create-owner");
  ownerSelect.disabled = event.currentTarget.checked;
});

document.getElementById("create-owner")?.addEventListener("change", () => {
  renderOwnerHelp();
});

document.getElementById("assign-permissions-btn")?.addEventListener("click", async () => {
  clearMessage("create-user-message");
  if (!currentSession?.session?.user?.es_superusuario) {
    showMessage("create-user-message", "Esta función requiere privilegios de superusuario.", "error");
    return;
  }

  try {
    const data = await assignPermissionsToSelectedService();
    showMessage("create-user-message", data.message || "Permisos actualizados correctamente.", "ok");
    setTopbarMessage(data.message || "Permisos actualizados correctamente.");
  } catch (error) {
    showMessage("create-user-message", error.message, "error");
    setTopbarMessage(error.message);
  }
});

document.getElementById("create-rut")?.addEventListener("input", (event) => {
  event.currentTarget.value = formatRutWhileTyping(event.currentTarget.value);
});

document.getElementById("create-rut")?.addEventListener("blur", () => {
  validateRutField(true);
});

document.getElementById("open-service-modal-btn")?.addEventListener("click", () => {
  openServiceModal();
});

document.querySelectorAll("[data-close-service-modal]").forEach((button) => {
  button.addEventListener("click", () => closeServiceModal());
});

document.getElementById("service-id")?.addEventListener("input", (event) => {
  event.currentTarget.value = formatServiceId(event.currentTarget.value);
});

document.getElementById("service-id")?.addEventListener("blur", () => {
  validateServiceIdField(true);
});

document.getElementById("service-rut")?.addEventListener("input", (event) => {
  event.currentTarget.value = formatRutWhileTyping(event.currentTarget.value);
});

document.getElementById("service-rut")?.addEventListener("blur", async () => {
  await lookupServiceRepresentative(true);
});

document.getElementById("lookup-service-person-btn")?.addEventListener("click", async () => {
  await lookupServiceRepresentative(true);
});

document.getElementById("user-create-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage("create-user-message");

  if (!currentSession?.token) {
    showMessage("create-user-message", "Debe iniciar sesión antes de crear usuarios.", "error");
    return;
  }

  if (!validateRutField(false)) {
    return;
  }

  const rut = normalizeRut(event.currentTarget.rut.value);

  const payload = {
    rut,
    nombres: event.currentTarget.nombres.value.trim(),
    email: event.currentTarget.email.value.trim(),
    username: event.currentTarget.username.value.trim(),
    password: event.currentTarget.password.value,
    owner: event.currentTarget.owner.value,
    es_superusuario: event.currentTarget.es_superusuario.checked,
  };

  try {
    const data = await postJson(ENDPOINTS.createUser, payload, currentSession.token);
    if (!payload.es_superusuario) {
      await ensureUserServiceLink(rut, payload.owner);
    }
    showMessage("create-user-message", data.message || "Usuario creado correctamente.", "ok");
    setTopbarMessage(data.message || "Usuario creado correctamente.");
    event.currentTarget.reset();
    renderSession();
  } catch (error) {
    showMessage("create-user-message", error.message, "error");
    setTopbarMessage(error.message);
  }
});

document.getElementById("service-create-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage("service-create-message");

  if (!currentSession?.token) {
    showMessage("service-create-message", "Debe iniciar sesión antes de crear servicios.", "error");
    return;
  }

  if (!validateServiceIdField(false)) {
    showMessage("service-create-message", "Revise el ID del servicio.", "error");
    return;
  }

  const persona = await lookupServiceRepresentative(false);
  if (!persona) {
    showMessage("service-create-message", "Debe indicar un RUT existente en personas para representar el servicio.", "error");
    return;
  }

  const payload = {
    servicio_id: normalizeServiceId(event.currentTarget.servicio_id.value),
    nombre: event.currentTarget.nombre.value.trim(),
    persona_rut: normalizeRut(event.currentTarget.persona_rut.value),
    ayuda: event.currentTarget.ayuda.value.trim(),
  };

  try {
    const data = await postJson(ENDPOINTS.createService, payload, currentSession.token);
    lastCreatedServiceId = data.service?.servicio_id || payload.servicio_id;
    showMessage("service-create-message", data.message || "Servicio creado correctamente.", "ok");
    setTopbarMessage(data.message || "Servicio creado correctamente.");
    await refreshSession();
    syncServiceSelection(lastCreatedServiceId);
    closeServiceModal();
  } catch (error) {
    showMessage("service-create-message", error.message, "error");
    setTopbarMessage(error.message);
  }
});

currentSession = loadSession();
renderSession();
setTopbarMessage("Sin novedades.");
refreshSession();
