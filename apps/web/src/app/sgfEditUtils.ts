import {
  cloneDocument,
  getNodeAtPath,
  type MarkupKind,
  type SgfColor,
  type SgfDocument,
  type SgfNode,
} from '@ulugo/sgf-core';
import type {EditorTool} from '../features/toolbar/types';

export function addSetupStoneToPath(
  document: SgfDocument,
  path: number[],
  color: SgfColor,
  point: string
): {document: SgfDocument; path: number[]; placed: boolean} {
  const next = cloneDocument(document);
  const node = getNodeAtPath(next, path);
  const placed = addSetupStoneToNode(node, color, point);
  return {document: next, path, placed};
}

function addSetupStoneToNode(node: SgfNode, color: SgfColor, point: string): boolean {
  const prop = color === 'B' ? 'AB' : 'AW';
  const opposite = color === 'B' ? 'AW' : 'AB';
  if ((node.data[prop] ?? []).includes(point)) {
    removePointValues(node, [prop], point);
    return false;
  }

  removePointValues(node, [opposite, 'AE'], point);
  addUniqueValue(node, prop, point);
  return true;
}

export function findChildMovePath(
  document: SgfDocument,
  path: number[],
  color: SgfColor,
  point: string
): number[] | null {
  const node = getNodeAtPath(document, path);
  const index = node.children.findIndex((child) => child.data[color]?.[0] === point);
  return index < 0 ? null : [...path, index];
}

export function isCurrentSetupStone(document: SgfDocument, path: number[], point: string): boolean {
  const node = getNodeAtPath(document, path);
  return (node.data.AB ?? []).includes(point) || (node.data.AW ?? []).includes(point);
}

export function oppositeColor(color: SgfColor): SgfColor {
  return color === 'B' ? 'W' : 'B';
}

function removePointValues(node: SgfNode, keys: string[], point: string): void {
  for (const key of keys) {
    const values = node.data[key];
    if (values == null) continue;
    const next = values.filter((value) => value !== point);
    if (next.length === 0) {
      delete node.data[key];
    } else {
      node.data[key] = next;
    }
  }
}

function addUniqueValue(node: SgfNode, key: string, value: string): void {
  const values = node.data[key] ?? [];
  if (!values.includes(value)) node.data[key] = [...values, value];
}

export function toolToMarkup(tool: EditorTool): MarkupKind | null {
  switch (tool) {
    case 'circle':
      return 'CR';
    case 'square':
      return 'SQ';
    case 'triangle':
      return 'TR';
    case 'cross':
      return 'MA';
    default:
      return null;
  }
}
