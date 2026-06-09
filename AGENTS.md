# Ulugo Project Notes

Keep code changes minimal and scoped to each task. Prefer simpler code and less code. Pause on errors, blockers, or unclear requirements.
When adding string to i18n.ts, update the translation for all languages.

## Project Shape

- This is a pnpm workspace monorepo for Ulugo, a Go/Weiqi SGF editor.
- `apps/web` is the React + Vite UI. It uses Ant Design in compact mode and should prefer small Antd components.
- `apps/electron` wraps the same web UI for desktop and owns Electron-only KataGo integration.
- `packages/sgf-core` owns SGF document parsing, editing, and serialization behavior.
- `packages/go-core` owns Go board position derivation and rules-related board state.
- `packages/react-shudan` is the local React TypeScript fork of Shudan used for board rendering.
- `packages/analysis-core`, `packages/katago-core`, and `packages/sgf-analysis-tree` hold shared analysis, KataGo settings/types, and tree helpers.

## UI Conventions

- Reuse the same React UI for web and Electron. Show or hide platform-specific controls with capability flags instead of creating separate UI implementations.
- Keep the board as large as possible. Avoid responsive relayout that moves side panels below the board.
- IndexedDB open/save controls are web-only. Electron uses file import/export and KataGo/analysis controls.
- Localization lives in `apps/web/src/features/localization/i18n.ts`; keep locale keys aligned across all languages.

## KataGo And Analysis

- KataGo process management and downloads are Electron-only.
- Analysis data should be cached by SGF node id so fast/live analysis does not recalculate unchanged nodes unnecessarily.
- Fast analysis should cover existing SGF moves and continue working as new moves are added.
- Board analysis display should follow KaTrain/Sabaki behavior where practical, while using the Ulugo/Shudan rendering path.

## Commands

- Web typecheck: `pnpm --filter @ulugo/web typecheck`
- Web build: `pnpm --filter @ulugo/web build`
- Electron dev: `pnpm dev:electron`
- Full typecheck: `pnpm typecheck`
