#!/usr/bin/env python3
"""Documentación viva del historial (fase 03): gitGraph Mermaid multi-rama + bitácora.

A diferencia del generador de una sola rama del skill AI-DLC (primer-padre), este
mapea el ESTADO ACTUAL de varias ramas vivas: cada rama se dibuja en su lane con sus
commits exclusivos, bifurcando en el fork real; los merges entre ramas mapeadas se
dibujan como `merge`. Pensado para GitFlow/stacked branches antes del merge.

Uso (desde la raíz del repo):
    python scripts/gitgraph_branches.py . --branches main,develop,feat-ai-dlc \
        [--out docs/03-implementation/repo-history-gen.md]

Las ramas van de base a hoja (la primera se dibuja como lane principal). Historias
entrelazadas u octopus se marcan como aproximadas; la bitácora es la fuente de verdad.
"""
import argparse
import datetime
import subprocess
import sys

# Trazabilidad tag ↔ versión ↔ decisión (se emite como tabla en el doc generado).
# Actualizar esta constante al cortar cada versión del CHANGELOG.
TAG_NOTES = {
    "v0.1.0": (
        "ADR-0001…0006; 4 PRDs; threat model v1",
        "Línea base documental (Gates 0 y 1 en borrador). Sin código ejecutable",
    ),
    "v0.2.0": (
        "Gates 0 y 1 cerrados (HITL); ADR-0007…0012; ingestor-bcv, "
        "indicator-engine fase 1, ingestor-binance",
        "Tres servicios implementados y verificados en vivo",
    ),
    "v0.3.0": (
        "ADR-0013…0015; ingestor-historico; engine fase 2 (microestructura P2P) "
        "+ motor de señales RF-4/RF-5; OpenAPI del gateway",
        "Cierre funcional del pipeline de datos; api-gateway aún sin código",
    ),
    "v0.3.1": (
        "Barrido de coherencia documental post-0.3.0; threat model T13/T14; "
        "trazabilidad tag↔ADR restaurada; design.md del ingestor-historico",
        "Patch solo de docs, sin cambios funcionales",
    ),
    "v0.4.0": (
        "ADR-0016; api-gateway implementado (REST /api/v1 + WSS /ws/v1, Resource "
        "Server Auth0, 78 tests); AsyncAPI del WSS; OpenAPI ajustada",
        "Los 5 servicios con código; pipeline completo fuente → bus → REST/WSS "
        "operativo. Pendiente HITL: SPA + client M2M de prueba",
    ),
}


def git(repo, *args):
    r = subprocess.run(
        ["git", "-C", repo, *args], capture_output=True, text=True, encoding="utf-8"
    )
    if r.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} falló: {r.stderr.strip()}")
    return r.stdout


def short(h):
    return h[:7]


def tags_of(refs):
    return [t.strip()[4:].strip() for t in refs.split(",") if t.strip().startswith("tag:")]


def bitacora(repo):
    fmt = "%h%x09%p%x09%D%x09%an%x09%ad%x09%s"
    rows = [l for l in git(repo, "log", "--all", f"--format={fmt}", "--date=short").splitlines() if l]
    table = ["| Commit | Tipo | Tags | Autor | Fecha | Mensaje |",
             "|---|---|---|---|---|---|"]
    for row in rows:
        h, parents, refs, an, ad, subject = (row.split("\t") + [""] * 6)[:6]
        tipo = "merge" if len(parents.split()) > 1 else "commit"
        tgs = ", ".join(tags_of(refs)) or "—"
        table.append(f"| `{h}` | {tipo} | {tgs} | {an} | {ad} | {subject.replace('|', '\\|')} |")
    return "\n".join(table)


def tags_ordenados(repo):
    out = git(repo, "for-each-ref", "refs/tags", "--sort=creatordate",
              "--format=%(refname:short)%09%(creatordate:short)")
    return [tuple((l.split("\t") + [""])[:2]) for l in out.splitlines() if l.strip()]


def trazabilidad(repo):
    rows = ["| Tag | Commit | Fecha | Versión CHANGELOG | ADR / feature | Nota |",
            "|---|---|---|---|---|---|"]
    for tag, _creada in tags_ordenados(repo):
        commit = git(repo, "rev-parse", "--short", f"{tag}^{{commit}}").strip()
        # Fecha del commit taggeado (el corte real), no la de creación del tag
        # (los tags pueden crearse retroactivamente).
        fecha = git(repo, "log", "-1", "--format=%ad", "--date=short", commit).strip()
        adr, nota = TAG_NOTES.get(tag, ("—", "— (actualizar TAG_NOTES en el script)"))
        rows.append(f"| {tag} | `{commit}` | {fecha} | {tag.lstrip('v')} | {adr} | {nota} |")
    return "\n".join(rows)


