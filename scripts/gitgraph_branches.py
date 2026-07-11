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
import subprocess
import sys


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


def build_multi(repo, branches):
    fmt = "%H%x09%P%x09%s%x09%D"
    meta = {}
    for l in git(repo, "log", "--topo-order", f"--format={fmt}", *branches).splitlines():
        if not l:
            continue
        h, parents, subject, refs = (l.split("\t") + ["", "", ""])[:4]
        meta[h] = (parents.split(), subject, refs)

    # Commits exclusivos de cada rama: la primera rama del orden dado que los contiene.
    lane_commits, assigned, prev = {}, {}, []
    for b in branches:
        excl = [l for l in git(
            repo, "rev-list", "--reverse", "--topo-order", b, *[f"^{p}" for p in prev]
        ).splitlines() if l]
        lane_commits[b] = excl
        for h in excl:
            assigned[h] = b
        prev.append(b)

    # Fork real de cada rama = primer padre de su primer commit exclusivo.
    forks, sin_lane = {}, []
    for b in branches[1:]:
        if not lane_commits[b]:
            sin_lane.append(b)
            continue
        parents = meta.get(lane_commits[b][0], ([], "", ""))[0]
        fork = parents[0] if parents else None
        if fork in assigned:
            forks.setdefault(fork, []).append(b)
        else:
            sin_lane.append(b)

    lines = []
    if branches[0] != "main":
        lines.append("%%{init: { 'gitGraph': { 'mainBranchName': '" + branches[0] + "' } } }%%")
    lines.append("gitGraph")
    state = {"current": branches[0], "emitted": set()}
    aproximado = False

    def checkout(b):
        if state["current"] != b:
            lines.append(f"    checkout {b}")
            state["current"] = b

    def emit_lane(b):
        nonlocal aproximado
        for h in lane_commits[b]:
            checkout(b)
            parents, _subject, refs = meta.get(h, ([], "", ""))
            tgs = tags_of(refs)
            tag_sfx = f' tag: "{tgs[0]}"' if tgs else ""
            if len(parents) > 1:
                src = assigned.get(parents[1])
                src_completa = src and src != b and set(lane_commits[src]) <= state["emitted"]
                if len(parents) > 2 or not src_completa:
                    aproximado = True
                    lines.append(f'    commit id: "{short(h)}"{tag_sfx} type: HIGHLIGHT')
                else:
                    lines.append(f"    merge {src}{tag_sfx}")
            else:
                lines.append(f'    commit id: "{short(h)}"{tag_sfx}')
            state["emitted"].add(h)
            # Ramas que bifurcan exactamente en este commit: crearlas ahora, mientras
            # el HEAD del lane sigue aquí (mermaid ramifica desde el HEAD actual).
            for child in forks.get(h, []):
                checkout(b)
                lines.append(f"    branch {child}")
                state["current"] = child
                emit_lane(child)

    emit_lane(branches[0])
    for b in sin_lane:
        aproximado = True
        lines.append(f"    %% rama {b}: sin commits propios o fork fuera del mapa")

    estado = ["| Rama | Punta | Fecha | Commits propios |", "|---|---|---|---|"]
    for b in branches:
        tip = git(repo, "log", "-1", "--format=%h%x09%ad", "--date=short", b).strip()
        h, ad = (tip.split("\t") + [""])[:2]
        estado.append(f"| `{b}` | `{h}` | {ad} | {len(lane_commits[b])} |")

    return "\n".join(lines), "\n".join(estado), aproximado


def render(repo, branches):
    graph, estado, aprox = build_multi(repo, branches)
    note = ("\n> Nota: historia entrelazada u octopus — el gitGraph es aproximado; "
            "la bitácora es la fuente de verdad.\n") if aprox else ""
    return f"""## Historial del repositorio (documentación viva)

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
