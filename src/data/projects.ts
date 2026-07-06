/** Assets servidos desde levamps.com (CORS *) */
export const VAMPS_CDN = 'https://levamps.com';

export interface ModelDisplayOptions {
  /** Rotación local [x, y, z] en radianes */
  rotation?: [number, number, number];
  scaleMultiplier?: number;
  spin?: boolean;
  yOffset?: number;
  /** Apoya la base del modelo en Y=0 (evita hundirse en el suelo) */
  floorAlign?: boolean;
}

export interface ProjectAsset {
  id: string;
  label: string;
  src: string;
  type: 'image' | 'video' | 'model';
  /** Escala objetivo tras fit (solo model) */
  modelScale?: number;
  /** Ajustes de presentación del modelo 3D */
  modelDisplay?: ModelDisplayOptions;
}

export interface ProjectTheme {
  wall: 'backrooms' | 'nature' | 'florist' | 'brick-alley' | 'wardrobe' | 'brand-red' | 'clinical' | 'locker' | 'xp-blue';
  floor: 'carpet' | 'grass' | 'dirt-wood' | 'concrete' | 'clinical-tile' | 'linoleum' | 'checker';
  ceilTint?: number;
}

export interface ProjectVariant {
  id: string;
  name: string;
  wallTint: number;
  floorTint: number;
  lightColor: number;
  lightIntensity: number;
  layout: 'gallery' | 'arcade' | 'studio' | 'void' | 'showroom';
}

export interface Project {
  id: string;
  title: string;
  description: string;
  tags: string[];
  url?: string;
  year?: number;
  theme: ProjectTheme;
  assets: ProjectAsset[];
  variants: ProjectVariant[];
}

