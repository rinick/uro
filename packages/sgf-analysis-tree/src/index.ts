import {
  getBoardSize,
  getLine,
  getNodeAtPath,
  pointToVertex,
  type SgfColor,
  type SgfDocument,
  type SgfNode,
  type SgfPoint,
} from '@uro/sgf-core';

export interface AnalysisTreeNode {
  id: string;
  path: number[];
  parentId: string | null;
  color: SgfColor | null;
  point: SgfPoint | null;
  moveNumber: number;
  children: AnalysisTreeNode[];
}

export interface AnalysisTree {
  boardSize: number;
  root: AnalysisTreeNode;
  nodesByPath: Record<string, AnalysisTreeNode>;
}

const gtpLetters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

export function pathKey(path: number[]): string {
  return path.join('.');
}

export function buildAnalysisTree(document: SgfDocument): AnalysisTree {
  const nodesByPath: Record<string, AnalysisTreeNode> = {};
  const boardSize = getBoardSize(document);

  function walk(node: SgfNode, path: number[], parentId: string | null, moveNumber: number): AnalysisTreeNode {
    const color: SgfColor | null = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
    const nextMoveNumber = color == null ? moveNumber : moveNumber + 1;
    const item: AnalysisTreeNode = {
      id: node.id,
      path,
      parentId,
      color,
      point: color == null ? null : (node.data[color]?.[0] ?? ''),
      moveNumber: nextMoveNumber,
      children: [],
    };

    nodesByPath[pathKey(path)] = item;
    item.children = node.children.map((child, index) => walk(child, [...path, index], item.id, nextMoveNumber));
    return item;
  }

  return {boardSize, root: walk(document.root, [], null, 0), nodesByPath};
}

export function getMovesForPath(document: SgfDocument, path: number[]): Array<[SgfColor, string]> {
  const size = getBoardSize(document);
  return getLine(document, path).flatMap((node): Array<[SgfColor, string]> => {
    const color: SgfColor | null = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
    if (color == null) return [];
    return [[color, sgfPointToGtp(node.data[color]?.[0] ?? '', size)]];
  });
}

export function getInitialStonesForPath(document: SgfDocument, path: number[]): Array<[SgfColor, string]> {
  const size = getBoardSize(document);
  const stones: Array<[SgfColor, string]> = [];

  for (const node of getLine(document, path)) {
    for (const point of node.data.AB ?? []) stones.push(['B', sgfPointToGtp(point, size)]);
    for (const point of node.data.AW ?? []) stones.push(['W', sgfPointToGtp(point, size)]);
  }

  return stones;
}

export function getNextColorForPath(document: SgfDocument, path: number[]): SgfColor {
  const node = getNodeAtPath(document, path);
  const lastMove = getLine(document, path)
    .slice()
    .reverse()
    .find((item) => item.data.B != null || item.data.W != null);

  if (node.children.length > 0) {
    const child = node.children[0];
    if (child.data.B != null) return 'B';
    if (child.data.W != null) return 'W';
  }

  return lastMove?.data.B != null ? 'W' : 'B';
}

export function sgfPointToGtp(point: SgfPoint, boardSize: number): string {
  if (point === '') return 'pass';
  const vertex = pointToVertex(point);
  if (vertex == null) return 'pass';
  const [x, y] = vertex;
  return `${gtpLetters[x] ?? 'A'}${boardSize - y}`;
}
