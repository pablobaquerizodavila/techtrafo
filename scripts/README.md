# scripts/

Utilidades operativas del proyecto. Todas son standalone y se invocan a mano.

---

## `tt-backup.sh` — Snapshot del repo al NAS

Crea un zip del estado de `HEAD` y lo deposita en el NAS1821, además de refrescar
README.md y CHANGELOG.md en la raíz del backup folder.

### Pre-requisitos

- Git Bash (MSYS) o cualquier bash en Windows con acceso al NAS1821 via SMB
- Working tree limpio (sin cambios sin commit)
- Branch `main` (o confirmás override interactivo)
- Local sincronizado con `origin/main`

### Uso

```bash
# Después de cualquier git push exitoso, desde la raíz del repo:
./scripts/tt-backup.sh

# Con label manual (recomendado para hitos):
./scripts/tt-backup.sh voltage-os-ola-3c
./scripts/tt-backup.sh fix-hora-dashboard
```

Si no pasás label, el script extrae uno automáticamente del subject
del último commit (le quita el prefijo `type(scope):` y lo slugea).

### Salida

```
\\NAS1821\Carpeta Hellius\Documentos Helius\compañias\Desarrollos\
  Techtrafo\tech-trafo-commit-backup\
├── README.md                                                    ← snapshot del repo
├── CHANGELOG.md                                                 ← snapshot del repo
├── code\
│   └── tech-trafo-v<X.Y.Z>-<label>-<sha>-<YYYY-MM-DD-HHMM>.zip ← este snapshot
├── db-dumps\                                                    ← dumps DB históricos
└── _archive\                                                    ← backups pre-migración
```

### Versión

El número de versión sale del primer encabezado `## [X.Y.Z]` que encuentre en
`CHANGELOG.md`. Cuando agregás una entrada nueva al CHANGELOG (al principio
del archivo, después del header), el siguiente snapshot toma esa versión.

### Errores comunes

| Mensaje | Causa | Solución |
|---|---|---|
| `Hay cambios sin commitear` | Working tree sucio | `git status` y commitea/stashea |
| `Local y origin/main no están sincronizados` | Divergencia | `git pull` o `git push` |
| `NAS no accesible` | SMB caído o sin VPN | Abrí Explorador y conectate al NAS |
| `Estás en branch 'X' (no main)` | No estás en main | Confirmás interactivamente o cambia a main |

### Workflow típico (commits con Claude)

```bash
# 1. Cambios en el código (Claude o vos)
# 2. Commit + push (desde el server o local)
git add . && git commit -m "feat(x): ..." && git push

# 3. Sync local si los cambios vinieron del server
git pull

# 4. Snapshot al NAS
./scripts/tt-backup.sh
```

Si Claude está manejando el flujo, va a invocar el script automáticamente
después de cada `git push` exitoso.
