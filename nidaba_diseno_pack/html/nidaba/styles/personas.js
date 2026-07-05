import {
  clearSession as clearStoredSession,
  loadSession,
  refreshStoredSession,
  saveSession,
} from "./auth.js";

const ENDPOINTS = {
  list: "/nidaba-api/admin/personas",
  create: "/nidaba-api/admin/personas/create",
  update: "/nidaba-api/admin/personas/update",
  remove: "/nidaba-api/admin/personas/delete",
};

let currentSession = null;
let personsCache = [];
let selectedRut = null;

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
  if (raw.startsWith("P")) return raw.slice(0, 50);
  const cleaned = raw.replace(/[^0-9K]/g, "").slice(0, 9);
  if (cleaned.length <= 2) return cleaned;
  if (cleaned.length <= 5) return `${cleaned.slice(0, 2)}.${cleaned.slice(2)}`;
  if (cleaned.length <= 8) return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 5)}.${cleaned.slice(5)}`;
  return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 5)}.${cleaned.slice(5, 8)}-${cleaned.slice(8)}`;
}

function isValidRut(rut) {
  const value = normalizeRut(rut);
  if (!value) return false;
  if (value.startsWith("P")) return value.length <= 50;
  if (!/^[0-9]{8}[0-9K]$/.test(value)) return false;

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

function suggestNombreCompleto() {
  const type = document.getElementById("person-type")?.value || "N";
  const target = document.getElementById("person-name");
  if (!target) return;
  if (target.dataset.locked === "true") return;

  if (type === "J") {
    target.value = document.getElementById("person-razon-social")?.value.trim() || "";
    return;
  }

  const parts = [
    document.getElementById("person-nombres")?.value.trim() || "",
    document.getElementById("person-apellido-paterno")?.value.trim() || "",
    document.getElementById("person-apellido-materno")?.value.trim() || "",
  ].filter(Boolean);
  target.value = parts.join(" ");
}

function validateRutField(showOkMessage = false) {
  const rutInput = document.getElementById("person-rut");
  if (!rutInput) return false;
  rutInput.value = formatRutForDisplay(rutInput.value);
  const rut = normalizeRut(rutInput.value);

  if (!rut) {
    setFieldMessage("person-rut-message");
    return false;
  }

  if (!isValidRut(rut)) {
    const message = "El RUT no es válido.";
    setFieldMessage("person-rut-message", message, "error");
    showMessage("person-form-message", message, "error");
    setTopbarMessage(message);
    return false;
  }

  if (showOkMessage) {
    const message = rut.startsWith("P") ? "Identificador especial validado." : `RUT validado: ${rutInput.value}`;
    setFieldMessage("person-rut-message", message, "ok");
    setTopbarMessage(message);
  } else {
    setFieldMessage("person-rut-message");
  }

  return true;
}

function renderSession() {
  const meta = document.getElementById("auth-session-meta");
  const title = document.getElementById("auth-session-title");
  const logoImage = document.getElementById("logia-logo-image");
  const inputs = Array.from(document.querySelectorAll("#person-form input, #person-form select, #person-form textarea, #person-form button"));
  const extraButtons = ["refresh-persons-btn", "new-person-btn", "go-usuarios-btn"];

  if (!currentSession?.session) {
    meta.innerHTML = `<div><dt>Estado</dt><dd>Sin sesión</dd></div>`;
    title.textContent = "Sesión requerida";
    logoImage.src = "./styles/nidaba-mark.svg";
    logoImage.alt = "Logo del servicio";
    inputs.forEach((input) => { input.disabled = true; });
    extraButtons.forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.disabled = true;
    });
    renderTopbar();
    return;
  }

  const { user, activeContext } = currentSession.session;
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

  if (!user.es_superusuario) {
    showMessage("session-message", "Esta función está disponible solo para superusuario.", "error");
    inputs.forEach((input) => { input.disabled = true; });
    extraButtons.forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.disabled = true;
    });
  } else {
    clearMessage("session-message");
    inputs.forEach((input) => { input.disabled = false; });
    extraButtons.forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.disabled = false;
    });
  }

  renderTopbar();
}

function collectPayload() {
  const form = document.getElementById("person-form");
  const rut = normalizeRut(form.rut.value);
  const tipo = form.tipo_persona.value;
  return {
    rut,
    owner: "global",
    tipo_persona: tipo,
    nombres: form.nombres.value.trim(),
    apellido_paterno: form.apellido_paterno.value.trim(),
    apellido_materno: form.apellido_materno.value.trim(),
    razon_social: form.razon_social.value.trim(),
    nombre_completo: form.nombre_completo.value.trim(),
    email: form.email.value.trim(),
    telefono: form.telefono.value.trim(),
    identificador_fiscal: form.identificador_fiscal.value.trim(),
    observacion: form.observacion.value.trim(),
    activa: form.activa.checked,
  };
}

function fillForm(person) {
  const form = document.getElementById("person-form");
  selectedRut = person?.rut || null;
  form.rut.value = formatRutForDisplay(person?.rut || "");
  form.rut.disabled = Boolean(person);
  form.owner.value = person?.owner || "global";
  form.tipo_persona.value = person?.tipo_persona || "N";
  form.activa.checked = person?.activa ?? true;
  form.nombres.value = person?.nombres || "";
  form.apellido_paterno.value = person?.apellido_paterno || "";
  form.apellido_materno.value = person?.apellido_materno || "";
  form.razon_social.value = person?.razon_social || "";
  form.nombre_completo.value = person?.nombre_completo || "";
  form.nombre_completo.dataset.locked = person?.nombre_completo ? "true" : "false";
  form.email.value = person?.email || "";
  form.telefono.value = person?.telefono || "";
  form.identificador_fiscal.value = person?.identificador_fiscal || "";
  form.observacion.value = person?.observacion || "";
  setFieldMessage("person-rut-message");
  clearMessage("person-form-message");
  renderRows();
}