export const PROJECTS: Project[] = [
  {
    id: 'la-tulipana',
    title: 'La Tulipana',
    description:
      'Floristería con base en Londres. Identidad de marca — logo, ASCII art, RRSS — y web para la colección del Día de la Madre. La tensión entre lo digital y lo artesanal como hilo conductor.',
    tags: ['branding', 'web', 'ascii art'],
    url: `${VAMPS_CDN}/creative/tulipana-case/`,
    year: 2024,
    theme: { wall: 'florist', floor: 'grass', ceilTint: 0xf5f0e4 },
    assets: [
      {
        id: 'hero',
        label: 'Hero',
        src: `${VAMPS_CDN}/assets/cabecera3-CL0Rqdwe.jpg`,
        type: 'image',
      },
      {
        id: 'ascii',
        label: 'ASCII Art',
        src: `${VAMPS_CDN}/assets/projects/tulipana/closeup.webp`,
        type: 'image',
      },
      {
        id: 'web',
        label: 'Web',
        src: `${VAMPS_CDN}/assets/header-tulip-ZdTYZVYx.jpg`,
        type: 'image',
      },
    ],
    variants: [
      {
        id: 'coral',
        name: 'Coral Studio',
        wallTint: 0x3a2820,
        floorTint: 0x2a1810,
        lightColor: 0xed5b51,
        lightIntensity: 1.1,
        layout: 'gallery',
      },
      {
        id: 'cream',
        name: 'Cream Archive',
        wallTint: 0x383028,
        floorTint: 0x282018,
        lightColor: 0xfbf2f0,
        lightIntensity: 0.95,
        layout: 'studio',
      },
      {
        id: 'ascii',
        name: 'ASCII Void',
        wallTint: 0x201818,
        floorTint: 0x100c0c,
        lightColor: 0x88aa88,
        lightIntensity: 0.75,
        layout: 'void',
      },
    ],
  },
  {
    id: 'copydad',
    title: 'Copydad',
    description:
      'Marca de piezas únicas sacadas del armario de tu padre, entre Nueva York y Madrid. Concepto con Max: el valor no está en la prenda, sino en el lazo de decir "se lo robé a mi padre".',
    tags: ['branding', 'concept', 'fashion'],
    url: `${VAMPS_CDN}/creative/copydad-case/`,
    year: 2024,
    theme: { wall: 'brick-alley', floor: 'dirt-wood', ceilTint: 0x282018 },
    assets: [
      {
        id: 'logo',
        label: 'Logo Construction',
        src: `${VAMPS_CDN}/assets/projects/copydad/Logo-construction960.jpg`,
        type: 'image',
      },
      {
        id: 'inkbleed',
        label: 'Inkbleed',
        src: `${VAMPS_CDN}/assets/projects/copydad/inkbleed-version2.jpg`,
        type: 'image',
      },
      {
        id: 'shirts',
        label: 'Shirts',
        src: `${VAMPS_CDN}/assets/projects/copydad/shirts.png`,
        type: 'image',
      },
    ],
    variants: [
      {
        id: 'wardrobe',
        name: 'Wardrobe',
        wallTint: 0x181410,
        floorTint: 0x0c0a08,
        lightColor: 0xffeedd,
        lightIntensity: 0.9,
        layout: 'gallery',
      },
      {
        id: 'nyc',
        name: 'NYC Alley',
        wallTint: 0x101018,
        floorTint: 0x080810,
        lightColor: 0x6688ff,
        lightIntensity: 1.0,
        layout: 'void',
      },
      {
        id: 'stickers',
        name: 'Sticker Room',
        wallTint: 0x201810,
        floorTint: 0x100c08,
        lightColor: 0xff6644,
        lightIntensity: 1.2,
        layout: 'studio',
      },
      {
        id: 'thief',
        name: 'Lil Thief',
        wallTint: 0x141414,
        floorTint: 0x0a0a0a,
        lightColor: 0xffffff,
        lightIntensity: 0.85,
        layout: 'arcade',
      },
    ],
  },
  {
    id: 'vamps-brand',
    title: 'VAMPS',
    description:
      'Proyecto creativo personal. Un guiño a Vans — "Vamps of the world". Personajes pillos, desenfadados y difícilmente controlables. Identidad visual, tipografía y aplicaciones del concept brand.',
    tags: ['brand identity', 'creative direction', 'concept'],
    url: `${VAMPS_CDN}/creative/vamps-case/`,
    year: 2024,
    theme: { wall: 'brand-red', floor: 'concrete', ceilTint: 0x141414 },
    assets: [
      {
        id: 'logo',
        label: 'Logo Construction',
        src: `${VAMPS_CDN}/assets/isologotest-CUumRRNO.png`,
        type: 'image',
      },
      {
        id: 'color',
        label: 'Color System',
        src: `${VAMPS_CDN}/assets/color-CYBrPekw.jpg`,
        type: 'image',
      },
      {
        id: 'editorial',
        label: 'Editorial',
        src: `${VAMPS_CDN}/assets/vamps-edit-BFtg-efJ.png`,
        type: 'image',
      },
    ],
    variants: [
      {
        id: 'red',
        name: 'Vamps Red',
        wallTint: 0x280808,
        floorTint: 0x180404,
        lightColor: 0xff0600,
        lightIntensity: 1.3,
        layout: 'gallery',
      },
      {
        id: 'gothic',
        name: 'Gothic Type',
        wallTint: 0x101010,
        floorTint: 0x080808,
        lightColor: 0xcc4444,
        lightIntensity: 0.9,
        layout: 'void',
      },
      {
        id: 'school',
        name: 'School Day',
        wallTint: 0x282018,
        floorTint: 0x181008,
        lightColor: 0xffcc66,
        lightIntensity: 1.0,
        layout: 'studio',
      },
    ],
  },
  {
    id: 'vamps-pharma',
    title: 'VAMPS Pharma',
    description:
      'Colección concept: anillo, nails, posters, camisetas y packaging farmacéutico. Experiencia interactiva con productos 3D — porque a veces necesitas una tirita de más.',
    tags: ['VAMPS', '3D', 'fashion', 'interactive'],
    url: `${VAMPS_CDN}/vamps/pharma/`,
    year: 2024,
    theme: { wall: 'clinical', floor: 'clinical-tile', ceilTint: 0xf0f4f8 },
    assets: [
      {
        id: 'ring',
        label: 'Fang Ring',
        src: '/assets/vamps/pharma/3d/vampire+fang+ring+3d+model.opt.glb',
        type: 'model',
        modelScale: 0.7,
        modelDisplay: {
          scaleMultiplier: 0.55,
          rotation: [-0.47, 0, -1.57],
          spin: true,
        },
      },
      {
        id: 'nails',
        label: 'Nail Art',
        src: '/assets/vamps/pharma/3d/nail+art+3d+model.opt.glb',
        type: 'model',
        modelScale: 0.85,
        modelDisplay: { spin: true },
      },
      {
        id: 'shirt',
        label: 'White Tee',
        src: '/assets/vamps/pharma/3d/white+t-shirt+3d+model.opt.glb',
        type: 'model',
        modelScale: 0.9,
        modelDisplay: {
          rotation: [0, Math.PI, 0],
          spin: true,
        },
      },
      {
        id: 'poster',
        label: 'Pharma Poster',
        src: `${VAMPS_CDN}/assets/cerrado-pharma-pix2-BKPfGJxJ.png`,
        type: 'image',
      },
    ],
    variants: [
      {
        id: 'clinic',
        name: 'Clinic',
        wallTint: 0xe8e8f0,
        floorTint: 0xc8c8d0,
        lightColor: 0xffffff,
        lightIntensity: 1.4,
        layout: 'showroom',
      },
      {
        id: 'night',
        name: 'Night Pharma',
        wallTint: 0x181820,
        floorTint: 0x0c0c14,
        lightColor: 0xc22424,
        lightIntensity: 1.2,
        layout: 'showroom',
      },
      {
        id: 'retail',
        name: 'Retail Shelf',
        wallTint: 0x282018,
        floorTint: 0x181008,
        lightColor: 0xffaa44,
        lightIntensity: 1.0,
        layout: 'showroom',
      },
    ],
  },
  {
    id: 'vamps-back2school',
    title: 'Back2School',
    description:
      'Drop escolar de VAMPS. Camisetas oversize, pizza cursor y una caja de pizza 3D que no deberías abrir en clase. VAMPBOY screen print incluido.',
    tags: ['VAMPS', '3D', 'merch', 'web'],
    url: `${VAMPS_CDN}/vamps/back2school/`,
    year: 2024,
    theme: { wall: 'locker', floor: 'linoleum', ceilTint: 0xe8e0c8 },
    assets: [
      {
        id: 'pizza-box',
        label: 'Pizza Box',
        src: '/assets/vamps/pharma/3d/cajapizza3.glb',
        type: 'model',
        modelScale: 1.0,
        modelDisplay: { spin: true, yOffset: 0.05 },
      },
      {
        id: 'tee',
        label: 'VAMPBOY Tee',
        src: `${VAMPS_CDN}/assets/thumbnaild-camiseta-Cz6_Mttm.jpg`,
        type: 'image',
      },
      {
        id: 'look1',
        label: 'Lookbook',
        src: `${VAMPS_CDN}/assets/b2s-1-BCAdGlzU.webp`,
        type: 'image',
      },
      {
        id: 'look2',
        label: 'Campaign',
        src: `${VAMPS_CDN}/assets/vamps-image-asset-back2school1-BbF6PGx6.webp`,
        type: 'image',
      },
    ],
    variants: [
      {
        id: 'cafeteria',
        name: 'Cafeteria',
        wallTint: 0x283018,
        floorTint: 0x182008,
        lightColor: 0xffcc44,
        lightIntensity: 1.1,
        layout: 'showroom',
      },
      {
        id: 'hallway',
        name: 'Hallway',
        wallTint: 0x203028,
        floorTint: 0x101820,
        lightColor: 0x88ccff,
        lightIntensity: 0.95,
        layout: 'showroom',
      },
      {
        id: 'locker',
        name: 'Locker Room',
        wallTint: 0x302018,
        floorTint: 0x201008,
        lightColor: 0xff8844,
        lightIntensity: 1.0,
        layout: 'gallery',
      },
      {
        id: 'xp',
        name: 'Windows XP',
        wallTint: 0x184878,
        floorTint: 0x0c2840,
        lightColor: 0xaaddff,
        lightIntensity: 1.2,
        layout: 'arcade',
      },
    ],
  },
];
