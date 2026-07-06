import { PROJECTS } from '../data/projects';
import type { Project } from '../data/projects';

const promptEl = document.getElementById('prompt')!;
const panelEl = document.getElementById('panel')!;
const panelContentEl = document.getElementById('panel-content')!;
const panelCloseEl = document.getElementById('panel-close')!;

let open = false;

panelCloseEl.addEventListener('click', () => closePanel());

document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && open) closePanel();
});

export function showPrompt(text: string) {
  promptEl.textContent = text;
  promptEl.classList.remove('hidden');
}

export function hidePrompt() {
  promptEl.classList.add('hidden');
}

export function openProjectPanel(project: Project) {
  open = true;
  document.exitPointerLock();

  const tags = project.tags.map((t) => `<span class="tag">${t}</span>`).join('');
  const link = project.url
    ? `<a href="${project.url}" target="_blank" rel="noopener">Ver proyecto →</a>`
    : '';
  const hero = project.assets.find((a) => a.type === 'image');
  const heroImg = hero
    ? `<img class="panel-hero" src="${hero.src}" alt="${hero.label}" crossorigin="anonymous" loading="lazy" />`
    : '';

  panelContentEl.innerHTML = `
    ${heroImg}
    <h2>${project.title}</h2>
    ${project.year ? `<div class="tag">${project.year}</div>` : ''}
    ${tags}
    <p>${project.description}</p>
    ${link}
  `;

  panelEl.classList.remove('hidden');
}

export function closePanel() {
  open = false;
  panelEl.classList.add('hidden');
}

export function isPanelOpen() {
  return open;
}

export function getProjects() {
  return PROJECTS;
}