function resetForm() {
  selectedRut = null;
  document.getElementById("person-form")?.reset();
  document.getElementById("person-owner").value = "global";
  document.getElementById("person-active").checked = true;
  document.getElementById("person-rut").disabled = false;
  document.getElementById("person-name").dataset.locked = "false";
  setFieldMessage("person-rut-message");
  clearMessage("person-form-message");
  renderRows();
}

function renderRows() {
  const body = document.getElementById("persons-table-body");
  const query = String(document.getElementById("person-search")?.value || "").trim().toLowerCase();
  const rows = personsCache.filter((row) => {
    if (!query) return true;
    return [
      row.rut,
      row.nombre_completo,
      row.razon_social,
      row.email,
      row.nombres,
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5">No hay personas que coincidan con la búsqueda.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr data-rut="${row.rut}" class="${row.rut === selectedRut ? "is-selected" : ""}">
      <td>${formatRutForDisplay(row.rut)}</td>
      <td>${row.nombre_completo}</td>
      <td>${row.tipo_persona === "J" ? "Jurídica" : "Natural"}</td>
      <td>${row.email || ""}</td>
      <td>${row.activa ? "Activa" : "Inactiva"}</td>
    </tr>
  `).join("");

  body.querySelectorAll("tr[data-rut]").forEach((rowNode) => {
    rowNode.addEventListener("click", () => {
      const person = personsCache.find((item) => item.rut === rowNode.dataset.rut);
      if (person) fillForm(person);
    });
  });
}

async function refreshPersons() {
  if (!currentSession?.token) return;
  try {
    const data = await getJson(ENDPOINTS.list, currentSession.token);
    personsCache = data.rows || [];
    renderRows();
    clearMessage("persons-table-message");
    setTopbarMessage("Listado de personas actualizado.");
  } catch (error) {
    showMessage("persons-table-message", error.message, "error");
    setTopbarMessage(error.message);
  }
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

document.getElementById("back-home-btn")?.addEventListener("click", () => {
  window.location.href = "./index.html";
});

document.getElementById("go-usuarios-btn")?.addEventListener("click", () => {
  window.location.href = "./usuarios.html";
});

document.getElementById("logout-btn")?.addEventListener("click", () => {
  clearSession();
  window.location.href = "./index.html";
});

document.getElementById("new-person-btn")?.addEventListener("click", () => {
  resetForm();
  setTopbarMessage("Formulario preparado para una nueva persona.");
});

document.getElementById("refresh-persons-btn")?.addEventListener("click", async () => {
  await refreshPersons();
});

document.getElementById("person-search")?.addEventListener("input", () => {
  renderRows();
});

document.getElementById("person-rut")?.addEventListener("input", (event) => {
  event.currentTarget.value = formatRutWhileTyping(event.currentTarget.value);
});

document.getElementById("person-rut")?.addEventListener("blur", () => {
  validateRutField(true);
});

document.getElementById("person-type")?.addEventListener("change", () => {
  suggestNombreCompleto();
});

["person-nombres", "person-apellido-paterno", "person-apellido-materno", "person-razon-social"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", () => {
    suggestNombreCompleto();
  });
});

document.getElementById("person-name")?.addEventListener("input", (event) => {
  event.currentTarget.dataset.locked = event.currentTarget.value.trim() ? "true" : "false";
});

document.getElementById("person-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage("person-form-message");

  if (!currentSession?.token) {
    showMessage("person-form-message", "Debe iniciar sesión antes de grabar personas.", "error");
    return;
  }

  if (!validateRutField(false)) {
    return;
  }

  const payload = collectPayload();
  const endpoint = selectedRut ? ENDPOINTS.update : ENDPOINTS.create;

  try {
    const data = await postJson(endpoint, payload, currentSession.token);
    showMessage("person-form-message", data.message || "Persona guardada correctamente.", "ok");
    setTopbarMessage(data.message || "Persona guardada correctamente.");
    await refreshPersons();
    const refreshed = personsCache.find((item) => item.rut === payload.rut);
    if (refreshed) {
      fillForm(refreshed);
    } else {
      resetForm();
    }
  } catch (error) {
    showMessage("person-form-message", error.message, "error");
    setTopbarMessage(error.message);
  }
});

document.getElementById("delete-person-btn")?.addEventListener("click", async () => {
  if (!selectedRut) {
    showMessage("person-form-message", "Seleccione una persona antes de eliminar.", "error");
    return;
  }

  if (!currentSession?.token) {
    showMessage("person-form-message", "Debe iniciar sesión antes de eliminar personas.", "error");
    return;
  }

  try {
    const data = await postJson(ENDPOINTS.remove, { rut: selectedRut }, currentSession.token);
    showMessage("person-form-message", data.message || "Persona eliminada correctamente.", "ok");
    setTopbarMessage(data.message || "Persona eliminada correctamente.");
    resetForm();
    await refreshPersons();
  } catch (error) {
    showMessage("person-form-message", error.message, "error");
    setTopbarMessage(error.message);
  }
});

currentSession = loadSession();
renderSession();
resetForm();
setTopbarMessage("Sin novedades.");
refreshSession().then(() => refreshPersons());
