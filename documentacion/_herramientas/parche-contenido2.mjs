import fs from 'node:fs';
const f = new URL('./contenido-manual.mjs', import.meta.url);
let s = fs.readFileSync(f, 'utf8');
let d = fs.readFileSync(new URL('./modulo-d.txt', import.meta.url), 'utf8');
d = d.replace('Las figuras 16 y 17 muestran', 'Las figuras 17 y 18 muestran').replace('la figura 25 lo muestra', 'la figura 23 lo muestra');
const a = s.indexOf("  {\n    letra: 'D'"), b = s.indexOf("  {\n    letra: 'E'");
if (a < 0 || b < 0) throw new Error('módulo D');
s = s.slice(0, a) + d + s.slice(b);
const rep = (x, y) => { if (!s.includes(x)) throw new Error('No encontrado: ' + x.slice(0, 50)); s = s.replace(x, y); };
rep("Es el único que puede cambiar el proveedor y modelo de IA y el plazo máximo de seguimiento (Configuración). Además puede aprobar y lanzar campañas, cargar resultados de exámenes y confirmar coincidencias dudosas.",
  "Es el único que puede cambiar el proveedor y modelo de IA y el plazo máximo de seguimiento (Configuración). Además puede aprobar y lanzar campañas, cargar resultados de exámenes, confirmar coincidencias dudosas y, en Buyers, cambiar el modo del agente (Automático o Manual) y crear, modificar, eliminar o restaurar las reglas de negocio.");
rep("Aprueba y lanza campañas, carga resultados de exámenes de admisión y confirma coincidencias dudosas. No puede cambiar la configuración de IA.",
  "Aprueba y lanza campañas, carga resultados de exámenes de admisión y confirma coincidencias dudosas. En Buyers cambia el modo del agente y edita las reglas de negocio, igual que el Administrador. No puede cambiar la configuración de IA.");
rep("y aprueba, edita o descarta propuestas del agente Buyer → Lead. Puede redactar borradores de campañas, pero no aprobarlas ni lanzarlas, ni cargar exámenes ni cambiar la configuración.",
  "y aprueba, edita o descarta propuestas del agente Buyer → Lead. En Buyers puede ver las reglas y el estado del agente y pulsar «Ejecutar ahora», pero no cambiar el modo ni editar reglas (solo lectura). Puede redactar borradores de campañas, pero no aprobarlas ni lanzarlas, ni cargar exámenes ni cambiar la configuración. Todos los roles con sesión pueden ver los perfiles de Buyers.");
fs.writeFileSync(f, s);
console.log('ok');
