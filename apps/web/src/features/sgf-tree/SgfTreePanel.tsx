import {buildTree, samePath, type SgfDocument} from "@uro/sgf-core";
import {useMemo} from "react";
import {useTranslation} from "react-i18next";
import {cornerRadius, gutterWidth, layoutTree, treeStep, type TreeCell, type TreeConnector, type TreeLayout} from "./layout";

interface SgfTreePanelProps {
  document: SgfDocument;
  selectedPath: number[];
  onSelectPath: (path: number[]) => void;
}

export function SgfTreePanel({document, selectedPath, onSelectPath}: SgfTreePanelProps) {
  const {t} = useTranslation();
  const tree = useMemo(() => buildTree(document), [document]);
  const layout = useMemo(() => layoutTree(tree[0]), [tree]);

  return (
    <section className="side-panel tree-panel">
      <h2>{t("panels.tree")}</h2>
      <div className="move-tree" style={{gridTemplateColumns: `${gutterWidth}px repeat(${layout.columns}, ${treeStep}px)`}}>
        <ConnectorLayer layout={layout} />
        {layout.rows.map(row => (
          <MoveTreeRow key={row} row={row} columns={layout.columns} cells={layout.cells.filter(cell => cell.row === row)} selectedPath={selectedPath} onSelectPath={onSelectPath} />
        ))}
      </div>
    </section>
  );
}

function MoveTreeRow({
  row,
  columns,
  cells,
  selectedPath,
  onSelectPath
}: {
  row: number;
  columns: number;
  cells: TreeCell[];
  selectedPath: number[];
  onSelectPath: (path: number[]) => void;
}) {
  return (
    <>
      <div className="move-row-number">{row}</div>
      <div className="move-row-cells" style={{gridTemplateColumns: `repeat(${columns}, ${treeStep}px)`}}>
        {cells.map(cell => (
          <button
            key={cell.id}
            className={`move-tree-node ${cell.color === "B" ? "black" : "white"} ${cell.isPass ? "pass" : ""} ${cell.hasComment ? "has-comment" : ""} ${cell.hasDrawing ? "has-drawing" : ""} ${samePath(cell.path, selectedPath) ? "selected" : ""}`}
            style={{gridColumn: cell.column + 1}}
            type="button"
            title={`${row}: ${cell.isPass ? "pass" : cell.text}`}
            onClick={() => onSelectPath(cell.path)}
          >
            <span className="move-tree-node-text">{cell.text}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function ConnectorLayer({layout}: {layout: TreeLayout}) {
  const width = gutterWidth + layout.columns * treeStep;
  const height = layout.rows.length * treeStep;

  return (
    <svg className="move-tree-connectors" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {layout.connectors.map(connector => (
        <path key={connector.id} d={connectorPath(connector)} />
      ))}
    </svg>
  );
}

function connectorPath(connector: TreeConnector): string {
  const x1 = gutterWidth + connector.fromColumn * treeStep + treeStep / 2;
  const x2 = gutterWidth + connector.toColumn * treeStep + treeStep / 2;
  const y1 = (connector.fromRow - 1) * treeStep + treeStep / 2;
  const y2 = (connector.toRow - 1) * treeStep + treeStep / 2;

  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;

  const direction = x2 > x1 ? 1 : -1;
  const midY = y1 + (y2 - y1) / 2;

  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${midY - cornerRadius}`,
    `Q ${x1} ${midY} ${x1 + direction * cornerRadius} ${midY}`,
    `L ${x2 - direction * cornerRadius} ${midY}`,
    `Q ${x2} ${midY} ${x2} ${midY + cornerRadius}`,
    `L ${x2} ${y2}`
  ].join(" ");
}

export function isSelectedPath(left: number[], right: number[]): boolean {
  return samePath(left, right);
}
