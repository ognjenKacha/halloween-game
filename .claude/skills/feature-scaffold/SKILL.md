---
name: feature-scaffold
description: Scaffolds a new cosmetic feature in `src/features/` following the architecture rules — `installX({ game, renderer })` with closure state, start/restart reset, and a layered draw callback. Use when the task asks to "add a feature", scaffold or wire a cosmetic visual (clouds, dust on land, screen shake on hit, milestone sparkles, etc.). Not for simulation changes: those go in `game.ts` and the pure modules, and features only subscribe to the resulting events.
---

# Feature scaffold

Cosmetic features in this repo follow a strict shape (see `context/product/architecture.md` §2.2 "Features own their state" and `CLAUDE.md`). Writing one by hand is easy to get wrong — DOM in a non-DOM module, writing to `GameState`, drawing in the wrong layer, forgetting the restart reset, advancing the game's RNG. This skill writes a starter that doesn't make those mistakes.

## When to invoke

Triggers: "add a feature", "scaffold a feature", or any request for a new visual that isn't already in `render.ts` (clouds, parallax hills, dust puff on `land`, screen shake on `die`, confetti on `milestone`…).

Do NOT invoke for:
- Changes to simulation state → put them in `src/game.ts` and emit a new `GameEvent` variant, which the feature subscribes to.
- Changes to the existing HUD text → extend the HUD drawers in `src/render.ts`.
- New input bindings → `src/input.ts` and `src/input-dom.ts`.

## The contract a feature must satisfy

- File location: `src/features/<name>.ts`, kebab-case `<name>`.
- Exports `install<Name>(deps): () => void`. The returned function is `dispose()` — removes every listener and layer.
- Deps shape: `{ readonly game: Pick<Game, 'on'>; readonly renderer: Pick<Renderer, 'addLayer'> }`. Nothing wider than `on` and `addLayer` — a feature cannot `dispatch`, cannot read state outside a draw, cannot `setCamera` unless the design calls for it (and only one feature at a time should).
- State lives in a closure. Never write to `GameState`. Never keep module-level mutable state (it would survive restart).
- Reset on `game.on('start', reset)` AND `game.on('restart', reset)`. Both — a feature installed on the start screen must zero itself when the first run begins, and again on every restart.
- Draw only through `renderer.addLayer(layer, draw)`. Never call `ctx.fillRect` outside a draw callback. The callback signature is `(ctx: DrawContext, state: GameState, frame: RenderFrame) => void`.
- No DOM access, no clock, no timers, no `Math.random`. ESLint will fail the build if any of those appear.
- Simulation-driven animation: subscribe to the relevant event (`tick`, `jump`, `land`, `spawn`, `milestone`, `die`). The simulation freezes while `phase === 'dead'`, so `tick` stops firing then.
- Game-over-screen animation (must keep moving while dead): use `frame.count` passed into the draw callback — it is the render-frame counter, not the tick counter.
- Visual randomness: `createRng(state.seed ^ SALT)` with a unique small integer `SALT` per feature. Never call the game's `Rng` (would desync the course).
- Install from `src/main.ts` after `createRenderer`. The dispose handle is unused — features live for the page.

## Layers (in order)

`background` → `parallax` → `world` → `foreground` → `hud`.

- `background` and `hud` are fixed; `parallax`, `world`, `foreground` move with the camera.
- Built-in drawers register in `world` (ground, obstacles, dino) and `hud` (score, hint, game-over).
- Rule of thumb: sky in `background`, scrolling scenery in `parallax`, interactive props and effects next to the dino in `world`, overlays like dust in `foreground`, text in `hud`.

## Steps when invoked

1. If any of these aren't obvious from the prompt, ask with `AskUserQuestion`:
   - Feature name (kebab-case).
   - Trigger: a game event or "always on while running / dead".
   - Which layer.
   - Whether it needs per-feature randomness → pick a unique integer `SALT`.

2. Add any new tuning numbers (sizes, durations, probabilities) to `src/tuning.ts` as named `as const` exports. Never inline a magic number.

3. Write `src/features/<name>.ts` from the template below, filling in the four placeholders.

4. Wire from `src/main.ts`: `install<Name>({ game, renderer });` after the existing `installPuddle` call. Discard the return.

5. Write `tests/<name>.test.ts`:
   - Nothing drawn in the phases the feature should skip.
   - `start` and `restart` both call `reset` (observable through state changes it owns).
   - The main visual: drive with a recording fake `DrawContext` — see `fakeContext` in `tests/helpers.ts` and the existing `tests/puddle.test.ts` for the shape.
   - Prove each new test RED first (`git apply -R` the feature file, run the one test, see it fail, restore). This is the project's rule.

6. Run `npm test` once as evidence.

## Template

Replace `<kebab>`, `<Pascal>`, `<camel>`.

```ts
// One sentence: what this draws and when.

import type { Renderer } from '../render.js';
import { PALETTE } from '../tuning.js';
import type { Game, LayerDraw } from '../types.js';

export interface <Pascal>Deps {
  readonly game: Pick<Game, 'on'>;
  readonly renderer: Pick<Renderer, 'addLayer'>;
}

export function install<Pascal>({ game, renderer }: <Pascal>Deps): () => void {
  // Closure state. Reset on start / restart; never mutate module-level state.
  let active = false;

  const reset = (): void => {
    active = false;
  };

  // Simulation-driven update: use a game event.
  // Example: const offLand = game.on('land', () => { active = true; });
  const offTick = game.on('tick', () => {
    // mutate closure state based on state/tick as needed
  });

  const draw: LayerDraw = (ctx, state, frame) => {
    if (!active) return;
    // Logical 800x300 coordinates. fillRect / fillText only — no offscreen canvases.
    ctx.fillStyle = PALETTE.fg;
    // ...
  };

  const offStart = game.on('start', reset);
  const offRestart = game.on('restart', reset);
  // Pick: 'background' | 'parallax' | 'world' | 'foreground' | 'hud'
  const removeLayer = renderer.addLayer('world', draw);

  return () => {
    offStart();
    offRestart();
    offTick();
    removeLayer();
  };
}
```

For a feature that must animate while the game is frozen on the dead screen (like `src/features/puddle.ts`), capture `frame.count` the first time you enter `dead` and derive progress from `frame.count - startedAt`. Clear `startedAt` in `reset`.

## Pitfalls

- Features installed into `parallax`, `world`, or `foreground` are translated by the camera; features in `background` or `hud` are not. Position accordingly.
- Never emit from a feature. The bus is one-way: gameplay emits, features subscribe.
- `state.hud.blinkVisible` only hides the score display — a feature that draws over the HUD must honour it itself if the design requires it.
- `scrollX` is the sum of per-step speeds, not `tick * speed`; use it for anything that must stay aligned with the ground.
