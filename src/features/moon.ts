// A full moon pinned in the night sky, drawn in the `background` layer so it
// never translates with the camera and stays framed by the viewport the whole
// run. Static: it has no state, so there is nothing to reset on start/restart.
//
// Fits the feature contract (architecture 2.2): installed from outside the
// game loop, no DOM / clock / `Math.random`, draws only.

import type { Renderer } from '../render.js';
import { MOON, PALETTE } from '../tuning.js';
import type { DrawContext, Game, LayerDraw } from '../types.js';

export interface MoonDeps {
  readonly game: Pick<Game, 'on'>;
  readonly renderer: Pick<Renderer, 'addLayer'>;
}

/** Fills a disc of radius `r` centred at (cx, cy), row by row, on whole pixels. */
function drawDisc(
  ctx: DrawContext,
  cx: number,
  cy: number,
  r: number,
): void {
  for (let dy = -r; dy <= r; dy += 1) {
    const half = Math.round(Math.sqrt(r * r - dy * dy));
    if (half <= 0) continue;
    ctx.fillRect(cx - half, cy + dy, half * 2, 1);
  }
}

/** Installs the moon; the returned function removes it again. */
export function installMoon(deps: MoonDeps): () => void {
  const draw: LayerDraw = (ctx) => {
    ctx.fillStyle = PALETTE.moon;
    drawDisc(ctx, MOON.cx, MOON.cy, MOON.r);
  };
  const removeLayer = deps.renderer.addLayer('background', draw);
  return () => {
    removeLayer();
  };
}
