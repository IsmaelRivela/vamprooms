#!/bin/bash
set -euo pipefail

GH="${GH:-/tmp/gh_2.63.2_macOS_arm64/bin/gh}"
GAME="/Users/ismaelrivela/Desktop/Isma/VAMPS STUDIO/BACKROOMS"
EDITOR="/Users/ismaelrivela/Desktop/Isma/VAMPS STUDIO/vamprooms-editor"

if ! "$GH" auth status &>/dev/null; then
  echo "→ Inicia sesión en GitHub:"
  "$GH" auth login
fi

echo "→ Subiendo juego (vamprooms)…"
cd "$GAME"
"$GH" repo create IsmaelRivela/vamprooms --public --source=. --remote=origin --push 2>/dev/null \
  || { git remote add origin "https://github.com/IsmaelRivela/vamprooms.git" 2>/dev/null || true; git push -u origin main; }

echo "→ Subiendo editor (vamprooms-editor)…"
mkdir -p "$EDITOR"
rsync -a --exclude node_modules --exclude dist --exclude .git --exclude _vamps-ref "$GAME/" "$EDITOR/"
cp "$EDITOR/README.editor.md" "$EDITOR/README.md"
cd "$EDITOR"
git init -b main 2>/dev/null || true
git add -A
git diff --cached --quiet || git commit -m "Sync from vamprooms game repo"
"$GH" repo create IsmaelRivela/vamprooms-editor --public --source=. --remote=origin --push 2>/dev/null \
  || { git remote add origin "https://github.com/IsmaelRivela/vamprooms-editor.git" 2>/dev/null || true; git push -u origin main; }

echo "✓ Listo:"
echo "  https://github.com/IsmaelRivela/vamprooms"
echo "  https://github.com/IsmaelRivela/vamprooms-editor"
