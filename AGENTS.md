# Repository Guidelines

## Project Structure & Module Organization
This repo builds a browser client and a Node.js server for ws-scrcpy.
- `src/app/`: frontend TypeScript (players, device clients, UI)
- `src/server/`: backend TypeScript (services, middleware, device handlers)
- `src/packages/multiplexer/`: WebSocket channel multiplexer
- `webpack/`: build configuration and feature flags
- `dist/`: build output (generated)
- `docs/`: feature documentation and devtools notes
- `vendor/`: bundled external artifacts (e.g., scrcpy server jar)

## Build, Test, and Development Commands
Run from repo root:
- `npm install`: install dependencies (node-gyp/build tools required)
- `npm run dist:dev`: dev webpack build with source maps
- `npm run dist:prod` or `npm run dist`: production build
- `npm start`: build then run the server from `dist/`
- `npm run lint`: ESLint over `src/`
- `npm run format`: auto-fix lint issues (ESLint + Prettier)

## Coding Style & Naming Conventions
- TypeScript across frontend and backend; target is ES2020.
- Prettier: 4-space indent, single quotes, trailing commas, 120 char width.
- Prefer explicit, descriptive names: `googDevice`, `applDevice`, `WebSocketServer`.
- Use `PascalCase` for classes, `camelCase` for functions/variables, and `SCREAMING_SNAKE_CASE` for build flags.

## Testing Guidelines
There is no configured test runner (`npm test` exits with error). If you add tests, document the command in `package.json` and mirror file naming like `*.test.ts`.

## Commit & Pull Request Guidelines
Recent history uses Conventional Commit style with scopes, e.g. `chore(ui): ...` or `chore(stream): ...`.
For PRs:
- Describe user-visible changes and any new feature flags.
- Link related issues if available.
- Include screenshots/GIFs for UI changes.

## Configuration & Security Notes
- Runtime config: set `WS_SCRCPY_CONFIG` to a YAML/JSON file (example: `config.example.yaml`).
- Feature flags live in `webpack/default.build.config.json` and can be overridden in `build.config.override.json`.
- No built-in auth or encryption by default; configure HTTPS for production use.
