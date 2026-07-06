"""
Exporta cada objeto de la escena a GLB individual (Blender 3.x).

Uso en Blender:
  1. Abre living_room_assets.blend
  2. Scripting → Open → este archivo
  3. Edita OUTPUT_DIR si hace falta
  4. Run Script (▶)

Luego copia los .glb a:
  public/assets/itch/psx-assets/models/
  npm run catalog
"""

import bpy
import re
from pathlib import Path

# Carpeta de salida (cambia si quieres)
OUTPUT_DIR = Path.home() / "Desktop" / "3d" / "PSX_Assets" / "exported_glb"

# Objetos de escena que NO exportar (suelo, cámara, etc.)
SKIP_NAME_PREFIXES = ("Floor", "Plane", "Camera", "Light", "Cube")
SKIP_TYPES = {"CAMERA", "LIGHT", "EMPTY", "ARMATURE"}

# Solo mallas sueltas (no hijos duplicados si exportas el padre)
EXPORT_ONLY_ROOT_MESHES = True


def slugify(name: str) -> str:
    s = re.sub(r"[^\w\s-]", "", name.strip())
    s = re.sub(r"[\s_]+", "-", s).lower()
    return s or "object"


def is_skip(obj: bpy.types.Object) -> bool:
    if obj.type in SKIP_TYPES:
        return True
    if any(obj.name.startswith(p) for p in SKIP_NAME_PREFIXES):
        return True
    if obj.name.startswith("Icosphere"):  # preview sphere
        return True
    return False


def prepare_object(obj: bpy.types.Object) -> None:
    """Selecciona solo este objeto, origen en la base, transforms aplicados."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    # Origen en el centro del suelo del bbox (base en Y=0 local)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    # Mover para que la base toque Y=0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(depsgraph)
    from mathutils import Vector

    corners = [eval_obj.matrix_world @ Vector(c) for c in eval_obj.bound_box]
    min_y = min(c.y for c in corners)
    obj.location.y -= min_y
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)


def export_glb(obj: bpy.types.Object, out_path: Path) -> None:
    prepare_object(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
    )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    candidates = []
    for obj in bpy.context.scene.objects:
        if is_skip(obj):
            continue
        if obj.type != "MESH":
            continue
        if EXPORT_ONLY_ROOT_MESHES and obj.parent and obj.parent.type == "MESH":
            continue
        candidates.append(obj)

    print(f"Exportando {len(candidates)} objetos → {OUTPUT_DIR}")

    for obj in candidates:
        name = slugify(obj.name)
        out = OUTPUT_DIR / f"{name}.glb"
        try:
            export_glb(obj, out)
            print(f"  ✓ {obj.name} → {out.name}")
        except Exception as e:
            print(f"  ✗ {obj.name}: {e}")

    print("Listo. Copia los GLB a public/assets/itch/psx-assets/models/")


main()
