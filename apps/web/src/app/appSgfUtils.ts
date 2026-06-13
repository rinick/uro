import {
  cloneDocument,
  getGameInfo,
  getNodeAtPath,
  parseGib,
  parseSgf,
  updateGameInfo,
  type MarkupKind,
  type SgfColor,
  type SgfDocument,
  type SgfNode,
} from '@ulugo/sgf-core';
import type {EditorTool} from '../features/toolbar/types';

export function pathKey(path: number[]): string {
  return path.join('.');
}

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

export function nextRememberedPath(
  document: SgfDocument,
  path: number[],
  steps: number,
  branchMemory: Map<string, number>
): number[] {
  let next = path;
  for (let index = 0; index < steps; index += 1) {
    const node = getNodeAtPath(document, next);
    if (node.children.length === 0) break;
    const rememberedChild = branchMemory.get(pathKey(next)) ?? 0;
    next = [...next, rememberedChild < node.children.length ? rememberedChild : 0];
  }
  return next;
}

export function nextFirstChildPath(document: SgfDocument, path: number[], steps: number): number[] {
  let next = path;
  for (let index = 0; index < steps; index += 1) {
    const node = getNodeAtPath(document, next);
    if (node.children.length === 0) break;
    next = [...next, 0];
  }
  return next;
}

export function getCurrentBranchMovePaths(
  document: SgfDocument,
  selectedPath: number[],
  branchMemory: Map<string, number>
): number[][] {
  const paths: number[][] = [[]];
  let path: number[] = [];

  for (const index of selectedPath) {
    path = [...path, index];
    paths.push(path);
  }

  let node = getNodeAtPath(document, path);
  while (node.children.length > 0) {
    const rememberedChild = branchMemory.get(pathKey(path)) ?? 0;
    const nextIndex = rememberedChild < node.children.length ? rememberedChild : 0;
    path = [...path, nextIndex];
    paths.push(path);
    node = node.children[nextIndex];
  }

  return paths;
}

export function getAnalysisQueuePaths(document: SgfDocument, branchPaths: number[][]): number[][] {
  const queued = new Set<string>();
  const paths: number[][] = [];

  function addPath(nextPath: number[]): void {
    if (!isAnalysisPath(document, nextPath)) return;
    const key = pathKey(nextPath);
    if (queued.has(key)) return;
    queued.add(key);
    paths.push(nextPath);
  }

  for (const branchPath of branchPaths) addPath(branchPath);

  return paths;
}

function isAnalysisPath(document: SgfDocument, path: number[]): boolean {
  if (path.length === 0) return true;
  const node = getNodeAtPath(document, path);
  return node.data.B != null || node.data.W != null;
}

export function nodeKey(document: SgfDocument, path: number[]): string {
  return getNodeAtPath(document, path).id;
}

export function collectNodeIds(node: SgfNode): string[] {
  return [node.id, ...node.children.flatMap(collectNodeIds)];
}

export function getLinePaths(path: number[]): number[][] {
  return [[], ...path.map((_, index) => path.slice(0, index + 1))];
}

export function parseGameRecord(text: string, fileName: string): SgfDocument {
  return isGibFile(fileName) ? parseGib(text) : parseSgf(text);
}

export function isGameRecordFile(fileName: string): boolean {
  return /\.(sgf|gib)$/i.test(fileName);
}

export async function readGameRecordFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return decodeGameRecordBytes(buffer, isGibFile(file.name));
}

function decodeGameRecordBytes(buffer: ArrayBuffer, preferKorean: boolean): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!preferKorean || !utf8.includes('\uFFFD')) return utf8;

  try {
    return new TextDecoder('euc-kr').decode(buffer);
  } catch {
    return utf8;
  }
}

function isGibFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.gib');
}

export function normalizeSelectedPath(document: SgfDocument, path: number[]): number[] {
  if (path.length === 0) return [];
  if (document.root.children.length === 0) return [];

  const normalized: number[] = [];
  let node = document.root;
  for (const index of path) {
    if (node.children.length === 0) break;
    const nextIndex = Math.min(Math.max(index, 0), node.children.length - 1);
    normalized.push(nextIndex);
    node = node.children[nextIndex];
  }

  return normalized;
}

export function withImportedGameName(document: SgfDocument, fileName: string): SgfDocument {
  const info = getGameInfo(document);
  if (info.GN.trim() !== '') return document;

  return updateGameInfo(document, {...info, GN: gameNameFromSgfFile(fileName)});
}

function gameNameFromSgfFile(fileName: string): string {
  const name = fileName.replace(/\.sgf$/i, '').trim();
  return name === '' ? 'Imported game' : name;
}

export function safeFileName(value: string): string {
  const name = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  return name === '' ? 'game' : name;
}

export function isTextInputActive(): boolean {
  const element = window.document.activeElement;
  if (element == null) return false;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )
    return true;
  return element instanceof HTMLElement && element.isContentEditable;
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
