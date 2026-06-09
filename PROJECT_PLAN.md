# Web SGF Editor Project Plan

## Goal

Create a pnpm-based monorepo for a browser SGF editor for Go/Weiqi games. The first usable version should feel close to MultiGo's desktop layout: menu and toolbar at the top, board as the main working area, comments in the upper right panel, and an SGF tree in the lower right panel.

References:

- MultiGo screenshot: https://www.ruijiang.com/multigo/multigo.png
- SGF format reference: https://homepages.cwi.nl/~aeb/go/misc/sgf.html
- Shudan upstream fork source: git@github.com:SabakiHQ/Shudan.git
- Sabaki Go board package: https://www.npmjs.com/package/@sabaki/go-board

## Main Assumptions

- This will be a web app first, not an Electron desktop app.
- The board size starts with standard 19x19 support, with 9x9 and 13x13 added through `SZ` support.
- The SGF file is the source of truth. Board state, comments, markup, and game info are rendered from and written back to the SGF tree.
- The right side has two stacked panels: comments on top and the SGF variation tree below, matching the MultiGo screenshot.
- Save and load initially mean browser file open/download, not cloud storage or native filesystem persistence.
- Localization should be supported from the start for menus, toolbar labels, dialogs, status text, validation messages, and SGF game info field labels.

## Proposed Monorepo Layout

