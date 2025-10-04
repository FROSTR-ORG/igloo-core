# Repository Guidelines

## Project Structure & Module Organization
Source files live in `src/`, grouped by capability modules such as `peer.ts`, `nostr.ts`, and `validation.ts`; `src/index.ts` re-exports the public API. Jest specs mirror that layout under `tests/`, with shared mocks in `tests/__mocks__`. Example walkthroughs reside in `examples/`, and the compiled output is generated into `dist/`—never edit artifacts there; run `npm run clean` before rebuilding.

## Build, Test, and Development Commands
Use `npm run build` to compile TypeScript into `dist/` and surface type errors. `npm run watch` keeps `tsc` active during iteration. Execute `npm test` for the full Jest suite, adding `--watch` via `npm run test:watch` when debugging. `npm run test:coverage` must accompany substantial changes to confirm coverage health. For end-to-end confidence, run `npm run demo`, `npm run examples`, and `npm run validate-example`, which build first and then execute the scripts in `examples/`.

## Coding Style & Naming Conventions
Write TypeScript with two-space indentation and prefer named exports. Keep relative imports suffixed with `.js` to align with the emitted ESM build (`type: "module"`). Classes remain PascalCase, while functions, constants, and instances use lowerCamelCase. Verify typing locally with `npm run build` before opening pull requests.

## Testing Guidelines
Tests belong in `tests/**/*.test.ts` and should mirror the module they exercise (e.g., `peer.test.ts`). Rely on Jest with `ts-jest` for TypeScript support, and isolate external dependencies through `tests/__mocks__`. Aim to maintain or raise branch coverage; review the HTML report under `coverage/` after running `npm run test:coverage`.

## Commit & Pull Request Guidelines
Adopt Conventional Commits such as `feat(peer): add monitor hooks` or `fix(validation): tighten schema` to signal intent. Each pull request should summarize the change, link related issues, and paste recent `npm test` (and coverage when relevant) output. Update README or `examples/` whenever the public API or demos change, and avoid committing `dist/` outside release preparation.

## Examples & Usage Verification
Treat the scripts in `examples/` as living documentation: update them alongside feature work and re-run the trio of example commands before merging. When showcasing new flows, add a concise script in `examples/` rather than overloading tests with integration logic.
