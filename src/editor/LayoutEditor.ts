import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PROJECTS } from '../data/projects';
import type { ProjectTheme } from '../data/projects';
import { loadPS1Model, createModelPlaceholder } from '../world/ModelLoader';
import type { PlacedProp, RoomLayout, RoomThemeOverride } from '../world/RoomLayout';
import { propRotation } from '../world/RoomLayout';
import {
  createMaterialsWithOverride,
  FLOOR_THEME_LABELS,
  listTinyTexturePicks,
  WALL_THEME_LABELS,
} from '../world/TinyTextures';

export interface CatalogItem {
  id: string;
  label: string;
  src: string;
  kind: 'model' | 'texture' | 'source';
  objectName?: string;
  defaultFitSize?: number;
  /** Ruta original en ~/Desktop/3d */
  source3d?: string;
  /** false = aún no copiado a public/assets */
  deployed?: boolean;
}

export interface CatalogCategory {
  id: string;
  label: string;
  folder?: string;
  items: CatalogItem[];
}

export interface AssetCatalog {
  version: number;
  rooms: { id: string; label: string }[];
  categories: CatalogCategory[];
}

interface EditorProp {
  data: PlacedProp;
  pivot: THREE.Group;
}

export interface LayoutEditorOptions {
  canvas: HTMLCanvasElement;
  previewCanvas: HTMLCanvasElement;
  roomSelect: HTMLSelectElement;
  catalogList: HTMLElement;
  catalogSearch: HTMLInputElement;
  inspectorForm: HTMLFormElement;
  inspectorEmpty: HTMLElement;
  propCount: HTMLElement;
  previewLabel: HTMLElement;
  roomLoading: HTMLElement;
  importDialog: HTMLDialogElement;
  importText: HTMLTextAreaElement;
  importFile: HTMLInputElement;
  wallPresetSelect: HTMLSelectElement;
  floorPresetSelect: HTMLSelectElement;
  wallTextureGrid: HTMLElement;
  floorTextureGrid: HTMLElement;
}

const ROOM_HALF = 5;
const ROOM_WALL_H = 2.6;
const DRAG_TYPE = 'application/x-backrooms-asset';
const MAX_CONCURRENT_MESH_LOADS = 4;