```text
.
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── features/
│       │   │   ├── board/
│       │   │   ├── comments/
│       │   │   ├── game-info/
│       │   │   ├── localization/
│       │   │   ├── sgf-tree/
│       │   │   └── toolbar/
│       │   └── styles/
│       └── package.json
├── packages/
│   ├── sgf-core/
│   │   └── src/
│   ├── go-core/
│   │   └── src/
│   └── ui-shared/
│       └── src/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

## Proposed Stack

- Package manager: `pnpm`
- App framework: Vite + React + TypeScript
- UI framework: `antd`
- Board renderer: local React fork `@ulugo/react-shudan`, forked from SabakiHQ/Shudan
- Go board rules/state helper: `@sabaki/go-board`
- SGF parser/writer: `@sabaki/sgf`, with a local wrapper in `packages/sgf-core`
- Localization: `i18next` + `react-i18next`, or a similarly small translation layer if that proves lighter during implementation
- Test runner: Vitest
- Optional browser tests later: Playwright

Note: upstream Shudan is a low-level Preact goban component. This monorepo uses a local React fork in `packages/react-shudan`. Future changes to SabakiHQ code should fork from GitHub source first, then modify the local fork.

## Product Shape

### Layout

- Top menu bar:
  - File: New, Open SGF, Save SGF, Save As
  - The New menu item should be directly clickable and create a new 19x19 game by default.
  - The New menu should also expose a submenu for board sizes:
    - New 19x19
    - New 13x13
    - New 9x9
    - Custom size, if added later
  - Edit: Undo, Redo, Delete node, Edit game info
  - Traverse: First, Previous, Next, Last, Previous variation, Next variation
  - View: Coordinates, move numbers, markup visibility
  - Tools: Play black, play white, alternate play, add black setup, add white setup, erase, labels, shapes
- Toolbar:
  - Icon buttons for common file, navigation, play/edit, and markup actions
  - Active tool indicator
- Main area:
  - Left: Go board
  - Right top: current node comments
  - Right bottom: SGF tree with variations
- Footer/status bar:
  - Current move number, current coordinate, captures/dead counts if available, file dirty state

### Localization

- All visible app strings should come from translation resources instead of hard-coded component text.
- Initial locales should include English as the source locale. Additional locales can be added by appending resource files without changing component logic.
- Ant Design locale configuration should be wired through the same selected app locale.
- SGF content should not be auto-translated. Only app UI labels, field names, validation messages, and status text are localized.
- User-entered SGF text should preserve its original encoding/content as much as the browser and SGF parser allow.

### Core Editing Behavior

All edits mutate the current SGF tree and then derive the board from the selected node path.

- Place black move: add or update `B[xy]` on a move node
- Place white move: add or update `W[xy]` on a move node
- Alternate play: infer next color from current path and add `B` or `W`
- Add setup black stone: write `AB[xy]`
- Add setup white stone: write `AW[xy]`
- Erase setup/stone point where valid: write or update `AE[xy]` for setup editing
- Comment: edit `C[text]` on current node
- Game information: edit root properties such as `PB`, `PW`, `BR`, `WR`, `EV`, `RO`, `DT`, `PC`, `KM`, `HA`, `RU`, `RE`, `GN`, `GC`
- Markup:
  - Circle: `CR[xy]`
  - Square: `SQ[xy]`
  - Triangle: `TR[xy]`
  - Cross: `MA[xy]`
  - Selected point: `SL[xy]`
  - Label/number/alphabet: `LB[xy:text]`
  - Move number display hint: `MN[number]` where appropriate

### SGF Rules To Respect

- Use `GM[1]` for Go records.
- Use `FF[4]` for generated SGF unless a loaded file preserves another supported format.
- New empty games should create a root like `(;GM[1]FF[4]CA[UTF-8]SZ[19])` by default, replacing `SZ[19]` with the chosen board size for New submenu actions.
- Preserve root metadata order where practical, but do not rely on property order for behavior.
- Treat SGF coordinates as lowercase point pairs, with `aa` at the upper-left corner.
- Treat empty move values as pass moves.
- Escape `]` and `\` inside SGF property values when serializing.
- Preserve unknown properties where possible so loading and saving does not destroy data.
- Support variations as first-class tree branches, not as a flat move list.

## Package Responsibilities

### `packages/sgf-core`

- Parse SGF text into an app-friendly immutable or copy-on-write tree model.
- Serialize the tree back to SGF.
- Read and write node properties.
- Preserve unknown properties.
- Provide helpers for:
  - Current node path
  - Variation insertion
  - Node deletion
  - Comment editing
  - Game info editing
  - Markup editing

### `packages/go-core`

- Convert SGF node paths into board positions.
- Apply moves, setup stones, captures, ko/suicide validation, and pass moves.
- Convert between SGF points and board vertices.
- Track move number, captures, next player, and illegal edit diagnostics.

### `packages/ui-shared`

- Shared UI types, small hooks, and reusable components.
- Keep this package small unless real duplication appears.

### `apps/web`

- Ant Design shell, menus, toolbar, panels, routing if needed.
- Localization provider, locale switch plumbing, and translation resource loading.
- File open/download integration.
- Board adapter around Shudan.
- Editor state orchestration.

## Initial Implementation Milestones

### Milestone 1: Monorepo Scaffold

- Create pnpm workspace.
- Add Vite React TypeScript app.
- Add shared packages.
- Add lint/test scripts.
- Install core dependencies:
  - `antd`
  - `@ant-design/icons`
  - `i18next`
  - `react-i18next`
  - `@ulugo/react-shudan`
  - `@sabaki/go-board`
  - `@sabaki/sgf`
  - `vite`
  - `typescript`
  - `vitest`

### Milestone 2: SGF Core

- Load a basic SGF string.
- Parse root node and move tree.
- Serialize edits back to SGF.
- Add tests for:
  - Basic game tree parsing
  - Variations
  - Comments
  - Escaped values
  - Labels and shape markup

### Milestone 3: Board State

- Derive current board from selected SGF node path.
- Apply `B`, `W`, `AB`, `AW`, and `AE`.
- Validate illegal moves using `@sabaki/go-board` where possible.
- Add tests for captures, setup stones, pass moves, and board sizes.

### Milestone 4: MultiGo-Like UI Shell

- Build menu bar, toolbar, board area, comments panel, tree panel, and status bar.
- Add localized UI string resources and wire Ant Design locale support.
- Implement New menu behavior:
  - Clicking New directly creates a default 19x19 SGF.
  - New submenu actions create 19x19, 13x13, or 9x9 SGF files with matching `SZ`.
- Render empty board and loaded SGF board.
- Select nodes in the SGF tree and update the board/comments.

### Milestone 5: Basic Editing

- Add tools for black move, white move, alternate move, setup black, setup white, erase.
- Add current-node comment editor.
- Add game info modal.
- Add dirty state.
- Save edited SGF as a downloaded file.

### Milestone 6: Markup Editing

- Add shape tools: circle, square, triangle, cross, selected point.
- Add label tool for alphabet/number labels.
- Render markup on the board through Shudan.
- Update tree/comments immediately when markup changes.

### Milestone 7: Polish And Verification

- Keyboard navigation for move traversal.
- Undo/redo history.
- Responsive resizing.
- Browser smoke tests.
- Accessibility pass for toolbar/menu labels and focus handling.

## Testing Strategy

- Unit tests first for `sgf-core` and `go-core`.
- Unit tests for new-game SGF creation with 19x19 default and explicit 19x19, 13x13, and 9x9 sizes.
- Component tests for comment editing, game info editing, and tree selection.
- Component tests for localized menu labels and New menu actions.
- Manual verification for Shudan rendering until a stable browser test is added.
- Add Playwright once the UI shell is functional enough to verify board rendering and save/load workflows.

## Open Questions

1. Should the app be web-only, or should the monorepo leave room for an Electron desktop app later?
  - it should be web only
2. Should illegal moves be blocked strictly, or should the editor allow non-game setup edits when the selected tool is not a normal move tool?
  - it should be allowed as long as it can be saved into sgf file.
3. Should save/load support SGF collections with multiple games in one file from the first version?
  - only single sgf file
4. Should the SGF tree panel show raw property names, human-readable move labels, or both?
  - tree node should show move position and inside the stone circle, there shouuld be a move number, with dynamic font size based on the digit of number so the number always fit in that circle
5. Should "add number" mean SGF labels through `LB[xy:number]`, move numbering display through `MN[number]`, or both depending on tool mode?
  - add number is same as add shape and add alphabet, it won't change move number
