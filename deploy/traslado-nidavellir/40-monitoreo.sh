#!/usr/bin/env bash
# 40-monitoreo.sh: mueve la vigilancia de Criterio en Yggdrasil de midgard a
# nidavellir. Lo llama 30-corte.sh; también se puede correr solo.
#
#   bash deploy/traslado-nidavellir/40-monitoreo.sh             # aplicar
#   bash deploy/traslado-nidavellir/40-monitoreo.sh --deshacer  # volver
#
# Qué toca, y nada más (listas entre comillas de un `CLAVE="a b c"`):
#
#   nidavellir /etc/default/yggdrasil-thor
#     THOR_UNIDADES      + arranque, vigía y los dos temporizadores del NAS
#     THOR_CONTENEDORES  + los nueve ves-*
#     THOR_RESPALDOS     + ves-market=<marca del último respaldo al NAS>
#   nidavellir /etc/default/yggdrasil-baldr
#     BALDR_JOBS         + ves-market-respaldo-nas.service
#     BALDR_MONTAJES     + /mnt/nas/respaldos
#   midgard /etc/default/yggdrasil-baldr
#     BALDR_JOBS         - ves-market-respaldo-nas.service
#
# Thor no listaba nada de Criterio en midgard: allí avisaba el vigía propio
# (ves-market-vigia). En nidavellir Thor publica `yggdrasil_servicio_ok` y avisa
# Mimir (regla ServicioDeHostCaido), además del vigía, que se muda igual.
#
# Cada fichero se copia a `<fichero>.bak-traslado-<sello>` antes del primer
# cambio. Cada clave tiene que aparecer exactamente una vez: si no, no se toca.

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comun.sh
source "$AQUI/comun.sh"

SELLO=${SELLO:-$(date -u +%Y%m%d-%H%M%S)}
DESHACER=0
[ "${1:-}" = --deshacer ] && DESHACER=1

THOR=/etc/default/yggdrasil-thor
BALDR=/etc/default/yggdrasil-baldr
U_THOR="$ARRANQUE $TEMPORIZADORES"
R_THOR="ves-market=/var/lib/ves-market-respaldo-nas/ultimo-exito"
J_BALDR="ves-market-respaldo-nas.service"
M_BALDR="/mnt/nas/respaldos"

# lista <host> <fichero> <anadir|quitar> <CLAVE> <elementos...>
lista() {
    local host=$1 fichero=$2 op=$3 clave=$4; shift 4
    "en_$host" "sudo python3 - $fichero $op $clave $SELLO $*" <<'PY'
import os, re, shutil, sys
ruta, op, clave, sello, *elementos = sys.argv[1:]
lineas = open(ruta, encoding="utf-8").read().splitlines(keepends=True)
patron = re.compile(r'^' + re.escape(clave) + r'="([^"]*)"\s*$')
idx = [i for i, l in enumerate(lineas) if patron.match(l)]
if len(idx) != 1:
    print(f"{clave}: {len(idx)} líneas en {ruta}, se esperaba 1; no se toca")
    sys.exit(2)
i = idx[0]
antes = patron.match(lineas[i]).group(1).split()
if op == "anadir":
    despues = antes + [e for e in elementos if e not in antes]
else:
    despues = [e for e in antes if e not in elementos]
if despues == antes:
    print(f"{clave}: sin cambios ({len(antes)} elementos)")
    sys.exit(0)
copia = f"{ruta}.bak-traslado-{sello}"
if not os.path.exists(copia):
    shutil.copy2(ruta, copia)
lineas[i] = f'{clave}="{" ".join(despues)}"\n'
with open(ruta, "w", encoding="utf-8", newline="\n") as f:
    f.write("".join(lineas))
print(f"{clave}: {len(antes)} -> {len(despues)} elementos")
PY
}

if [ "$DESHACER" -eq 0 ]; then
    paso "Yggdrasil: la vigilancia de Criterio pasa a nidavellir"
    lista nidavellir $THOR  anadir THOR_UNIDADES     $U_THOR      | sed 's/^/   /'
    lista nidavellir $THOR  anadir THOR_CONTENEDORES $CONTENEDORES | sed 's/^/   /'
    lista nidavellir $THOR  anadir THOR_RESPALDOS    $R_THOR      | sed 's/^/   /'
    lista nidavellir $BALDR anadir BALDR_JOBS        $J_BALDR     | sed 's/^/   /'
    lista nidavellir $BALDR anadir BALDR_MONTAJES    $M_BALDR     | sed 's/^/   /'
    lista midgard    $BALDR quitar BALDR_JOBS        $J_BALDR     | sed 's/^/   /'
else
    paso "Yggdrasil: la vigilancia de Criterio vuelve a midgard"
    lista nidavellir $THOR  quitar THOR_UNIDADES     $U_THOR      | sed 's/^/   /'
    lista nidavellir $THOR  quitar THOR_CONTENEDORES $CONTENEDORES | sed 's/^/   /'
    lista nidavellir $THOR  quitar THOR_RESPALDOS    $R_THOR      | sed 's/^/   /'
    lista nidavellir $BALDR quitar BALDR_JOBS        $J_BALDR     | sed 's/^/   /'
    # BALDR_MONTAJES no se quita: /mnt/nas/respaldos lo usan también los
    # respaldos de los demás productos de nidavellir.
    lista midgard    $BALDR anadir BALDR_JOBS        $J_BALDR     | sed 's/^/   /'
fi
bien "Thor lee su configuración en cada pasada (cada minuto); Baldr, en el próximo arranque"
