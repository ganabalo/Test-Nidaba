const runtimeConfig = window.NIDABA_CONFIG || {};

export const NIDABA_SQL_URL =
  runtimeConfig.sqlUrl ||
  runtimeConfig.SQL_URL ||
  runtimeConfig.apiSqlUrl ||
  "http://192.168.5.8:5678/webhook/ejecuta-sql";

export const NIDABA_AUTH_SQL_URL =
  runtimeConfig.authSqlUrl ||
  runtimeConfig.AUTH_SQL_URL ||
  runtimeConfig.rootSqlUrl ||
  runtimeConfig.ROOT_SQL_URL ||
  NIDABA_SQL_URL;

export const NIDABA_SQL_SOURCE =
  runtimeConfig.sqlSource ||
  runtimeConfig.SQL_SOURCE ||
  "nidaba-frontend";