def build_multi(repo, branches):
    """Grafo GitFlow real: el tronco (primera rama) SOLO dibuja su historia
    first-parent — las ramas fusionadas no se aplanan en él — y cada release
    aparece como `merge <rama>` en el tronco. Las demás ramas reclaman, en
    orden, los commits restantes. Emisión en un solo paso topológico global
    (padres primero) alternando lanes con `checkout`."""
    fmt = "%H%x09%P%x09%D"
    meta, orden = {}, []
    for l in git(
        repo, "log", "--topo-order", "--reverse", f"--format={fmt}", *branches
    ).splitlines():
        if not l:
            continue
        h, parents, refs = (l.split("\t") + ["", ""])[:3]
        meta[h] = (parents.split(), refs)
        orden.append(h)

    assigned = {}
    tronco = [
        h
        for h in git(
            repo, "rev-list", "--first-parent", "--reverse", branches[0]
        ).splitlines()
        if h
    ]
    lane_commits = {branches[0]: tronco}
    for h in tronco:
        assigned[h] = branches[0]
    for b in branches[1:]:
        propios = [
            h
            for h in git(
                repo, "rev-list", "--reverse", "--topo-order", b
            ).splitlines()
            if h and h not in assigned
        ]
        lane_commits[b] = propios
        for h in propios:
            assigned[h] = b

    lines = []
    if branches[0] != "main":
        lines.append(
            "%%{init: { 'gitGraph': { 'mainBranchName': '" + branches[0] + "' } } }%%"
        )
    lines.append("gitGraph")
    state = {"current": branches[0]}
    creadas = {branches[0]}
    emitted: set[str] = set()
    aproximado = False

    def checkout(b):
        if state["current"] != b:
            lines.append(f"    checkout {b}")
            state["current"] = b

    for h in orden:
        b = assigned.get(h)
        if b is None:
            continue
        parents, refs = meta.get(h, ([], ""))
        tgs = tags_of(refs)
        tag_sfx = f' tag: "{tgs[0]}"' if tgs else ""
        if b not in creadas:
            # Crear la rama desde el lane de su primer padre. Mermaid bifurca
            # desde el HEAD actual de ese lane: si este ya avanzó más allá del
            # fork real, el punto dibujado es aproximado.
            fork_lane = assigned.get(parents[0]) if parents else None
            padre_es_head = bool(parents) and parents[0] in emitted and (
                not lane_commits.get(fork_lane)
                or _ultimo_emitido(lane_commits[fork_lane], emitted) == parents[0]
            )
            if fork_lane is None or not padre_es_head:
                aproximado = True
            checkout(fork_lane or branches[0])
            lines.append(f"    branch {b}")
            creadas.add(b)
            state["current"] = b
        checkout(b)
        if len(parents) > 1:
            src = assigned.get(parents[1])
            if len(parents) == 2 and src and src != b and parents[1] in emitted:
                lines.append(f"    merge {src}{tag_sfx}")
            else:
                aproximado = True
                lines.append(f'    commit id: "{short(h)}"{tag_sfx} type: HIGHLIGHT')
        else:
            lines.append(f'    commit id: "{short(h)}"{tag_sfx}')
        emitted.add(h)

    for b in branches[1:]:
        if not lane_commits[b]:
            aproximado = True
            lines.append(f"    %% rama {b}: sin commits propios en este corte")

    estado = ["| Rama | Punta | Fecha | Commits en su lane |", "|---|---|---|---|"]
    for b in branches:
        tip = git(repo, "log", "-1", "--format=%h%x09%ad", "--date=short", b).strip()
        h, ad = (tip.split("\t") + [""])[:2]
        estado.append(f"| `{b}` | `{h}` | {ad} | {len(lane_commits[b])} |")

    return "\n".join(lines), "\n".join(estado), aproximado


def _ultimo_emitido(lane, emitted):
    ultimo = None
    for h in lane:
        if h in emitted:
            ultimo = h
        else:
            break
    return ultimo


def render(repo, branches):
    graph, estado, aprox = build_multi(repo, branches)
    note = ("\n> Nota: historia entrelazada u octopus — el gitGraph es aproximado; "
            "la bitácora es la fuente de verdad.\n") if aprox else ""
    tags = tags_ordenados(repo)
    version = tags[-1][0].lstrip("v") if tags else "0.0.0"
    hoy = datetime.date.today().isoformat()
    return f"""# Historial de implementación — Criterio

* **Estado:** review (documentación viva — regenerada por script, no editar a mano)
* **Fecha:** {hoy}
* **Decisores:** Jeremi Alcalá
* **Fase AI-DLC:** 03-implementation
* **Versión:** {version}
* **Gate:** 2
* **Rama principal:** {branches[0]}
* **Estrategia de branching:** GitFlow (main + develop + ramas feature)

## Historial del repositorio (documentación viva)

Derivado de `git log` con `scripts/gitgraph_branches.py`
(ramas vivas: {', '.join(f'`{b}`' for b in branches)}). Regenerar tras cada commit,
merge o tag relevante. Los tags SemVer enlazan con las versiones del `CHANGELOG.md`.
{note}
### Grafo de commits y ramas

```mermaid
{graph}
```

### Estado actual de las ramas

{estado}

### Trazabilidad tag ↔ versión ↔ decisión

{trazabilidad(repo)}

### Bitácora de cambios (fiel al repo)

{bitacora(repo)}
"""


def main():
    p = argparse.ArgumentParser(description="gitGraph multi-rama + bitácora desde git log")
    p.add_argument("repo")
    p.add_argument("--branches", required=True,
                   help="ramas vivas separadas por coma, base primero (main,develop,feature-x)")
    p.add_argument("--out", default=None)
    a = p.parse_args()
    branches = [b.strip() for b in a.branches.split(",") if b.strip()]
    out = render(a.repo, branches)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(out)
        print(f"Escrito: {a.out}")
    else:
        sys.stdout.write(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
