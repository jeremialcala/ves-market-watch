#!/usr/bin/env bash
# 30-corte.sh: el corte. Para Criterio en midgard, copia los datos y lo arranca
# en nidavellir. ES EL ÚNICO PASO CON HUECO DE CAPTURA: unos 5 minutos.
#
#   bash deploy/traslado-nidavellir/30-corte.sh
#   CONFIRMAR=CORTE bash deploy/traslado-nidavellir/30-corte.sh   # sin pregunta
#
# Requisitos: 00-comprobar.sh sin bloqueos, 10-preparar.sh y 20-presincronizar.sh
# hechos. Si algo falla a mitad, el script se detiene y dice en qué paso: la
# salida es 90-vuelta-atras.sh, que sabe volver desde cualquier punto.
#
# Orden y porqué:
#   1. Fuera del receptor de midgard. Su reconciliador despliega cada 5 min lo
#      que tenga en apps.yml: si las apps siguieran ahí, podría levantar en
#      midgard un servicio recién parado. Dos capturas en dos bases, o dos
#      respaldos podando el mismo bucket de B2.
#   2. Fuera las unidades de host de midgard: el vigía avisaría de todo lo que
#      se va a parar, y la unidad de arranque lo levantaría en el próximo corte
#      de luz.
#   3. Parar de fuera hacia dentro: primero quien escribe, luego quien lee, al
#      final el bus y la base, que se apaga limpia. `restart=no` en los nueve
#      para que ni un reinicio de midgard ni de Docker los resucite.
#   4. Recuentos de control con la base parada de escribir, para compararlos al
#      otro lado.
#   5. rsync final con --checksum: la presincronización copió ficheros vivos y
#      solo comparar contenidos garantiza que el destino es idéntico.
#   6. Arrancar en nidavellir con la unidad de arranque, que usa las etiquetas
#      que el receptor de midgard tenía apuntadas.
#   7. Alta en el receptor de nidavellir y unidades de host activadas.
#   8. Monitoreo (40-monitoreo.sh) y verificación (50-verificar.sh).

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comun.sh
source "$AQUI/comun.sh"

DESDE=$(date -u -d '-2 days' '+%Y-%m-%d %H:%M:%S+00')
PASO_ACTUAL="guardas"
trap 'echo; echo "Detenido en el paso: $PASO_ACTUAL (error no previsto). Ver 90-vuelta-atras.sh" >&2' ERR

# Recuentos por hipertabla desde $DESDE, sobre su columna de tiempo. Los mismos
# en los dos hosts: si difieren, la copia no es la base.
recuentos() {
    "en_$1" "DESDE='$DESDE' bash -s" <<'EOF'
set -euo pipefail
q="select h.hypertable_schema||'.'||h.hypertable_name||' '||d.column_name
   from timescaledb_information.hypertables h
   join timescaledb_information.dimensions d using (hypertable_schema, hypertable_name)
   where d.dimension_number = 1 order by 1"
docker exec ves-timescaledb psql -U ves -d ves_market -Atc "$q" | while read -r t c; do
    n=$(docker exec ves-timescaledb psql -U ves -d ves_market -Atc \
        "select count(*) || ' ' || coalesce(max($c)::text, '-') from $t where $c > '$DESDE'")
    echo "$t $n"
done
EOF
}

# --------------------------------------------------------------------------
PASO_ACTUAL="guardas"
paso "Guardas"
h=$(hora_vet); d=$(dia_vet)
if { [ "$h" -ge 0020 ] && [ "$h" -le 0115 ]; } || { [ "$h" -ge 0320 ] && [ "$h" -le 0430 ]; } \
   || { [ "$d" -eq 7 ] && [ "$h" -ge 0450 ] && [ "$h" -le 0600 ]; }; then
    falla "son las $h (día $d) en Caracas: ventana de un respaldo o de la verificación"
