#!/bin/bash
set -euo pipefail

GH="${GH:-/tmp/gh_2.63.2_macOS_arm64/bin/gh}"
GAME="/Users/ismaelrivela/Desktop/Isma/VAMPS STUDIO/BACKROOMS"
EDITOR="/Users/ismaelrivela/Desktop/Isma/VAMPS STUDIO/backrooms-layout-editor"

if ! "$GH" auth status &>/dev/null; then
  echo "→ Inicia sesión en GitHub:"
  "$GH" auth login
fi

echo "→ Subiendo juego (backrooms-portfolio)…"
cd "$GAME"
"$GH" repo create IsmaelRivela/backrooms-portfolio --public --source=. --remote=origin --push 2>/dev/null \
  || { git remote add origin "https://github.com/IsmaelRivela/backrooms-portfolio.git" 2>/dev/null || true; git push -u origin main; }

echo "→ Subiendo editor (backrooms-layout-editor)…"
cd "$EDITOR"
"$GH" repo create IsmaelRivela/backrooms-layout-editor --public --source=. --remote=origin --push 2>/dev/null \
  || { git remote add origin "https://github.com/IsmaelRivela/backrooms-layout-editor.git" 2>/dev/null || true; git push -u origin main; }

echo "✓ Listo:"
echo "  https://github.com/IsmaelRivela/backrooms-portfolio"
echo "  https://github.com/IsmaelRivela/backrooms-layout-editor"
