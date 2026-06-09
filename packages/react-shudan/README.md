# @ulugo/react-shudan

React and TypeScript fork of SabakiHQ/Shudan for the Ulugo SGF editor.

This package keeps the Shudan goban rendering model, CSS class names, and visual behavior, but uses React directly instead of Preact. The source is TypeScript/TSX; there are no generated `.d.ts` shims or JavaScript source files in this workspace package.

## Exports

- `Goban`
- `BoundedGoban`
- `GobanProps`
- `BoundedGobanProps`
- board data types such as `Vertex`, `Marker`, `GhostStone`, `HeatVertex`, and `LineMarker`

Import the stylesheet separately:

```ts
import '@ulugo/react-shudan/css/goban.css';
```

## Development

Run package typechecking:

```sh
pnpm --filter @ulugo/react-shudan typecheck
```

Run the package test script:

```sh
pnpm --filter @ulugo/react-shudan test
```

Build verification for the main app:

```sh
pnpm --filter @ulugo/web build
```

## Upstream

This package is based on SabakiHQ/Shudan. Future changes from SabakiHQ should be brought in from the GitHub repository first, then converted or adapted in this TypeScript React fork.
