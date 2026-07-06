import './style.css';
import { Game } from './game/Game';

let game: Game | undefined;

function startGame() {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  if (!canvas) return;

  game?.dispose();
  game = new Game(canvas);

  if (import.meta.env.DEV) {
    (window as unknown as { __game: Game }).__game = game;
  }

  canvas.focus({ preventScroll: true });
}

startGame();

window.addEventListener('beforeunload', () => game?.dispose());

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.dispose();
    game = undefined;
  });
}
