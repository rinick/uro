import {formatPoint, type SgfColor, type TreeItem} from '@uro/sgf-core';

export interface TreeCell {
  id: string;
  path: number[];
  row: number;
  column: number;
  color: SgfColor | null;
  text: string;
  isPass: boolean;
  hasMetadata: boolean;
  hasComment: boolean;
  hasDrawing: boolean;
}

export interface TreeConnector {
  id: string;
  fromRow: number;
  fromColumn: number;
  toRow: number;
  toColumn: number;
}

export interface TreeLayout {
  rows: number[];
  columns: number;
  cells: TreeCell[];
  connectors: TreeConnector[];
}

export const gutterWidth = 42;
export const treeStep = 30;
export const cornerRadius = 6;

export function layoutTree(root: TreeItem, boardSize = 19): TreeLayout {
  const cells: TreeCell[] = [];
  const connectors: TreeConnector[] = [];
  let nextColumn = 1;
  let maxColumn = 0;
  let maxRow = root.moveNumber;
  cells.push({
    id: root.id,
    path: root.path,
    row: root.moveNumber,
    column: 0,
    color: null,
    text: '0',
    isPass: false,
    hasMetadata: root.hasMetadata,
    hasComment: root.hasComment,
    hasDrawing: root.hasDrawing,
  });

  function walk(item: TreeItem, column: number): void {
    item.children.forEach((child, index) => {
      const childColumn = index === 0 ? column : nextColumn++;
      maxColumn = Math.max(maxColumn, childColumn);

      connectors.push({
        id: `${item.id}-${child.id}`,
        fromRow: item.moveNumber,
        fromColumn: column,
        toRow: child.moveNumber,
        toColumn: childColumn,
      });

      maxRow = Math.max(maxRow, child.moveNumber);
      cells.push({
        id: child.id,
        path: child.path,
        row: child.moveNumber,
        column: childColumn,
        color: child.color,
        text: child.point === '' ? '' : formatPoint(child.point, boardSize),
        isPass: child.point === '',
        hasMetadata: child.hasMetadata,
        hasComment: child.hasComment,
        hasDrawing: child.hasDrawing,
      });

      walk(child, childColumn);
    });
  }

  walk(root, 0);

  return {
    rows: Array.from({length: maxRow + 1}, (_, index) => index),
    columns: Math.max(maxColumn + 1, 1),
    cells,
    connectors,
  };
}