fi
bien "fuera de ventanas de respaldo ($h en Caracas)"
en_midgard "systemctl is-active -q ves-market-respaldo-nas.service" && falla "el respaldo al NAS está corriendo en midgard"
contiene 'respaldar full|verificar|restaurar' "$(en_midgard "docker top ves-respaldo -eo args 2>/dev/null" || true)" \
    && falla "ves-respaldo está haciendo un full, una verificación o una restauración"
bien "ningún respaldo en curso"
for v in $VOLUMENES; do
    en_nidavellir "docker volume inspect $v >/dev/null 2>&1" || falla "falta el volumen $v: corre 10-preparar.sh"
done
en_nidavellir "sudo test -f /srv/infra/ves-market/.env && test -x /usr/local/sbin/ves-market-arranque.sh" \
    || falla "nidavellir no está preparado: corre 10-preparar.sh"
contiene '^ves-' "$(en_nidavellir "docker ps --format '{{.Names}}'")" && falla "ya corre algo de Criterio en nidavellir"
bien "nidavellir preparado y sin Criterio en marcha"
p=$(en_midgard "sudo smartctl -A /dev/sda 2>/dev/null | awk '\$2==\"Current_Pending_Sector\"{print \$NF}'")
bien "disco de midgard: ${p:-?} sectores pendientes"

echo
echo "   Va a PARAR Criterio en midgard y arrancarlo en nidavellir."
echo "   Hueco de captura previsto: unos 5 minutos. Acceso público caído lo mismo."
if [ "${CONFIRMAR:-}" != CORTE ]; then
    read -r -p "   Escribe CORTE para seguir: " r
    [ "$r" = CORTE ] || falla "cancelado, no se tocó nada"
fi
T0=$(date +%s)

# --------------------------------------------------------------------------
PASO_ACTUAL="1. receptor de midgard"
paso "$PASO_ACTUAL"
BLOQUES=$(apps_yml midgard extraer)
[ "$(printf '%s' "$BLOQUES" | grep -c '^  - name: ves-')" -eq 6 ] || falla "no extraje los 6 bloques ves-* de midgard"
printf '%s' "$BLOQUES" > "${TMPDIR:-/tmp}/apps-ves-$SELLO.yml"
apps_yml midgard quitar | sed 's/^/   /'
recargar_receptor midgard
bien "midgard ya no despliega Criterio (bloques guardados en ${TMPDIR:-/tmp}/apps-ves-$SELLO.yml)"

PASO_ACTUAL="2. unidades de host de midgard"
paso "$PASO_ACTUAL"
en_midgard "sudo systemctl disable --now $TEMPORIZADORES >/dev/null 2>&1; sudo systemctl disable $ARRANQUE >/dev/null 2>&1; true"
for u in $TEMPORIZADORES $ARRANQUE; do
    e=$(en_midgard "systemctl is-enabled $u 2>/dev/null || true")
    [ "$e" = enabled ] && falla "$u sigue activada en midgard"
done
bien "vigía, respaldo al NAS y arranque desactivados en midgard"

PASO_ACTUAL="3. parar en midgard"
paso "$PASO_ACTUAL"
en_midgard "docker stop -t 30 $PRODUCTORES >/dev/null"
bien "ingestores parados: ya no entra nada nuevo"
# El motor vacía la cola antes de pararse: lo que quede sin procesar en el bus
# viaja igual en su volumen, pero así los recuentos ya incluyen su trabajo.
for _ in $(seq 1 12); do
    pend=$(en_midgard "docker exec ves-rabbitmq sh -c 'for vh in \$(rabbitmqctl -q list_vhosts --no-table-headers); do rabbitmqctl -q list_queues -p \"\$vh\" messages --no-table-headers; done' 2>/dev/null | awk '{s+=\$1} END {print s+0}'")
    [ "${pend:-1}" -eq 0 ] && break
    sleep 5
done
[ "${pend:-1}" -eq 0 ] && bien "bus vacío" || aviso "quedan ${pend:-?} mensajes en el bus; viajan en su volumen"
en_midgard "docker stop -t 30 $CONSUMIDORES >/dev/null"
bien "motor, respaldo, gateway, panel y túnel parados"

