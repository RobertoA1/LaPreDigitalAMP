import fs from 'node:fs';
const f = new URL('./contenido-manual.mjs', import.meta.url);
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('No encontrado: ' + a.slice(0, 60)); s = s.replace(a, b); };

rep("'Costo de campañas pagadas / LEADs nuevos de esas campañas'", "'Costo de campañas (S/) del periodo / Suma de nuevos LEADS atraídos por campañas (pagadas) en el periodo'");
// Login: sin credenciales precargadas
const i = s.indexOf('Los campos aparecen precargados');
const j = s.indexOf("'Al pulsar Ingresar", i);
if (i < 0 || j < 0) throw new Error('login');
const trozo = s.slice(i, j);
const fin = trozo.indexOf("',");
s = s.slice(0, i) + 'Los campos Correo electrónico y Contraseña aparecen vacíos y el usuario escribe sus propias credenciales; solo cuando el servidor corre en modo Demo la pantalla muestra además las cuentas de demostración de la base Demo local.' + s.slice(i + fin);
// Módulo D: opción de filtros y KPI
rep("Cada cambio de filtro vuelve a consultar el DataMart (GET /api/buyer/kpis); los resultados se guardan unos minutos en memoria. El semáforo se calcula con una única tabla de umbrales: Requiere atención (rojo), En seguimiento (amarillo), Favorable (verde) o Sin datos cuando el denominador es 0. La tabla siguiente resume los seis KPI.",
  "Cada cambio de filtro vuelve a consultar el DataMart (GET /api/buyer/kpis); los resultados se guardan unos minutos en memoria. El semáforo se calcula con una única tabla de umbrales: Requiere atención (rojo), En seguimiento (amarillo), Favorable (verde) o Sin datos cuando el denominador es 0. El KPI B-1.2 se calcula con los valores del periodo filtrado: el costo de las campañas (S/) del periodo dividido entre la suma de nuevos LEADS atraídos por campañas pagadas en ese mismo periodo, y por eso cambia al ampliar o reducir las fechas. En la Figura 09 (octubre de 2026) vale S/ 0.00 sobre 553 LEADS nuevos y se muestra Favorable; en la Figura 09-B, con el periodo completo del 01/06/2025 al 31/10/2026, vale S/ 1.77 (S/ 67,700.00 sobre 38,288 LEADS nuevos). La tabla siguiente resume los seis KPI.");
rep("Cada celda lleva el semáforo (punto de color y texto accesible) calculado con los mismos umbrales que las tarjetas; un guion indica que no hay dato.",
  "Cada celda lleva el semáforo (punto de color y texto accesible) calculado con los mismos umbrales que las tarjetas; un guion indica que no hay dato. En «Por campaña», el costo y el costo por lead corresponden al periodo filtrado.");
rep("figuras: [{ archivo: '06a-buyers-filtros-kpi.png', pie: 'Filtros globales y tarjetas de KPI con semáforo' }],",
  "figuras: [{ archivo: '06a-buyers-filtros-kpi.png', pie: 'Filtros globales y tarjetas de KPI con semáforo (octubre de 2026)' }, { archivo: '06a-buyers-filtros-kpi-periodo-completo.png', pie: 'KPI con el periodo completo del 01/06/2025 al 31/10/2026', etiqueta: '09-B' }],");
fs.writeFileSync(f, s);
console.log('ok');
