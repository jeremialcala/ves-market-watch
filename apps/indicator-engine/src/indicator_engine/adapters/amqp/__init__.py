# Sin re-exports a propósito.
#
# Reexportar `consumer` aquí creaba un ciclo real: importar
# `application.analizar_revision` → `adapters.amqp.publisher` → ESTE `__init__`
# → `consumer` → `application.process_p2p_snapshot` → `analizar_revision`, aún a
# medio inicializar. Solo se manifestaba si `analizar_revision` era el PRIMERO
# de la cadena en importarse, así que vivió latente hasta que un test lo importó
# directamente.
#
# Todo el repositorio importa ya de los submódulos (`...amqp.publisher`,
# `...amqp.consumer`), de modo que el agregador no aportaba nada salvo el ciclo.
