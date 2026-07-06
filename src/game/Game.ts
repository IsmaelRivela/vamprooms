import * as THREE from 'three';
import { generateDungeon, isPlayerInGalleryZone } from '../generation/DungeonGenerator';
import { Player, findNearestInteractable, findNearestPickable } from './Player';
import { PS1Renderer } from '../rendering/PS1Renderer';
import { buildWorld, loadWorldLayouts, loadWorldModels, preloadProjectImages } from '../world/RoomBuilder';
import { resetTvGlitchScreens, updateTvGlitchScreens, findNearestTv } from '../world/TvScreenFx';
import { preloadAllTinyTextures } from '../world/TinyTextures';
import { spinModels } from '../world/ModelLoader';
import { loadLayout } from '../world/RoomLayout';
import { BackroomsAmbience } from '../audio/BackroomsAmbience';
import { Flashlight } from './Flashlight';
import { CigaretteItem } from './CigaretteItem';
import { WorldLighting } from './WorldLighting';
import {
  getProjects,
  showPrompt,
  hidePrompt,
  openProjectPanel,
  isPanelOpen,
  closePanel,
} from '../ui/HUD';

export class Game {
  private ps1: PS1Renderer;
  readonly player: Player;
  private worldRoot: ReturnType<typeof buildWorld> | null = null;
  private dungeonGraph: ReturnType<typeof generateDungeon> | null = null;
  private seed: number | undefined;
  private clock = 0;
  private raf = 0;
  private lastTime = performance.now();
  private running = true;
  private frame = 0;
  private disposed = false;
  private readonly eventsAbort = new AbortController();
  private worldLighting: WorldLighting | null = null;
  private flashlight: Flashlight | null = null;
  private cigarette: CigaretteItem | null = null;
  private ambience: BackroomsAmbience | null = null;
  private audioStarted = false;

