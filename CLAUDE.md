# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ws-scrcpy is a web-based client for Android (and experimental iOS) device control via WebSockets. It enables remote screen casting, device control, file management, and debugging through a browser interface using a modified scrcpy server with WebSocket support.

## Build Commands

```bash
npm install          # Install dependencies (requires node-gyp and build tools)
npm run dist:dev     # Development build with source maps
npm run dist:prod    # Production build
npm start            # Build and start server
npm run lint         # Run ESLint
npm run format       # Auto-fix linting issues
```

**Requirements:**
- Node.js v10+
- `adb` must be in PATH for Android device support
- node-gyp and build tools (for native modules like node-pty)

## Architecture

### Dual Entry Points

The project builds two separate bundles via webpack:
- **Frontend** (`src/app/index.ts` → `dist/public/bundle.js`): Browser client
- **Backend** (`src/server/index.ts` → `dist/index.js`): Node.js server

### Core Patterns

**Middleware Pattern (Mw):** All WebSocket request handlers extend the abstract `Mw` class (`src/server/mw/Mw.ts`). Each middleware processes specific request types via `processRequest()` or `processChannel()`. Registered with WebSocketServer and Multiplexer.

**Service Pattern:** Services implement `start()`, `release()`, `getName()` with singleton `getInstance()`. Examples: `HttpServer`, `WebSocketServer`, `ControlCenter`.

**Multiplexer:** Located in `src/packages/multiplexer/`. Enables multiple virtual channels over a single WebSocket connection. Used for managing concurrent device connections efficiently.

### Key Directories

```
src/app/                    # Frontend code
  ├── googDevice/           # Android device handling (clients, toolbox, file push)
  ├── applDevice/           # iOS device handling (experimental)
  ├── player/               # Video decoders (Broadway, MSE, TinyH264, WebCodecs)
  └── client/               # Base client classes

src/server/                 # Backend code
  ├── goog-device/          # Android: middleware, services, ADB commands
  ├── appl-device/          # iOS: middleware, services
  ├── services/             # Core services (HttpServer, WebSocketServer)
  └── mw/                   # Middleware (WebsocketProxy, Multiplexer, etc.)

src/packages/multiplexer/   # WebSocket channel multiplexing
```

### Video Decoders

Four H.264 decoder implementations (all extend `BasePlayer`):
- **MsePlayer**: Media Source Extensions, creates MP4 containers from NALUs
- **BroadwayPlayer**: WebAssembly software decoder
- **TinyH264Player**: Optimized wasm decoder using WebWorkers + WebGL
- **WebCodecsPlayer**: Browser native VideoDecoder API (Chromium only)

### Build Configuration

Feature flags in `webpack/default.build.config.json` control module inclusion:
- `INCLUDE_GOOG/INCLUDE_APPL` - Android/iOS support
- `INCLUDE_ADB_SHELL/INCLUDE_DEV_TOOLS/INCLUDE_FILE_LISTING` - Feature modules
- `USE_BROADWAY/USE_H264_CONVERTER/USE_TINY_H264/USE_WEBCODECS` - Decoder selection

Override via `build.config.override.json`. Uses `ifdef-loader` for conditional compilation.

### Runtime Configuration

Set `WS_SCRCPY_CONFIG` environment variable to YAML/JSON config file path.
Config schema: `src/types/Configuration.d.ts`
Example: `config.example.yaml`

### WebSocket Routing

Requests are routed via URL query parameter `?action=` (scrcpy, shell, devtools, filelisting) combined with `?udid=` for device identification.

## Security Notes

- No built-in encryption or authorization
- Configure HTTPS for production (see config options)
- Modified scrcpy-server listens on all interfaces by default (`SCRCPY_LISTENS_ON_ALL_INTERFACES` flag)