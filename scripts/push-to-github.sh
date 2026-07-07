#!/bin/bash
set -euo pipefail

GH="${GH:-/tmp/gh_2.63.2_macOS_arm64/bin/gh}"
GAME="/Users/ismaelrivela/Desktop/Isma/VAMPS STUDIO/BACKROOMS"
EDITOR="/Users/ismaelrivela/Desktop/Isma/VAMPS STUDIO/vamprooms-editor"

if ! "$GH" auth status &>/dev/null; then
  echo "→ Inicia sesión en GitHub:"
  "$GH" auth login
fi

# Buffer grande solo para este push (assets ~100MB)
GIT_HTTP_OPTS=(-c http.postBuffer=524288000 -c http.version=HTTP/1.1)

push_repo() {
  local dir="$1" name="$2" url="https://github.com/IsmaelRivela/${name}.git"
  cd "$dir"
  if git remote get-url origin &>/dev/null; then
    git remote set-url origin "$url"
  else
    git remote add origin "$url"
  fi
  if ! git rev-parse HEAD &>/dev/null; then
    git add -A
    git commit -m "Initial commit"
  fi
  echo "→ Subiendo ${name}…"
  for attempt in 1 2 3; do
    if git "${GIT_HTTP_OPTS[@]}" push -u origin main; then
      return 0
    fi
    echo "   Reintento ${attempt}/3 en 5s…"
    sleep 5
  done
  return 1
}

echo "→ Creando repos si no existen…"
"$GH" repo view IsmaelRivela/vamprooms &>/dev/null || "$GH" repo create IsmaelRivela/vamprooms --public
"$GH" repo view IsmaelRivela/vamprooms-editor &>/dev/null || "$GH" repo create IsmaelRivela/vamprooms-editor --public

push_repo "$GAME" "vamprooms"

echo "→ Preparando editor…"
mkdir -p "$EDITOR"
rsync -a --exclude node_modules --exclude dist --exclude .git --exclude _vamps-ref "$GAME/" "$EDITOR/"
cp "$EDITOR/README.editor.md" "$EDITOR/README.md"
cd "$EDITOR"
if [ ! -d .git ]; then git init -b main; fi
git add -A
git diff --cached --quiet || git commit -m "Sync from vamprooms"

push_repo "$EDITOR" "vamprooms-editor"

echo "✓ Listo:"
echo "  https://github.com/IsmaelRivela/vamprooms"
echo "  https://github.com/IsmaelRivela/vamprooms-editor"
