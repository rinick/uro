import {
  getBoardSize,
  getLine,
  pointToVertex,
  type MarkupKind,
  type SgfColor,
  type SgfDocument,
  type SgfNode,
  type SgfPoint,
  vertexToPoint,
} from '@uro/sgf-core';

export type Stone = SgfColor;

export interface BoardPoint {
  point: SgfPoint;
  x: number;
  y: number;
  stone: Stone | null;
  moveNumber: number | null;
  label: string | null;
  markup: MarkupKind | null;
  isLastMove: boolean;
}

export interface BoardPosition {
  size: number;
  points: BoardPoint[];
  stones: Map<SgfPoint, Stone>;
  captures: Record<Stone, number>;
  nextColor: Stone;
  lastMove: SgfPoint | null;
  moveNumber: number;
}

export function deriveBoardPosition(document: SgfDocument, path: number[]): BoardPosition {
  const size = getBoardSize(document);
  const stones = new Map<SgfPoint, Stone>();
  const moveNumbers = new Map<SgfPoint, number>();
  const captures: Record<Stone, number> = {B: 0, W: 0};
  const line = getLine(document, path);
  let moveNumber = 0;
  let lastMove: SgfPoint | null = null;
  let lastColor: Stone | null = null;

  for (const node of line) {
    applySetup(node, stones, moveNumbers);

    const color: Stone | null = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
    if (color == null) continue;

    const point = node.data[color]?.[0] ?? '';
    moveNumber += 1;
    lastColor = color;
    lastMove = point === '' ? null : point;

    if (point === '') continue;
    stones.set(point, color);
    moveNumbers.set(point, moveNumber);

    const opponent = color === 'B' ? 'W' : 'B';
    for (const neighbor of neighbors(point, size)) {
      if (stones.get(neighbor) !== opponent) continue;
      const group = collectGroup(neighbor, stones, size);
      if (group.liberties === 0) {
        captures[color] += group.points.length;
        for (const captured of group.points) {
          stones.delete(captured);
          moveNumbers.delete(captured);
        }
      }
    }
  }

  const current = line[line.length - 1];
  const labels = collectLabels(current);
  const markups = collectMarkups(current);
  const points: BoardPoint[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const point = vertexToPoint(x, y);
      points.push({
        point,
        x,
        y,
        stone: stones.get(point) ?? null,
        moveNumber: moveNumbers.get(point) ?? null,
        label: labels.get(point) ?? null,
        markup: markups.get(point) ?? null,
        isLastMove: point === lastMove,
      });
    }
  }

  return {
    size,
    points,
    stones,
    captures,
    nextColor: lastColor === 'B' ? 'W' : 'B',
    lastMove,
    moveNumber,
  };
}

function applySetup(node: SgfNode, stones: Map<SgfPoint, Stone>, moveNumbers: Map<SgfPoint, number>): void {
  for (const point of node.data.AE ?? []) {
    stones.delete(point);
    moveNumbers.delete(point);
  }

  for (const point of node.data.AB ?? []) {
    stones.set(point, 'B');
    moveNumbers.delete(point);
  }

  for (const point of node.data.AW ?? []) {
    stones.set(point, 'W');
    moveNumbers.delete(point);
  }
}

function collectLabels(node: SgfNode): Map<SgfPoint, string> {
  const labels = new Map<SgfPoint, string>();
  for (const value of node.data.LB ?? []) {
    const separator = value.indexOf(':');
    if (separator <= 0) continue;
    labels.set(value.slice(0, separator), value.slice(separator + 1));
  }
  return labels;
}

function collectMarkups(node: SgfNode): Map<SgfPoint, MarkupKind> {
  const markups = new Map<SgfPoint, MarkupKind>();
  for (const kind of ['CR', 'SQ', 'TR', 'MA', 'SL'] as MarkupKind[]) {
    for (const point of node.data[kind] ?? []) {
      markups.set(point, kind);
    }
  }
  return markups;
}

function collectGroup(
  start: SgfPoint,
  stones: Map<SgfPoint, Stone>,
  size: number
): {points: SgfPoint[]; liberties: number} {
  const color = stones.get(start);
  if (color == null) return {points: [], liberties: 0};

  const seen = new Set<SgfPoint>();
  const liberties = new Set<SgfPoint>();
  const queue = [start];

  while (queue.length > 0) {
    const point = queue.shift();
    if (point == null || seen.has(point)) continue;
    seen.add(point);

    for (const neighbor of neighbors(point, size)) {
      const stone = stones.get(neighbor);
      if (stone == null) {
        liberties.add(neighbor);
      } else if (stone === color && !seen.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return {points: [...seen], liberties: liberties.size};
}

function neighbors(point: SgfPoint, size: number): SgfPoint[] {
  const vertex = pointToVertex(point);
  if (vertex == null) return [];

  const [x, y] = vertex;
  const result: SgfPoint[] = [];
  if (x > 0) result.push(vertexToPoint(x - 1, y));
  if (x < size - 1) result.push(vertexToPoint(x + 1, y));
  if (y > 0) result.push(vertexToPoint(x, y - 1));
  if (y < size - 1) result.push(vertexToPoint(x, y + 1));
  return result;
}
