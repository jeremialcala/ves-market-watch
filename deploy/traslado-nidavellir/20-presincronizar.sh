#!/usr/bin/env bash
# 20-presincronizar.sh: copia en caliente los volúmenes de midgard a nidavellir,
# con Criterio EN MARCHA en midgard. La captura no se para.
#
#   bash deploy/traslado-nidavellir/20-presincronizar.sh
#
# La copia que deja NO ES CONSISTENTE: la base estaba escribiendo mientras se
# leía. Sirve para dos cosas:
#   - leer los 13 GB del disco de midgard, que tiene sectores ilegibles, ANTES
#     del corte. Si rsync da un error de E/S, el traslado se replantea (README,
#     «Si el disco de midgard no se deja leer») en vez de descubrirlo con la
#     captura parada;
#   - dejar el grueso en nidavellir, para que el corte copie menos.
#
# Por eso tiene una guarda: se niega a correr si la base o el bus de Criterio
# ya están en marcha en nidavellir, porque los machacaría.
#
# Lee 13 GB del disco de midgard: unos 2-3 min a ~100 MB/s. No correrlo en las
# ventanas de los respaldos (00:30 y 03:30 de Caracas, y domingo a las 05:00).

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comun.sh
source "$AQUI/comun.sh"

paso "Guardas"
contiene '^ves-(timescaledb|rabbitmq)$' "$(en_nidavellir "docker ps --format '{{.Names}}'")" \
    && falla "la base o el bus de Criterio corren en nidavellir: presincronizar los destruiría"
for v in $VOLUMENES; do
    en_nidavellir "docker volume inspect $v >/dev/null 2>&1" || falla "falta el volumen $v en nidavellir: corre antes 10-preparar.sh"
done
h=$(hora_vet)
if { [ "$h" -ge 0020 ] && [ "$h" -le 0115 ]; } || { [ "$h" -ge 0320 ] && [ "$h" -le 0430 ]; }; then
    falla "son las $h en Caracas: ventana de un respaldo. Probar más tarde"
fi
bien "fuera de las ventanas de respaldo ($h en Caracas)"

agente_iniciar
for v in $VOLUMENES; do
    paso "Volumen $v"
    t0=$(date +%s)
    salida=$(mktemp)
    set +e
    sincronizar_volumen "$v" "--stats" > "$salida" 2>&1
    rc=$?
    set -e
    grep -E "^(Number of regular files transferred|Total transferred file size|rsync error|rsync:)" "$salida" | sed 's/^/   /' || true
    rm -f "$salida"
    [ "$rc" -eq 0 ] || falla "rsync de $v salió con $rc. Si es un error de E/S, ver el README antes de seguir"
    bien "$v en $(( $(date +%s) - t0 )) s"
done

echo
echo "Presincronizado. La copia de nidavellir NO es consistente hasta 30-corte.sh."
