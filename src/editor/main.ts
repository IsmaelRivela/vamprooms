import './editor.css';
import { LayoutEditor } from './LayoutEditor';

const root = document.getElementById('editor-root');
if (!root) throw new Error('#editor-root missing');

new LayoutEditor({
  canvas: document.getElementById('viewport') as HTMLCanvasElement,
  previewCanvas: document.getElementById('preview-canvas') as HTMLCanvasElement,
  roomSelect: document.getElementById('room-select') as HTMLSelectElement,
  catalogList: document.getElementById('catalog-list')!,
  catalogSearch: document.getElementById('catalog-search') as HTMLInputElement,
  inspectorForm: document.getElementById('inspector-form') as HTMLFormElement,
  inspectorEmpty: document.getElementById('inspector-empty')!,
  propCount: document.getElementById('prop-count')!,
  roomLoading: document.getElementById('room-loading')!,
  previewLabel: document.getElementById('preview-label')!,
  importDialog: document.getElementById('import-dialog') as HTMLDialogElement,
  importText: document.getElementById('import-text') as HTMLTextAreaElement,
  importFile: document.getElementById('import-file') as HTMLInputElement,
  wallPresetSelect: document.getElementById('wall-preset') as HTMLSelectElement,
  floorPresetSelect: document.getElementById('floor-preset') as HTMLSelectElement,
  wallTextureGrid: document.getElementById('wall-texture-grid')!,
  floorTextureGrid: document.getElementById('floor-texture-grid')!,
});