/** URL servida con base de Vite (funciona en dev y dist/). */
function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  const rel = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${rel}`;
}

export class LayoutEditor {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly propsRoot = new THREE.Group();
  private readonly roomShell = new THREE.Group();
  private roomTheme: RoomThemeOverride = {};
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hitPoint = new THREE.Vector3();

  private readonly previewScene = new THREE.Scene();
  private readonly previewCamera: THREE.PerspectiveCamera;
  private readonly previewRenderer: THREE.WebGLRenderer;
  private previewPivot: THREE.Group | null = null;

  private catalog: AssetCatalog | null = null;
  private roomId = 'la-tulipana';
  private props: EditorProp[] = [];
  private selected: EditorProp | null = null;
  private pendingAsset: CatalogItem | null = null;
  private draggingProp: EditorProp | null = null;
  private dragOffset = new THREE.Vector3();
  private openFolders = new Set<string>();
  private openSubfolders = new Set<string>();
  private loadGeneration = 0;
  private meshLoadQueue: Array<() => Promise<void>> = [];
  private meshLoadsActive = 0;

  constructor(private readonly opts: LayoutEditorOptions) {
    this.scene.background = new THREE.Color(0x0a0908);
    this.scene.fog = new THREE.Fog(0x0a0908, 18, 42);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
    this.camera.position.set(8, 10, 8);

    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.controls = new OrbitControls(this.camera, opts.canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.5, 0);
    this.controls.maxPolarAngle = Math.PI / 2.05;

    this.previewCamera = new THREE.PerspectiveCamera(40, 200 / 160, 0.01, 20);
    this.previewCamera.position.set(1.2, 0.9, 1.4);
    this.previewRenderer = new THREE.WebGLRenderer({
      canvas: opts.previewCanvas,
      antialias: true,
      alpha: true,
    });
    this.previewRenderer.setSize(200, 160, false);
    this.previewScene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xfff0d0, 0.9);
    key.position.set(2, 4, 3);
    this.previewScene.add(key);

    this.buildRoomGuides();
    this.scene.add(this.roomShell);
    this.scene.add(this.propsRoot);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff4dc, 0.95);
    sun.position.set(6, 12, 4);
    this.scene.add(sun);

    this.bindUi();
    void this.boot();
  }

  private buildRoomGuides() {
    const grid = new THREE.GridHelper(ROOM_HALF * 2, 20, 0x4a4034, 0x2a241c);
    grid.position.y = 0.01;
    this.scene.add(grid);

    const wallMat = new THREE.LineBasicMaterial({ color: 0xc9a86c });
    const y = 0.02;
    const s = ROOM_HALF;
    const outline = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-s, y, -s),
      new THREE.Vector3(s, y, -s),
      new THREE.Vector3(s, y, s),
      new THREE.Vector3(-s, y, s),
      new THREE.Vector3(-s, y, -s),
    ]);
    this.scene.add(new THREE.Line(outline, wallMat));
  }

  private projectTheme(): ProjectTheme {
    return PROJECTS.find((p) => p.id === this.roomId)?.theme ?? {
      wall: 'backrooms',
      floor: 'carpet',
      ceilTint: 0xf0ead8,
    };
  }

  private rebuildRoomShell() {
    while (this.roomShell.children.length) {
      const child = this.roomShell.children[0];
      if (child instanceof THREE.Mesh) child.geometry.dispose();
      this.roomShell.remove(child);
    }

    const mats = createMaterialsWithOverride(this.projectTheme(), this.roomTheme);
    const span = ROOM_HALF * 2;
    const h = ROOM_WALL_H;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(span, span), mats.floor);
    floor.rotation.x = -Math.PI / 2;
    this.roomShell.add(floor);

    const addWall = (w: number, d: number, x: number, z: number) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.wall);
      wall.position.set(x, h / 2, z);
      this.roomShell.add(wall);
    };
    addWall(span, 0.12, 0, -ROOM_HALF);
    addWall(span, 0.12, 0, ROOM_HALF);
    addWall(0.12, span, -ROOM_HALF, 0);
    addWall(0.12, span, ROOM_HALF, 0);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(span, span), mats.ceil);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = h;
    this.roomShell.add(ceil);
  }

  private initThemeUi() {
    const { wallPresetSelect, floorPresetSelect, wallTextureGrid, floorTextureGrid } = this.opts;

    wallPresetSelect.innerHTML = '';
    floorPresetSelect.innerHTML = '';
    for (const [id, label] of Object.entries(WALL_THEME_LABELS)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = label;
      wallPresetSelect.appendChild(opt);
    }
    for (const [id, label] of Object.entries(FLOOR_THEME_LABELS)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = label;
      floorPresetSelect.appendChild(opt);
    }

    const picks = listTinyTexturePicks();
    const wallGroups = new Set(['tile', 'bricks', 'wood', 'roofs']);
    const floorGroups = new Set(['grass', 'tile', 'wood', 'bricks']);

    const fillGrid = (el: HTMLElement, groups: Set<string>, surface: 'wall' | 'floor') => {
      el.innerHTML = '';
      for (const pick of picks.filter((p) => groups.has(p.group))) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = pick.label;
        btn.dataset.src = pick.src;
        const img = document.createElement('img');
        img.src = publicUrl(pick.src);
        img.alt = pick.label;
        btn.appendChild(img);
        btn.addEventListener('click', () => {
          if (surface === 'wall') {
            this.roomTheme.wallTexture = pick.src;
            delete this.roomTheme.wall;
          } else {
            this.roomTheme.floorTexture = pick.src;
            delete this.roomTheme.floor;
          }
          this.syncThemeUi();
          this.rebuildRoomShell();
        });
        el.appendChild(btn);
      }
    };

    fillGrid(wallTextureGrid, wallGroups, 'wall');
    fillGrid(floorTextureGrid, floorGroups, 'floor');

    wallPresetSelect.addEventListener('change', () => {
      this.roomTheme.wall = wallPresetSelect.value as ProjectTheme['wall'];
      delete this.roomTheme.wallTexture;
      this.syncThemeUi();
      this.rebuildRoomShell();
    });
    floorPresetSelect.addEventListener('change', () => {
      this.roomTheme.floor = floorPresetSelect.value as ProjectTheme['floor'];
      delete this.roomTheme.floorTexture;
      this.syncThemeUi();
      this.rebuildRoomShell();
    });

    document.getElementById('clear-wall-texture')!.addEventListener('click', () => {
      delete this.roomTheme.wallTexture;
      if (!this.roomTheme.wall) this.roomTheme.wall = this.projectTheme().wall;
      this.syncThemeUi();
      this.rebuildRoomShell();
    });
    document.getElementById('clear-floor-texture')!.addEventListener('click', () => {
      delete this.roomTheme.floorTexture;
      if (!this.roomTheme.floor) this.roomTheme.floor = this.projectTheme().floor;
      this.syncThemeUi();
      this.rebuildRoomShell();
    });
  }

  private syncThemeUi() {
    const base = this.projectTheme();
    const { wallPresetSelect, floorPresetSelect, wallTextureGrid, floorTextureGrid } = this.opts;

    wallPresetSelect.value = this.roomTheme.wall ?? base.wall;
    floorPresetSelect.value = this.roomTheme.floor ?? base.floor;

    wallTextureGrid.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.src === this.roomTheme.wallTexture);
    });
    floorTextureGrid.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.src === this.roomTheme.floorTexture);
    });
  }

  private applyThemeFromLayout(theme?: RoomThemeOverride) {
    this.roomTheme = theme ? { ...theme } : {};
    this.syncThemeUi();
    this.rebuildRoomShell();
  }

  private serializeTheme(): RoomThemeOverride | undefined {
    const base = this.projectTheme();
    const out: RoomThemeOverride = {};
    if (this.roomTheme.wall && this.roomTheme.wall !== base.wall) out.wall = this.roomTheme.wall;
    if (this.roomTheme.floor && this.roomTheme.floor !== base.floor) out.floor = this.roomTheme.floor;
    if (this.roomTheme.wallTexture) out.wallTexture = this.roomTheme.wallTexture;
    if (this.roomTheme.floorTexture) out.floorTexture = this.roomTheme.floorTexture;
    if (this.roomTheme.ceilTint !== undefined && this.roomTheme.ceilTint !== base.ceilTint) {
      out.ceilTint = this.roomTheme.ceilTint;
    }
    return Object.keys(out).length ? out : undefined;
  }

  private bindUi() {
    const { canvas } = this.opts;

    window.addEventListener('resize', () => this.onResize());
    this.onResize();

    document.getElementById('btn-reload')!.addEventListener('click', () => void this.loadRoom(this.roomId));
    document.getElementById('btn-export')!.addEventListener('click', () => this.exportLayout());
    document.getElementById('btn-import')!.addEventListener('click', () => this.opts.importDialog.showModal());
    document.getElementById('import-file-btn')!.addEventListener('click', () => this.opts.importFile.click());
    this.opts.importFile.addEventListener('change', () => this.readImportFile());
    this.opts.importDialog.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      this.applyImport(this.opts.importText.value);
      this.opts.importDialog.close();
    });
    this.opts.importDialog.querySelector('[value="cancel"]')!.addEventListener('click', () => {
      this.opts.importDialog.close();
    });

    this.opts.roomSelect.addEventListener('change', () => {
      this.roomId = this.opts.roomSelect.value;
      void this.loadRoom(this.roomId);
    });

    this.opts.catalogSearch.addEventListener('input', () => this.renderCatalog());
    document.getElementById('catalog-expand-all')!.addEventListener('click', () => {
      if (!this.catalog) return;
      for (const cat of this.catalog.categories) {
        const folder = cat.folder ?? cat.label;
        this.openFolders.add(folder);
        this.openSubfolders.add(`${folder}::${cat.id}`);
      }
      this.renderCatalog();
    });
    document.getElementById('catalog-collapse-all')!.addEventListener('click', () => {
      this.openFolders.clear();
      this.openSubfolders.clear();
      this.renderCatalog();
    });

    this.opts.inspectorForm.addEventListener('input', () => this.applyInspectorToSelected());
    document.getElementById('btn-delete')!.addEventListener('click', () => this.deleteSelected());
    document.getElementById('btn-reload-model')!.addEventListener('click', () => {
      if (this.selected) void this.reloadPropMesh(this.selected);
    });

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', () => this.onPointerUp());
    canvas.addEventListener('pointerleave', () => this.onPointerUp());
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    });
    canvas.addEventListener('drop', (e) => this.onDrop(e));

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelected();
      } else if (e.key === 'r' || e.key === 'R') {
        this.rotateSelected(45);
      } else if (e.key === 'd' || e.key === 'D') {
        this.duplicateSelected();
      } else if (e.key === 'Escape') {
        this.setSelected(null);
        this.pendingAsset = null;
        canvas.style.cursor = '';
      }
    });

    this.animate();
  }

  private async boot() {
    const res = await fetch(publicUrl('assets/asset-catalog.json'));
    this.catalog = (await res.json()) as AssetCatalog;
    this.opts.roomSelect.innerHTML = '';
    for (const room of this.catalog.rooms) {
      const opt = document.createElement('option');
      opt.value = room.id;
      opt.textContent = room.label;
      this.opts.roomSelect.appendChild(opt);
    }
    this.renderCatalog();
    this.initThemeUi();
    await this.loadRoom(this.roomId);
  }

  private catalogItemMatches(item: CatalogItem, q: string): boolean {
    if (!q) return true;
    return (
      item.label.toLowerCase().includes(q) ||
      item.src.toLowerCase().includes(q) ||
      (item.objectName?.toLowerCase().includes(q) ?? false) ||
      (item.source3d?.toLowerCase().includes(q) ?? false)
    );
  }

  private subcategoryLabel(cat: CatalogCategory): string {
    const folder = cat.folder ?? cat.label;
    if (cat.label === folder) return '';
    const prefix = `${folder} / `;
    if (cat.label.startsWith(prefix)) return cat.label.slice(prefix.length);
    return cat.label;
  }

  private createAssetChip(item: CatalogItem, list: HTMLElement): HTMLElement {
    if (item.kind === 'texture') {
      return this.createTextureChip(item);
    }
    if (item.kind === 'source') {
      const el = document.createElement('div');
      el.className = 'asset-chip asset-chip--source';
      el.title = `Archivo fuente — exporta a GLB/FBX:\n${item.source3d ?? ''}`;
      el.innerHTML = `${item.label}<small>${item.source3d ?? 'solo en Desktop/3d'}</small>`;
      return el;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'asset-chip' + (item.deployed === false ? ' asset-chip--missing' : '');
    btn.draggable = item.deployed !== false;
    btn.disabled = item.deployed === false;
    btn.dataset.assetId = item.id;
    const hint = item.source3d ?? item.objectName ?? item.src;
    btn.title =
      item.deployed === false
        ? `No desplegado — copia desde Desktop/3d:\n${item.source3d ?? hint}`
        : hint;
    btn.innerHTML = `${item.label}<small>${hint}</small>`;
    if (item.deployed !== false) {
      btn.addEventListener('dragstart', (e) => {
        e.dataTransfer!.setData(DRAG_TYPE, JSON.stringify(item));
        e.dataTransfer!.effectAllowed = 'copy';
      });
      btn.addEventListener('click', () => {
        this.pendingAsset = item;
        this.opts.canvas.style.cursor = 'crosshair';
        list.querySelectorAll('.asset-chip.active').forEach((el) => el.classList.remove('active'));
        btn.classList.add('active');
        void this.showPreview(item);
      });
      btn.addEventListener('mouseenter', () => void this.showPreview(item));
    }
    return btn;
  }

  private createTextureChip(item: CatalogItem): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className =
      'asset-chip asset-chip--texture' + (item.deployed === false ? ' asset-chip--missing' : '');

    const thumb = document.createElement('img');
    thumb.className = 'texture-thumb';
    thumb.alt = item.label;
    if (item.deployed !== false && item.src) thumb.src = publicUrl(item.src);

    const label = document.createElement('span');
    label.className = 'texture-label';
    label.textContent = item.label;

    const hint = document.createElement('small');
    hint.textContent = item.source3d ?? item.src;

    wrap.appendChild(thumb);
    wrap.appendChild(label);
    wrap.appendChild(hint);

    if (item.deployed !== false && item.src) {
      const actions = document.createElement('div');
      actions.className = 'texture-actions';
      for (const surface of ['wall', 'floor'] as const) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = surface === 'wall' ? 'Pared' : 'Suelo';
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          this.applyRoomSurfaceTexture(item.src, surface);
        });
        actions.appendChild(b);
      }
      wrap.appendChild(actions);
    } else {
      wrap.title = `No desplegado — copia desde Desktop/3d:\n${item.source3d ?? item.src}`;
    }

    return wrap;
  }

  private applyRoomSurfaceTexture(src: string, surface: 'wall' | 'floor') {
    if (surface === 'wall') {
      this.roomTheme.wallTexture = src;
      delete this.roomTheme.wall;
    } else {
      this.roomTheme.floorTexture = src;
      delete this.roomTheme.floor;
    }
    this.syncThemeUi();
    this.rebuildRoomShell();
  }

  private renderCatalog() {
    const list = this.opts.catalogList;
    list.innerHTML = '';
    if (!this.catalog) return;

    const q = this.opts.catalogSearch.value.trim().toLowerCase();
    const searching = q.length > 0;

    const folderOrder: string[] = [];
    const byFolder = new Map<string, CatalogCategory[]>();
    for (const cat of this.catalog.categories) {
      const folder = cat.folder ?? cat.label;
      if (!byFolder.has(folder)) {
        byFolder.set(folder, []);
        folderOrder.push(folder);
      }
      byFolder.get(folder)!.push(cat);
    }

    for (const folder of folderOrder) {
      const cats = byFolder.get(folder)!;
      const catsWithItems: { cat: CatalogCategory; items: CatalogItem[] }[] = [];
      let folderCount = 0;

      for (const cat of cats) {
        const items = cat.items.filter((item) => this.catalogItemMatches(item, q));
        if (!items.length) continue;
        folderCount += items.length;
        catsWithItems.push({ cat, items });
      }
      if (!folderCount) continue;

      const folderDetails = document.createElement('details');
      folderDetails.className = 'catalog-folder';
      folderDetails.open = searching || this.openFolders.has(folder);
      folderDetails.addEventListener('toggle', () => {
        if (folderDetails.open) this.openFolders.add(folder);
        else this.openFolders.delete(folder);
      });

      const summary = document.createElement('summary');
      summary.className = 'catalog-folder-summary';
      summary.textContent = `${folder} (${folderCount})`;
      folderDetails.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'catalog-folder-body';

      const singleFlat =
        catsWithItems.length === 1 && this.subcategoryLabel(catsWithItems[0].cat) === '';

      if (singleFlat) {
        for (const item of catsWithItems[0].items) {
          body.appendChild(this.createAssetChip(item, list));
        }
      } else {
        for (const { cat, items } of catsWithItems) {
          const sub = this.subcategoryLabel(cat);
          if (sub) {
            const subKey = `${folder}::${cat.id}`;
            const subDetails = document.createElement('details');
            subDetails.className = 'catalog-subfolder';
            subDetails.open = searching || this.openSubfolders.has(subKey);
            subDetails.addEventListener('toggle', () => {
              if (subDetails.open) this.openSubfolders.add(subKey);
              else this.openSubfolders.delete(subKey);
            });

            const subSummary = document.createElement('summary');
            subSummary.className = 'catalog-subfolder-summary';
            subSummary.textContent = `${sub} (${items.length})`;
            subDetails.appendChild(subSummary);

            const subBody = document.createElement('div');
            subBody.className = 'catalog-subfolder-body';
            for (const item of items) {
              subBody.appendChild(this.createAssetChip(item, list));
            }
            subDetails.appendChild(subBody);
            body.appendChild(subDetails);
          } else {
            for (const item of items) {
              body.appendChild(this.createAssetChip(item, list));
            }
          }
        }
      }

      folderDetails.appendChild(body);
      list.appendChild(folderDetails);
    }
  }

  private async showPreview(item: CatalogItem) {
    this.opts.previewLabel.textContent = item.objectName ?? item.label;
    if (this.previewPivot) {
      this.previewScene.remove(this.previewPivot);
      this.previewPivot = null;
    }
    try {
      const { pivot } = await loadPS1Model(item.src, item.defaultFitSize ?? 1, {
        objectName: item.objectName,
        floorAlign: true,
      });
      this.previewPivot = pivot;
      this.previewScene.add(pivot);
      const box = new THREE.Box3().setFromObject(pivot);
      const size = box.getSize(new THREE.Vector3()).length();
      const center = box.getCenter(new THREE.Vector3());
      pivot.position.sub(center);
      pivot.position.y -= box.min.y - center.y;
      this.previewCamera.position.set(size * 1.1, size * 0.75, size * 1.2);
      this.previewCamera.lookAt(0, size * 0.35, 0);
    } catch {
      const ph = createModelPlaceholder(item.label);
      this.previewPivot = ph;
      this.previewScene.add(ph);
    }
  }

  private setRoomLoading(loading: boolean, message = '') {
    this.opts.roomLoading.textContent = loading ? message || 'Cargando sala…' : '';
    this.opts.roomSelect.disabled = loading;
  }

  private async loadRoom(projectId: string) {
    const gen = ++this.loadGeneration;
    this.roomId = projectId;
    this.clearProps();
    this.setRoomLoading(true, 'Cargando layout…');

    let layout: RoomLayout;
    try {
      const res = await fetch(publicUrl(`room-layouts/${projectId}.json`));
      if (!res.ok) {
        console.warn(`Layout no encontrado: ${projectId}`, res.status);
      }
      layout = res.ok
        ? ((await res.json()) as RoomLayout)
        : { version: 1, projectId, props: [] };
    } catch (err) {
      console.warn(`Error cargando layout ${projectId}`, err);
      layout = { version: 1, projectId, props: [] };
    }

    if (gen !== this.loadGeneration) return;

    this.applyThemeFromLayout(layout.theme);
    this.setRoomLoading(true, `Colocando ${layout.props.length} props…`);

    for (const data of layout.props) {
      if (gen !== this.loadGeneration) return;
      this.addProp({ ...data }, false);
    }

    this.setSelected(null);
    this.updatePropCount();
    this.setRoomLoading(false);
  }

  private clearProps() {
    this.meshLoadQueue = [];
    for (const p of this.props) {
      this.propsRoot.remove(p.pivot);
    }
    this.props = [];
  }

  private makePropId(base: string): string {
    const slug = base.toLowerCase().replace(/[^\w]+/g, '-').slice(0, 32);
    let id = slug;
    let n = 1;
    while (this.props.some((p) => p.data.id === id)) {
      id = `${slug}-${n++}`;
    }
    return id;
  }

  private catalogItemToProp(item: CatalogItem, position: [number, number, number]): PlacedProp {
    return {
      id: this.makePropId(item.id),
      label: item.label,
      src: item.src,
      kind: 'model',
      space: 'room',
      position,
      rotationDeg: [0, 0, 0],
      fitSize: item.defaultFitSize ?? 1,
      scale: 1,
      ...(item.objectName ? { objectName: item.objectName } : {}),
    };
  }

  private async addProp(data: PlacedProp, select = true): Promise<EditorProp> {
    const pivot = new THREE.Group();
    pivot.name = `prop:${data.id}`;
    pivot.userData.propId = data.id;
    this.applyTransform(pivot, data);

    const placeholder = createModelPlaceholder(data.label.slice(0, 10), 0x555555);
    pivot.add(placeholder);

    const entry: EditorProp = { data, pivot };
    this.props.push(entry);
    this.propsRoot.add(pivot);

    void this.enqueueMeshLoad(entry, placeholder);

    if (select) this.setSelected(entry);
    this.updatePropCount();
    return entry;
  }

  private enqueueMeshLoad(entry: EditorProp, placeholder: THREE.Object3D) {
    const gen = this.loadGeneration;
    this.meshLoadQueue.push(async () => {
      if (gen !== this.loadGeneration) return;
      await this.reloadPropMesh(entry);
      if (gen === this.loadGeneration) placeholder.removeFromParent();
    });
    void this.drainMeshLoadQueue();
  }

  private async drainMeshLoadQueue() {
    while (this.meshLoadsActive < MAX_CONCURRENT_MESH_LOADS && this.meshLoadQueue.length) {
      const job = this.meshLoadQueue.shift()!;
      this.meshLoadsActive++;
      void job().finally(() => {
        this.meshLoadsActive--;
        void this.drainMeshLoadQueue();
      });
    }
  }

  private async reloadPropMesh(entry: EditorProp) {
    const { data } = entry;
    entry.pivot.children.slice().forEach((c) => c.removeFromParent());
    try {
      const { pivot: modelPivot } = await loadPS1Model(data.src, data.fitSize ?? 1, {
        objectName: data.objectName,
        spin: data.spin,
        yOffset: data.yOffset,
        floorAlign: true,
      });
      const [rx, ry, rz] = propRotation(data);
      modelPivot.rotation.set(rx, ry, rz);
      modelPivot.scale.setScalar(data.scale ?? 1);
      modelPivot.traverse((o) => {
        o.userData.propId = data.id;
      });
      entry.pivot.add(modelPivot);
    } catch (err) {
      console.warn('Preview load failed', data.src, err);
      const ph = createModelPlaceholder(data.label, 0xc22424);
      entry.pivot.add(ph);
    }
    this.refreshSelectionBox();
  }

  private applyTransform(pivot: THREE.Group, data: PlacedProp) {
    pivot.position.set(data.position[0], data.position[1], data.position[2]);
  }

  private setSelected(entry: EditorProp | null) {
    this.selected = entry;
    this.refreshSelectionBox();
    const { inspectorForm, inspectorEmpty } = this.opts;
    if (!entry) {
      inspectorForm.classList.add('hidden');
      inspectorEmpty.classList.remove('hidden');
      return;
    }
    inspectorEmpty.classList.add('hidden');
    inspectorForm.classList.remove('hidden');

    const d = entry.data;
    const rot = d.rotationDeg ?? [0, 0, 0];
    (inspectorForm.elements.namedItem('id') as HTMLInputElement).value = d.id;
    (inspectorForm.elements.namedItem('label') as HTMLInputElement).value = d.label;
    (inspectorForm.elements.namedItem('src') as HTMLInputElement).value = d.src;
    const onField = inspectorForm.querySelector('.hidden-fbx') as HTMLElement;
    const onInput = inspectorForm.elements.namedItem('objectName') as HTMLInputElement;
    if (d.objectName) {
      onField.classList.add('show');
      onInput.value = d.objectName;
    } else {
      onField.classList.remove('show');
      onInput.value = '';
    }
    (inspectorForm.elements.namedItem('px') as HTMLInputElement).value = String(d.position[0]);
    (inspectorForm.elements.namedItem('py') as HTMLInputElement).value = String(d.position[1]);
    (inspectorForm.elements.namedItem('pz') as HTMLInputElement).value = String(d.position[2]);
    (inspectorForm.elements.namedItem('rx') as HTMLInputElement).value = String(rot[0]);
    (inspectorForm.elements.namedItem('ry') as HTMLInputElement).value = String(rot[1]);
    (inspectorForm.elements.namedItem('rz') as HTMLInputElement).value = String(rot[2]);
    (inspectorForm.elements.namedItem('fitSize') as HTMLInputElement).value = String(d.fitSize ?? 1);
    (inspectorForm.elements.namedItem('scale') as HTMLInputElement).value = String(d.scale ?? 1);
    (inspectorForm.elements.namedItem('yOffset') as HTMLInputElement).value = String(d.yOffset ?? 0);
    (inspectorForm.elements.namedItem('spin') as HTMLInputElement).checked = !!d.spin;
  }

  private selectionHelper: THREE.BoxHelper | null = null;

  private refreshSelectionBox() {
    if (this.selectionHelper) {
      this.scene.remove(this.selectionHelper);
      this.selectionHelper = null;
    }
    if (!this.selected) return;
    this.selectionHelper = new THREE.BoxHelper(this.selected.pivot, 0xc9a86c);
    this.scene.add(this.selectionHelper);
  }

  private applyInspectorToSelected() {
    if (!this.selected) return;
    const f = this.opts.inspectorForm;
    const d = this.selected.data;
    d.id = (f.elements.namedItem('id') as HTMLInputElement).value;
    d.label = (f.elements.namedItem('label') as HTMLInputElement).value;
    d.position = [
      parseFloat((f.elements.namedItem('px') as HTMLInputElement).value) || 0,
      parseFloat((f.elements.namedItem('py') as HTMLInputElement).value) || 0,
      parseFloat((f.elements.namedItem('pz') as HTMLInputElement).value) || 0,
    ];
    d.rotationDeg = [
      parseFloat((f.elements.namedItem('rx') as HTMLInputElement).value) || 0,
      parseFloat((f.elements.namedItem('ry') as HTMLInputElement).value) || 0,
      parseFloat((f.elements.namedItem('rz') as HTMLInputElement).value) || 0,
    ];
    d.fitSize = parseFloat((f.elements.namedItem('fitSize') as HTMLInputElement).value) || 1;
    d.scale = parseFloat((f.elements.namedItem('scale') as HTMLInputElement).value) || 1;
    d.yOffset = parseFloat((f.elements.namedItem('yOffset') as HTMLInputElement).value) || 0;
    d.spin = (f.elements.namedItem('spin') as HTMLInputElement).checked;

    this.selected.pivot.name = `prop:${d.id}`;
    this.selected.pivot.userData.propId = d.id;
    this.applyTransform(this.selected.pivot, d);
    void this.reloadPropMesh(this.selected);
  }

  private deleteSelected() {
    if (!this.selected) return;
    const id = this.selected.data.id;
    this.propsRoot.remove(this.selected.pivot);
    this.props = this.props.filter((p) => p.data.id !== id);
    this.setSelected(null);
    this.updatePropCount();
  }

  private rotateSelected(deg: number) {
    if (!this.selected) return;
    const d = this.selected.data;
    d.rotationDeg = d.rotationDeg ?? [0, 0, 0];
    d.rotationDeg[1] = (d.rotationDeg[1] + deg) % 360;
    this.setSelected(this.selected);
    void this.reloadPropMesh(this.selected);
  }

  private duplicateSelected() {
    if (!this.selected) return;
    const src = this.selected.data;
    const copy: PlacedProp = {
      ...src,
      id: this.makePropId(src.id + '-copy'),
      position: [src.position[0] + 0.5, src.position[1], src.position[2] + 0.5],
      rotationDeg: src.rotationDeg ? [...src.rotationDeg] as [number, number, number] : [0, 0, 0],
    };
    void this.addProp(copy, true);
  }

  private updatePropCount() {
    this.opts.propCount.textContent = `${this.props.length} props`;
  }

  private pointerToFloor(e: PointerEvent): THREE.Vector3 | null {
    const rect = this.opts.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray.intersectPlane(this.floorPlane, this.hitPoint) ? this.hitPoint.clone() : null;
  }

  private pickProp(e: PointerEvent): EditorProp | null {
    const rect = this.opts.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.propsRoot.children, true);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        const id = obj.userData.propId as string | undefined;
        if (id) {
          return this.props.find((p) => p.data.id === id) ?? null;
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  private clampRoom(x: number, z: number): [number, number] {
    const m = ROOM_HALF - 0.3;
    return [Math.max(-m, Math.min(m, x)), Math.max(-m, Math.min(m, z))];
  }

  private onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;

    if (this.pendingAsset) {
      const pt = this.pointerToFloor(e);
      if (pt) {
        const [x, z] = this.clampRoom(pt.x, pt.z);
        void this.addProp(this.catalogItemToProp(this.pendingAsset, [x, 0, z]));
        this.pendingAsset = null;
        this.opts.canvas.style.cursor = '';
        this.opts.catalogList.querySelectorAll('.asset-chip.active').forEach((el) => el.classList.remove('active'));
      }
      return;
    }

    const hit = this.pickProp(e);
    if (hit) {
      this.setSelected(hit);
      this.draggingProp = hit;
      const pt = this.pointerToFloor(e);
      if (pt) {
        this.dragOffset.copy(pt).sub(hit.pivot.position);
      }
      this.controls.enabled = false;
      this.opts.canvas.setPointerCapture(e.pointerId);
    } else {
      this.setSelected(null);
    }
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.draggingProp) return;
    const pt = this.pointerToFloor(e);
    if (!pt) return;
    const [x, z] = this.clampRoom(pt.x - this.dragOffset.x, pt.z - this.dragOffset.z);
    this.draggingProp.pivot.position.set(x, this.draggingProp.data.position[1], z);
    this.draggingProp.data.position = [x, this.draggingProp.data.position[1], z];
    if (this.selected === this.draggingProp) {
      (this.opts.inspectorForm.elements.namedItem('px') as HTMLInputElement).value = String(x);
      (this.opts.inspectorForm.elements.namedItem('pz') as HTMLInputElement).value = String(z);
    }
    this.refreshSelectionBox();
  }

  private onPointerUp() {
    this.draggingProp = null;
    this.controls.enabled = true;
  }

  private onDrop(e: DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer?.getData(DRAG_TYPE);
    if (!raw) return;
    const item = JSON.parse(raw) as CatalogItem;
    const pt = this.pointerToFloor(e as unknown as PointerEvent);
    if (!pt) return;
    const [x, z] = this.clampRoom(pt.x, pt.z);
    void this.addProp(this.catalogItemToProp(item, [x, 0, z]));
  }

  private serializeProp(d: PlacedProp): PlacedProp {
    const out: PlacedProp = {
      id: d.id,
      label: d.label,
      src: d.src,
      kind: d.kind,
      position: [...d.position] as [number, number, number],
      scale: d.scale ?? 1,
    };
    if (d.space) out.space = d.space;
    if (d.objectName) out.objectName = d.objectName;
    if (d.rotationDeg && !d.rotationDeg.every((v) => v === 0)) {
      out.rotationDeg = [...d.rotationDeg] as [number, number, number];
    }
    if (d.fitSize !== undefined) out.fitSize = d.fitSize;
    if (d.yOffset) out.yOffset = d.yOffset;
    if (d.spin) out.spin = d.spin;
    if (d.modelRotationDeg) out.modelRotationDeg = [...d.modelRotationDeg] as [number, number, number];
    return out;
  }

  private exportLayout() {
    const theme = this.serializeTheme();
    const layout: RoomLayout = {
      version: 1,
      projectId: this.roomId,
      ...(theme ? { theme } : {}),
      props: this.props.map((p) => this.serializeProp(p.data)),
    };
    const json = JSON.stringify(layout, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.roomId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    navigator.clipboard?.writeText(json).catch(() => {});
  }

  private readImportFile() {
    const file = this.opts.importFile.files?.[0];
    if (!file) return;
    file.text().then((t) => {
      this.opts.importText.value = t;
    });
  }

  private applyImport(raw: string) {
    try {
      const layout = JSON.parse(raw) as RoomLayout;
      if (layout.projectId) {
        this.roomId = layout.projectId;
        this.opts.roomSelect.value = layout.projectId;
      }
      this.clearProps();
      this.applyThemeFromLayout(layout.theme);
      for (const data of layout.props ?? []) {
        void this.addProp({ ...data }, false);
      }
      this.setSelected(null);
      this.updatePropCount();
    } catch (err) {
      alert('JSON inválido: ' + String(err));
    }
  }

  private onResize() {
    const { canvas } = this.opts;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    if (this.previewPivot) this.previewPivot.rotation.y += 0.008;
    this.renderer.render(this.scene, this.camera);
    this.previewRenderer.render(this.previewScene, this.previewCamera);
    if (this.selectionHelper) this.selectionHelper.update();
  };
}
