import { NIDABA_SQL_SOURCE, NIDABA_SQL_URL } from "./config.js";

export async function executeSQLAt(url, sql, requestId, source = NIDABA_SQL_SOURCE) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sql,
      request_id: requestId,
      source,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.error ||
      `Error HTTP ${response.status} al ejecutar SQL.`
    );
  }

  if (!data?.ok) {
    throw new Error(data?.error || "La consulta SQL no fue ejecutada correctamente.");
  }

  return data;
}

export async function executeSQL(sql, requestId, source = NIDABA_SQL_SOURCE) {
  return executeSQLAt(NIDABA_SQL_URL, sql, requestId, source);
}