  constructor(canvas: HTMLCanvasElement) {
    this.ps1 = new PS1Renderer(canvas);
    this.player = new Player(canvas);

    const signal = this.eventsAbort.signal;

    window.addEventListener('resize', () => this.ps1.resize(), { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        this.running = document.visibilityState === 'visible';
        if (this.running) this.lastTime = performance.now();
      },
      { signal },
    );
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.code === 'KeyE') this.interact();
        if (e.code === 'KeyR') this.regenerate();
        if (e.code === 'KeyF') this.flashlight?.toggle();
      },
      { signal },
    );

    canvas.addEventListener(
      'click',
      () => {
        if (!this.audioStarted) {
          this.audioStarted = true;
          this.ambience ??= new BackroomsAmbience();
          this.ambience.start();
          return;
        }
        if (
          this.cigarette?.isHeld &&
          this.player.isPointerLocked &&
          !isPanelOpen()
        ) {
          this.cigarette.puff(this.ps1.camera);
        }
      },
      { signal },
    );

    this.regenerate();
    this.loop();
  }

  private regenerate() {
    if (this.worldLighting) {
      this.worldLighting.dispose(this.ps1.scene);
      this.worldLighting = null;
    }
    if (this.flashlight) {
      this.flashlight.dispose();
      this.flashlight = null;
    }
    if (this.cigarette) {
      this.cigarette.dispose();
      this.cigarette = null;
    }
    if (this.worldRoot) {
      resetTvGlitchScreens();
      for (const lasers of this.worldRoot.copydadLasers) lasers.dispose();
      disposeWorldRoot(this.worldRoot.root);
      this.ps1.scene.remove(this.worldRoot.root);
      this.worldRoot = null;
      this.dungeonGraph = null;
    }

    const projects = getProjects();
    let graph: ReturnType<typeof generateDungeon>;
    try {
      graph = generateDungeon(
        projects.map((p) => p.id),
        (id) => projects.find((p) => p.id === id)!.variants.map((v) => v.id),
        {
          seed: this.seed,
          galleryLoop: true,
          genericRoomCount: 14,
          proceduralProjectRepeats: 10,
          corridorMinLength: 2,
          corridorMaxLength: 5,
          gridCellSize: 2.4,
          roomMinSize: 3,
          roomMaxSize: 5,
        },
      );
    } catch (err) {
      console.error('Gallery loop failed, using fallback generator:', err);
      graph = generateDungeon(
        projects.map((p) => p.id),
        (id) => projects.find((p) => p.id === id)!.variants.map((v) => v.id),
        {
          seed: this.seed,
          galleryLoop: false,
          portfolioHub: true,
          genericRoomCount: 12,
          targetProjectRooms: 5,
          corridorMinLength: 2,
          corridorMaxLength: 5,
          gridCellSize: 2.4,
          roomMinSize: 3,
          roomMaxSize: 5,
        },
      );
    }

    this.dungeonGraph = graph;
    this.seed = graph.seed;

    void (async () => {
      const layoutEntries = await Promise.all(
        projects.map(async (p) => [p.id, await loadLayout(p.id)] as const),
      );
      if (this.disposed) return;
      const layoutsByProject = Object.fromEntries(layoutEntries);
      this.worldRoot = buildWorld(graph, projects, layoutsByProject);
      this.ps1.scene.add(this.worldRoot.root);
      this.player.spawnAt(this.worldRoot.spawnPosition, 0);
      this.player.resolveSpawn(this.worldRoot.colliders);

      this.worldLighting = new WorldLighting(this.ps1.scene);
      this.worldLighting.setFixtures(this.worldRoot.lightFixtures);
      this.flashlight = new Flashlight(this.ps1.scene, this.ps1.camera);
      void this.flashlight.loadModel();
      this.cigarette = new CigaretteItem(this.ps1.scene, this.ps1.camera);

      await preloadProjectImages(projects);
      if (this.disposed || !this.worldRoot) return;
      await preloadAllTinyTextures(projects.map((p) => p.theme));
      if (this.disposed || !this.worldRoot) return;
      await loadWorldLayouts(this.worldRoot, projects, graph);
      if (this.disposed || !this.worldRoot) return;
      await loadWorldModels(this.worldRoot);
    })();
  }

  private interact() {
    if (isPanelOpen()) {
      closePanel();
      return;
    }
    if (!this.worldRoot) return;

    const tv = findNearestTv(this.player.position, this.player.yaw);
    if (tv) {
      tv.toggle();
      return;
    }

    if (this.cigarette && !this.cigarette.isHeld) {
      const pick = findNearestPickable(
        this.player.position,
        this.player.yaw,
        this.worldRoot.pickables,
      );
      if (pick?.kind === 'cigarette') {
        this.cigarette.pickUp(pick.root);
        return;
      }
    }

    const target = findNearestInteractable(
      this.player.position,
      this.player.yaw,
      this.worldRoot.interactables,
    );
    if (target) openProjectPanel(target.project);
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.clock += dt;
    this.frame++;

    const panelOpen = isPanelOpen();

    if (this.worldRoot && !panelOpen) {
      this.player.update(dt, this.worldRoot.colliders);
      if (this.frame % 2 === 0) {
        spinModels(this.worldRoot.root, dt * 2, this.player.position);
      }
    }

    this.player.applyToCamera(this.ps1.camera);

    if (this.worldLighting && this.worldRoot && this.dungeonGraph) {
      const inGallery = isPlayerInGalleryZone(this.dungeonGraph, this.player.position);
      this.worldLighting.update(
        this.clock,
        this.player.position,
        this.flashlight?.enabled ?? false,
        inGallery,
      );
    }
    this.flashlight?.update(this.ps1.camera);
    this.flashlight?.updateFlicker(this.clock);
    this.cigarette?.update(dt);
    updateTvGlitchScreens(this.clock);

    if (this.worldRoot?.copydadLasers.length) {
      for (const lasers of this.worldRoot.copydadLasers) {
        lasers.update(dt, this.player.position);
      }
    }

    if (this.worldRoot && !panelOpen && this.frame % 4 === 0) {
      if (!this.player.isPointerLocked) {
        showPrompt('Click en el juego — WASD mover');
      } else if (this.cigarette?.isHeld) {
        showPrompt('[Click] fumar');
      } else {
        const tv = findNearestTv(this.player.position, this.player.yaw);
        if (tv) {
          showPrompt(tv.on ? '[E] apagar tele' : '[E] encender tele');
        } else {
          const pick = findNearestPickable(
            this.player.position,
            this.player.yaw,
            this.worldRoot.pickables,
          );
          if (pick?.kind === 'cigarette') {
            showPrompt('[E] coger cajetilla');
          } else {
            const target = findNearestInteractable(
              this.player.position,
              this.player.yaw,
              this.worldRoot.interactables,
            );
            if (target) showPrompt(`[E] ${target.project.title}`);
            else hidePrompt();
          }
        }
      }
    } else if (panelOpen) {
      hidePrompt();
    }

    if (!panelOpen) {
      this.ps1.render(this.clock);
    }
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.eventsAbort.abort();
    this.player.dispose();
    this.worldLighting?.dispose(this.ps1.scene);
    this.flashlight?.dispose();
    this.cigarette?.dispose();
    this.ambience?.dispose();
    if (this.worldRoot) {
      resetTvGlitchScreens();
      for (const lasers of this.worldRoot.copydadLasers) lasers.dispose();
      disposeWorldRoot(this.worldRoot.root);
    }
    this.ps1.dispose();
  }
}

function disposeWorldRoot(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of materials) {
      if (!mat) continue;
      for (const key of Object.keys(mat) as (keyof typeof mat)[]) {
        const val = mat[key];
        if (val instanceof THREE.Texture) val.dispose();
      }
      mat.dispose();
    }
  });
}
