export function sqlText(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

export function sqlNullable(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned ? sqlText(cleaned) : "null";
}

export function sqlInteger(value, fallback = "null") {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = Number(value);
  return Number.isInteger(normalized) ? String(normalized) : fallback;
}

export function sqlNumeric(value, fallback = "0") {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? String(normalized) : fallback;
}

export function sqlJson(value) {
  return `${sqlText(JSON.stringify(value ?? null))}::jsonb`;
}