PASO_ACTUAL="4. recuentos de control"
paso "$PASO_ACTUAL"
ANTES=$(recuentos midgard)
printf '%s\n' "$ANTES" | sed 's/^/   /'

en_midgard "docker stop -t 30 ves-rabbitmq >/dev/null && docker stop -t 180 ves-timescaledb >/dev/null"
contiene 'database system is shut down' "$(en_midgard "docker logs --tail 20 ves-timescaledb 2>&1")" \
    || falla "TimescaleDB no dejó constancia de un apagado limpio en midgard"
bien "base apagada limpia"
en_midgard "docker update --restart=no $CONTENEDORES >/dev/null"
bien "restart=no en los nueve contenedores de midgard"

PASO_ACTUAL="5. copia final"
paso "$PASO_ACTUAL"
agente_iniciar
for v in $VOLUMENES; do
    t=$(date +%s)
    sincronizar_volumen "$v" "--checksum"
    bien "$v idéntico en nidavellir ($(( $(date +%s) - t )) s)"
done
estado=$(en_midgard "cd / && sudo sh -c 'ls var/lib/cd-receiver/ves-*.json var/lib/ves-market-respaldo-nas/ultimo-exito 2>/dev/null'" | tr '\n' ' ')
copiar_rutas $estado
comparar_huellas $estado
en_nidavellir "sudo sh -c 'chown deploy:deploy /var/lib/cd-receiver/ves-*.json'"
bien "etiquetas del receptor y último respaldo al NAS copiados"

PASO_ACTUAL="6. arrancar en nidavellir"
paso "$PASO_ACTUAL"
en_nidavellir "sudo docker compose --project-directory /srv/infra/ves-market up -d --wait >/dev/null"
bien "base y bus en marcha"
DESPUES=$(recuentos nidavellir)
if [ "$ANTES" = "$DESPUES" ]; then
    bien "recuentos idénticos a los de midgard"
else
    diff <(printf '%s\n' "$ANTES") <(printf '%s\n' "$DESPUES") || true
    falla "los recuentos NO coinciden: no seguir. 90-vuelta-atras.sh --sin-datos"
fi
en_nidavellir "sudo systemctl start $ARRANQUE"
en_nidavellir "systemctl is-active -q $ARRANQUE" || falla "la unidad de arranque falló: journalctl -u $ARRANQUE"
bien "servicios y túnel levantados por $ARRANQUE"
for _ in $(seq 1 24); do
    c=$(en_nidavellir "docker logs ves-tunel 2>&1 | grep -c 'Registered tunnel connection'")
    [ "${c:-0}" -ge 2 ] && break
    sleep 5
done
[ "${c:-0}" -ge 2 ] && bien "túnel conectado ($c conexiones)" || aviso "el túnel aún no registra conexiones"
bien "hueco de captura: $(( $(date +%s) - T0 )) s desde la confirmación"

PASO_ACTUAL="7. receptor y unidades de nidavellir"
paso "$PASO_ACTUAL"
apps_yml nidavellir anadir "$(printf '%s' "$BLOQUES" | base64 -w0)" | sed 's/^/   /'
recargar_receptor nidavellir
en_nidavellir "sudo systemctl enable $ARRANQUE >/dev/null 2>&1 && sudo systemctl enable --now $TEMPORIZADORES >/dev/null 2>&1"
for u in $TEMPORIZADORES $ARRANQUE; do
    [ "$(en_nidavellir "systemctl is-enabled $u 2>/dev/null || true")" = enabled ] || falla "$u no quedó activada en nidavellir"
done
bien "receptor con las 6 apps; vigía, respaldo al NAS y arranque activados"

PASO_ACTUAL="8. monitoreo y verificación"
paso "$PASO_ACTUAL"
bash "$AQUI/40-monitoreo.sh"
bash "$AQUI/50-verificar.sh"

trap - ERR
echo
echo "Corte terminado en $(( $(date +%s) - T0 )) s. Anota en la ADR-0037 el hueco y los recuentos."
