Nidaba - Paquete para rediseño visual

Objetivo
- Este paquete se entrega a un agente de diseño para proponer mejoras de interfaz y experiencia de uso.
- El foco es visual, de layout, jerarquía, legibilidad y flujo operativo.

Qué incluye
- `html/nidaba/`: fuentes actuales del frontend.
- `dist/nidaba/`: versión compilada lista para revisar.
- `package.json` y `vite.config.js`: referencia de build.

Páginas principales
- `html/nidaba/index.html`: portada, autenticación y portal.
- `html/nidaba/usuarios.html`: administración de usuarios.
- `html/nidaba/personas.html`: mantenimiento de personas.
- `html/nidaba/asignacion_presupuestaria.html`: documento financiero principal actual.

Criterios funcionales importantes
- El sistema opera por contexto de servicio/esquema.
- La pantalla clave hoy es `asignacion_presupuestaria.html`.
- El documento tiene dos bloques principales: `Fuentes` y `Usos`.
- La operación exige control visual de equilibrio entre fuentes y usos.
- El número de documento es automático al grabar.
- La fecha del documento debe ser visible y editable dentro del período.

Qué puede cambiarse libremente
- Estructura visual.
- Distribución de paneles.
- Tipografía, color, espaciado y jerarquía.
- Botoneras, barras de acciones, tablas y bloques de resumen.
- Diseño responsive.

Qué conviene preservar
- Ids y nombres de campos principales, salvo propuesta explícita de refactor.
- Separación conceptual entre autenticación, contexto y operación documental.
- Distinción clara entre documentos `grabados` y `cerrados`.

Referencia práctica
- Si el agente quiere proponer solo diseño, puede trabajar sobre `html/nidaba/`.
- Si quiere revisar el estado ejecutable actual, puede abrir `dist/nidaba/index.html`.
