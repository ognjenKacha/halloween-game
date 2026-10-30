import { describe, expect, it } from 'vitest';
import { installMoon } from '../src/features/moon.js';
import { createLayerStack } from '../src/render.js';
import { MOON, PALETTE } from '../src/tuning.js';
import { fakeContext, makeGame, type Call } from './helpers.js';

type FillRect = Extract<Call, { op: 'fillRect' }>;

describe('moon', () => {
  it('draws a disc in PALETTE.moon in the background layer, and nothing after dispose', () => {
    const { game } = makeGame(1);
    const stack = createLayerStack();
    const dispose = installMoon({ game, renderer: stack });
    const ctx = fakeContext();
    stack.run(ctx, game.view());
    let style: unknown;
    const moonRects: FillRect[] = [];
    for (const call of ctx.calls) {
      if (call.op === 'fillStyle') style = call.value;
      if (call.op === 'fillRect' && style === PALETTE.moon) moonRects.push(call);
    }
    expect(moonRects.length).toBeGreaterThan(0);
    for (const r of moonRects) {
      expect(r.x + r.w).toBeGreaterThan(MOON.cx - MOON.r - 1);
      expect(r.x).toBeLessThan(MOON.cx + MOON.r + 1);
      expect(r.y).toBeGreaterThanOrEqual(MOON.cy - MOON.r);
      expect(r.y).toBeLessThanOrEqual(MOON.cy + MOON.r);
    }
    dispose();
    const after = fakeContext();
    stack.run(after, game.view());
    const afterMoon = after.calls.some(
      (c) => c.op === 'fillStyle' && c.value === PALETTE.moon,
    );
    expect(afterMoon).toBe(false);
  });
});
