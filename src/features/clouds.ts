// Slow-moving cumulus clouds drifting across the sky in the parallax layer.
//
// A cosmetic feature in the shape architecture 2.2 describes: installed from
// outside the game loop, keeps its own state in a closure, resets on start and
// restart, and only draws. Visual randomness uses the feature's own `Rng`
// seeded with `state.seed ^ SALT`, so the course stays reproducible and the
// game's spawn `Rng` is never touched.

import { createRng } from '../rng.js';
import type { Renderer } from '../render.js';
import { CANVAS, CLOUDS, PALETTE } from '../tuning.js';
import type { DrawContext, Game, LayerDraw, Rng } from '../types.js';

const SALT = 0xc10d5;

interface Cloud {
  readonly worldX: number;
  readonly y: number;
}

export interface CloudsDeps {
  readonly game: Pick<Game, 'on'>;
  readonly renderer: Pick<Renderer, 'addLayer'>;
}

/** Pixel-art cloud: four stacked rows, widening toward the bottom. */
function drawCloud(ctx: DrawContext, x: number, y: number): void {
  ctx.fillRect(x + 10, y, 12, 2);
  ctx.fillRect(x + 4, y + 2, 24, 2);
  ctx.fillRect(x + 2, y + 4, 28, 2);
  ctx.fillRect(x, y + 6, 32, 4);
}

/** Installs the clouds; the returned function removes them again. */
export function installClouds({ game, renderer }: CloudsDeps): () => void {
  let clouds: Cloud[] = [];
  let rng: Rng | null = null;
  let nextSpawnScroll = 0;

  const reset = (): void => {
    clouds = [];
    rng = null;
    nextSpawnScroll = 0;
  };

  const randomGap = (r: Rng): number =>
    CLOUDS.minSpawnGap + r.next() * (CLOUDS.maxSpawnGap - CLOUDS.minSpawnGap);

  const randomY = (r: Rng): number =>
    CLOUDS.minY + Math.floor(r.next() * (CLOUDS.maxY - CLOUDS.minY));

  const draw: LayerDraw = (ctx, state) => {
    // Nothing to draw before the first run of an unseeded page.
    if (state.seed === null) return;

    // (Re)seed on the first draw after start / restart. Keyed to the run seed
    // XOR a feature-local salt, so a seeded page replays the same sky.
    if (rng === null) {
      rng = createRng(state.seed ^ SALT);
      for (let i = 0; i < CLOUDS.initialCount; i += 1) {
        clouds.push({
          worldX: state.scrollX + rng.next() * CANVAS.width,
          y: randomY(rng),
        });
      }
      nextSpawnScroll = state.scrollX + randomGap(rng);
    }

    // Spawn new clouds just off the right edge as the ground scrolls past.
    while (state.scrollX >= nextSpawnScroll) {
      clouds.push({
        worldX: state.scrollX + CANVAS.width + CLOUDS.width,
        y: randomY(rng),
      });
      nextSpawnScroll += randomGap(rng);
    }

    ctx.fillStyle = PALETTE.fg;
    const alive: Cloud[] = [];
    for (const cloud of clouds) {
      const screenX = Math.round(
        cloud.worldX - state.scrollX * CLOUDS.parallaxFactor,
      );
      if (screenX + CLOUDS.width < 0) continue;
      alive.push(cloud);
      drawCloud(ctx, screenX, cloud.y);
    }
    clouds = alive;
  };

  const offStart = game.on('start', reset);
  const offRestart = game.on('restart', reset);
  // Parallax runs before `world`, so the ground and the dinosaur paint over
  // anything that drifts behind them.
  const removeLayer = renderer.addLayer('parallax', draw);

  return () => {
    offStart();
    offRestart();
    removeLayer();
  };
}
