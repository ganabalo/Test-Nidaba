import {
  changePassword,
  clearSession as clearStoredSession,
  loadPublishedPersonas,
  loadSession,
  loginWithRoot,
  refreshStoredSession,
  requestPasswordRecovery,
  saveSession,
  switchStoredContext,
} from "./auth.js";

const PANELS = ["login", "recover", "change"];

let currentSession = null;

function setTopbarMessage(text) {
  const node = document.getElementById("topbar-status");
  if (node) node.textContent = text || "Sin novedades.";
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

function setActivePanel(panelName) {
  document.querySelectorAll(".auth-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.panel === panelName);
  });

  PANELS.forEach((name) => {
    const panel = document.getElementById(`panel-${name}`);
    if (panel) panel.classList.toggle("is-active", name === panelName);
  });
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

function renderActionAccess() {
  const createAction = document.getElementById("action-create-user");
  const personasAction = document.getElementById("action-manage-personas");
  const enabled = Boolean(currentSession?.session?.user?.es_superusuario);
  if (createAction) createAction.disabled = !enabled;
  if (personasAction) personasAction.disabled = !enabled;
}

function renderSession() {
  const meta = document.getElementById("session-meta");
  const selector = document.getElementById("context-selector");
  const logoutButton = document.getElementById("logout-btn");
  const authLogoutButton = document.getElementById("auth-logout-btn");
  const authSession = document.getElementById("auth-session");
  const authCard = document.querySelector(".auth-card");
  const authSessionMeta = document.getElementById("auth-session-meta");
  const authSessionTitle = document.getElementById("auth-session-title");
  const openChangeButton = document.getElementById("auth-open-change-btn");
  const heroLabel = document.getElementById("hero-logia-label");
  const logoImage = document.getElementById("logia-logo-image");

  if (!currentSession?.session) {
    meta.innerHTML = `<div><dt>Estado</dt><dd>Sin sesión</dd></div>`;
    authSessionMeta.innerHTML = `<div><dt>Estado</dt><dd>Sin sesión</dd></div>`;
    authSession.hidden = true;
    authCard.classList.remove("is-authenticated");
    selector.innerHTML = "";
    selector.disabled = true;
    logoutButton.disabled = true;
    authLogoutButton.disabled = true;
    openChangeButton.disabled = true;
    heroLabel.textContent = "Tesorería del servicio";
    logoImage.src = "./styles/nidaba-mark.svg";
    logoImage.alt = "Logo del servicio";
    renderTopbar();
    renderActionAccess();
    renderPersonas([]);
    return;
  }

  const { user, activeContext, contexts } = currentSession.session;
  logoutButton.disabled = false;
  authLogoutButton.disabled = false;
  openChangeButton.disabled = false;
  authSession.hidden = false;
  authCard.classList.add("is-authenticated");
  authSessionTitle.textContent = user.nombre_completo || user.username;
  heroLabel.textContent = activeContext?.nombre_visible || "Tesorería del servicio";
  logoImage.src = activeContext?.logo_image || "./styles/nidaba-mark.svg";
  logoImage.alt = activeContext?.nombre_visible
    ? `Logo de ${activeContext.nombre_visible}`
    : "Logo del servicio";

  meta.innerHTML = `
    <div><dt>Usuario</dt><dd>${user.username}</dd></div>
    <div><dt>Persona</dt><dd>${user.nombre_completo}</dd></div>
    <div><dt>RUT</dt><dd>${user.persona_rut}</dd></div>
    <div><dt>Superusuario</dt><dd>${user.es_superusuario ? "Sí" : "No"}</dd></div>
    <div><dt>Servicio</dt><dd>${activeContext?.nombre_visible || "Sin contexto"}</dd></div>
  `;

  authSessionMeta.innerHTML = `
    <div><dt>Usuario</dt><dd>${user.username}</dd></div>
    <div><dt>RUT</dt><dd>${user.persona_rut}</dd></div>
    <div><dt>Servicio</dt><dd>${activeContext?.nombre_visible || "Pendiente de selección"}</dd></div>
    <div><dt>Contextos</dt><dd>${contexts?.length || 0}</dd></div>
    <div><dt>Ingreso</dt><dd>${currentSession.session.auth_trace?.method || "desconocido"}</dd></div>
  `;

  selector.disabled = !contexts?.length;
  selector.innerHTML = (contexts || [])
    .map((context) => {
      const selected = activeContext?.schema_name === context.schema_name ? "selected" : "";
      return `<option value="${context.schema_name}" ${selected}>${context.nombre_visible || context.nombre}</option>`;
    })
    .join("");

  renderTopbar();
  renderActionAccess();
}

function renderPersonas(rows) {
  const body = document.getElementById("personas-body");
  const title = document.getElementById("personas-title");
  const logiaName = currentSession?.session?.activeContext?.nombre_visible || "el servicio seleccionado";

  title.textContent = `Cuentas de personas en ${logiaName}`;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6">No hay filas visibles en este contexto.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${row.rut}</td>
        <td>${row.nombre_completo}</td>
        <td>${row.email || ""}</td>
        <td>${row.telefono || ""}</td>
        <td>${row.tipo_persona}</td>
        <td>${row.activa ? "Sí" : "No"}</td>
      </tr>
    `)
    .join("");
}

async function loadPersonas() {
  if (!currentSession?.token) {
    renderPersonas([]);
    return;
  }

  if (!currentSession?.session?.activeContext?.schema_name) {
    renderPersonas([]);
    showMessage("context-message", "Seleccione el servicio con el que desea trabajar.", "error");
    return;
  }

  try {
    const rows = await loadPublishedPersonas(currentSession.session.activeContext.schema_name);
    renderPersonas(rows);
    clearMessage("context-message");
    setTopbarMessage(`Datos cargados para ${currentSession.session.activeContext?.nombre_visible || "el servicio activo"}.`);
  } catch (error) {
    showMessage("context-message", error.message, "error");
    setTopbarMessage(error.message);
  }
}

async function refreshSessionFromServer() {
  if (!currentSession?.token) return;
  try {
    const refreshed = await refreshStoredSession(currentSession);
    if (!refreshed) {
      clearSession();
      renderSession();
      return;
    }
    currentSession = refreshed;
    renderSession();
    await loadPersonas();
  } catch {
    clearSession();
    renderSession();
  }
}

document.querySelectorAll(".auth-tab").forEach((button) => {
  button.addEventListener("click", () => setActivePanel(button.dataset.panel));
});

document.getElementById("login-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage("login-message");

  const payload = {
    username: event.currentTarget.username.value.trim(),
    password: event.currentTarget.password.value,
  };

  try {
    const data = await loginWithRoot(payload.username, payload.password);
    const session = data.session;
    currentSession = saveSession({ token: data.token, session });
    renderSession();
    await loadPersonas();
    if ((session.contexts || []).length > 1) {
      showMessage("context-message", "Ingreso correcto. Puede cambiar el servicio si lo necesita.", "ok");
    }
    showMessage("login-message", data.message || "Ingreso correcto.", "ok");
    setTopbarMessage(data.message || "Ingreso correcto.");
  } catch (error) {
    showMessage("login-message", error.message, "error");
    setTopbarMessage(error.message);
  }
});

document.getElementById("recover-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage("recover-message");

  try {
    const data = await requestPasswordRecovery(event.currentTarget.email.value.trim());
    showMessage(
      "recover-message",
      data.token_dev
        ? `${data.message} Token dev: ${data.token_dev}`
        : data.message || "Solicitud de recuperación enviada.",
      "ok"
    );
    setTopbarMessage(data.message || "Solicitud de recuperación registrada.");
  } catch (error) {
    showMessage("recover-message", error.message, "error");
    setTopbarMessage(error.message);
  }
});

document.getElementById("change-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage("change-message");

  const username = event.currentTarget.username.value.trim();
  const currentPassword = event.currentTarget.current_password.value;
  const newPassword = event.currentTarget.new_password.value;
  const confirmPassword = event.currentTarget.confirm_password.value;

  if (newPassword !== confirmPassword) {
    showMessage("change-message", "La confirmación de la nueva clave no coincide.", "error");
    return;
  }

  try {
    const data = await changePassword(username, currentPassword, newPassword);
    showMessage("change-message", data.message || "Clave actualizada correctamente.", "ok");
    setTopbarMessage(data.message || "Clave actualizada correctamente.");
    event.currentTarget.reset();
    if (currentSession?.session) {
      document.querySelector(".auth-card")?.classList.add("is-authenticated");
    }
  } catch (error) {
    showMessage("change-message", error.message, "error");
    setTopbarMessage(error.message);
  }
});

document.getElementById("context-selector")?.addEventListener("change", async (event) => {
  if (!currentSession?.token) return;
  clearMessage("context-message");

  try {
    currentSession = switchStoredContext(currentSession, event.currentTarget.value);
    renderSession();
    await loadPersonas();
    showMessage("context-message", "Servicio de trabajo actualizado.", "ok");
    setTopbarMessage("Contexto actualizado correctamente.");
  } catch (error) {
    showMessage("context-message", error.message, "error");
    setTopbarMessage(error.message);
  }
});

document.getElementById("action-create-user")?.addEventListener("click", () => {
  if (!currentSession?.session?.user?.es_superusuario) {
    showMessage("home-message", "Esta función requiere privilegios de superusuario.", "error");
    setTopbarMessage("Esta función requiere privilegios de superusuario.");
    return;
  }
  window.location.href = "./usuarios.html";
});

document.getElementById("action-manage-personas")?.addEventListener("click", () => {
  if (!currentSession?.session?.user?.es_superusuario) {
    showMessage("home-message", "Esta función requiere privilegios de superusuario.", "error");
    setTopbarMessage("Esta función requiere privilegios de superusuario.");
    return;
  }
  window.location.href = "./personas.html";
});

document.getElementById("action-budget-assignment")?.addEventListener("click", () => {
  if (!currentSession?.session) {
    showMessage("home-message", "Debe iniciar sesión antes de entrar a asignación presupuestaria.", "error");
    setTopbarMessage("Debe iniciar sesión antes de entrar a asignación presupuestaria.");
    return;
  }
  if (!currentSession?.session?.activeContext?.schema_name) {
    showMessage("home-message", "Seleccione primero el servicio con el que desea trabajar.", "error");
    setTopbarMessage("Seleccione primero el servicio con el que desea trabajar.");
    return;
  }
  window.location.href = "./asignacion_presupuestaria.html";
});

document.getElementById("refresh-personas")?.addEventListener("click", async () => {
  clearMessage("context-message");
  await loadPersonas();
});

document.getElementById("logout-btn")?.addEventListener("click", () => {
  clearSession();
  renderSession();
  showMessage("login-message", "Sesión cerrada.", "ok");
  setTopbarMessage("Sesión cerrada.");
});

document.getElementById("auth-logout-btn")?.addEventListener("click", () => {
  clearSession();
  renderSession();
  showMessage("login-message", "Sesión cerrada.", "ok");
  setTopbarMessage("Sesión cerrada.");
});

document.getElementById("auth-open-change-btn")?.addEventListener("click", () => {
  document.querySelector(".auth-card")?.classList.remove("is-authenticated");
  setActivePanel("change");
  const sessionUser = currentSession?.session?.user?.username || "";
  const input = document.getElementById("change-username");
  if (input) input.value = sessionUser;
});

currentSession = loadSession();
renderSession();
setTopbarMessage("Sin novedades.");
refreshSessionFromServer();
