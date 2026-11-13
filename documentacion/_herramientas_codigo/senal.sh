#!/bin/bash
# Señal de que el Manual de Usuario terminó: PDF más reciente que contenido-manual.mjs e indice.json y 3 min sin cambios.
cd "$(dirname "$0")/.."
now=$(date +%s)
m=$(stat -c %Y _herramientas/contenido-manual.mjs); i=$(stat -c %Y capturas/indice.json); p=$(stat -c %Y Manual_de_Usuario_LaPreDigital_AMP.pdf)
last=$(find capturas _herramientas/contenido-manual.mjs -type f -printf '%T@\n' | sort -n | tail -1 | cut -d. -f1)
echo "pdf=$((now-p))s contenido=$((now-m))s indice=$((now-i))s ultimo_cambio=$((now-last))s"
if [ $p -gt $m ] && [ $p -gt $i ] && [ $((now-last)) -ge 180 ] && [ $((now-p)) -ge 0 ]; then echo LISTO; fi
