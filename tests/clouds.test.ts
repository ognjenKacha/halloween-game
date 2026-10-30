// Parallax clouds: an ambient background that drifts in the sky, deterministic
// from the run seed and resetting on start and restart. Driven through a real
// game and the real layer stack into a recording fake context.

import { describe, expect, it } from 'vitest';
import { installClouds } from '../src/features/clouds.js';
import { createLayerStack } from '../src/render.js';
import { CANVAS, CLOUDS, PALETTE } from '../src/tuning.js';
import type { GameState } from '../src/types.js';
import {
  fakeContext,
  makeGame,
  pressPrimary,
  type Call,
  type TestGame,
} from './helpers.js';

type FillRect = Extract<Call, { op: 'fillRect' }>;

interface Frame {
  readonly rects: readonly (FillRect & { readonly style: unknown })[];
}

/** The y-band clouds live in; everything else draws below here. */
const SKY_BOTTOM = CLOUDS.maxY + CLOUDS.height;

function setup(seed?: number): {
  game: TestGame['game'];
  render: (state?: GameState) => Frame;
  dispose: () => void;
} {
  const { game } = makeGame(seed);
  const stack = createLayerStack();
  const dispose = installClouds({ game, renderer: stack });
  function render(state: GameState = game.view()): Frame {
    const ctx = fakeContext();
    stack.run(ctx, state);
    let style: unknown = undefined;
    const rects: (FillRect & { style: unknown })[] = [];
    for (const call of ctx.calls) {
      if (call.op === 'fillStyle') style = call.value;
      if (call.op === 'fillRect') rects.push({ ...call, style });
    }
    return { rects };
  }
  return { game, render, dispose };
}

/** Rects in the sky band — ground, obstacles, dino and HUD text live below it. */
const sky = (frame: Frame) =>
  frame.rects.filter((r) => r.y + r.h <= SKY_BOTTOM);

describe('parallax clouds', () => {
  it('draws nothing in the sky before the first run of an unseeded page', () => {
    const { render } = setup(undefined);
    expect(sky(render())).toEqual([]);
  });

  it('fills the sky with cloud pixels once a run has a seed, in PALETTE.fg', () => {
    const { game, render } = setup(42);
    pressPrimary(game);
    const rects = sky(render());
    expect(rects.length).toBeGreaterThan(0);
    for (const r of rects) {
      expect(r.style).toBe(PALETTE.fg);
      expect(r.y).toBeGreaterThanOrEqual(CLOUDS.minY);
      expect(r.y + r.h).toBeLessThanOrEqual(SKY_BOTTOM);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(CANVAS.width);
      for (const n of [r.x, r.y, r.w, r.h])
        expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('is deterministic from the seed: two games at the same seed draw the same clouds', () => {
    const a = setup(42);
    const b = setup(42);
    pressPrimary(a.game);
    pressPrimary(b.game);
    expect(sky(a.render())).toEqual(sky(b.render()));
  });

  it('resets on restart: the sky after a crash and restart matches the fresh sky', () => {
    const { game, render } = setup(42);
    pressPrimary(game);
    const first = sky(render());
    // Crash into the first obstacle (seed 42 never jumps), then restart.
    for (let i = 0; i < 600 && game.view().phase !== 'dead'; i += 1) {
      game.tick();
    }
    expect(game.view().phase).toBe('dead');
    pressPrimary(game);
    expect(game.view().phase).toBe('running');
    expect(sky(render())).toEqual(first);
  });

  it('drifts to the left as scrollX advances (parallax)', () => {
    const { game, render } = setup(42);
    pressPrimary(game);
    const before = sky(render()).map((r) => r.x);
    for (let i = 0; i < 60; i += 1) game.tick();
    const after = sky(render()).map((r) => r.x);
    // At least one cloud from the initial batch is still on-screen and has
    // moved left. Comparing the minima is robust to new clouds spawning on
    // the right while old ones shift left.
    expect(Math.min(...after)).toBeLessThan(Math.min(...before));
  });

  it('draws nothing after dispose', () => {
    const { game, render, dispose } = setup(42);
    pressPrimary(game);
    dispose();
    expect(sky(render())).toEqual([]);
  });
});
