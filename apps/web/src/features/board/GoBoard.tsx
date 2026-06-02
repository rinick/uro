import {Goban, type Marker} from "@uro/react-shudan";
import {deriveBoardPosition} from "@uro/go-core";
import {pointToVertex, type MarkupKind, type SgfDocument, vertexToPoint} from "@uro/sgf-core";
import {useLayoutEffect, useMemo, useRef, useState} from "react";

interface GoBoardProps {
  document: SgfDocument;
  path: number[];
  showCoordinates: boolean;
  showMoveNumbers: boolean;
  onVertexClick: (point: string) => void;
}

const markerTypes: Record<MarkupKind, Marker["type"]> = {
  CR: "circle",
  SQ: "square",
  TR: "triangle",
  MA: "cross",
  SL: "point"
};

export function GoBoard({document, path, showCoordinates, showMoveNumbers, onVertexClick}: GoBoardProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const position = useMemo(() => deriveBoardPosition(document, path), [document, path]);
  const [availableSize, setAvailableSize] = useState({width: 620, height: 620});
  const vertexSize = useMemo(() => {
    const coordinateSlots = showCoordinates ? 2 : 0;
    const slots = position.size + coordinateSlots;
    return Math.max(12, Math.floor(Math.min(availableSize.width, availableSize.height) / slots));
  }, [availableSize.height, availableSize.width, position.size, showCoordinates]);

  const signMap = useMemo(
    () =>
      Array.from({length: position.size}, (_, y) =>
        Array.from({length: position.size}, (_, x) => {
          const stone = position.stones.get(vertexToPoint(x, y));
          return stone === "B" ? 1 : stone === "W" ? -1 : 0;
        })
      ),
    [position]
  );

  const markerMap = useMemo(
    () =>
      Array.from({length: position.size}, (_, y) =>
        Array.from({length: position.size}, (_, x): Marker => {
          const point = position.points.find(item => item.x === x && item.y === y);
          if (point == null) return {};
          if (point.label != null) return {type: "label", label: point.label};
          if (showMoveNumbers && point.stone != null && point.moveNumber != null) return {type: "label", label: String(point.moveNumber)};
          if (point.markup != null) return {type: markerTypes[point.markup]};
          return {};
        })
      ),
    [position, showMoveNumbers]
  );

  useLayoutEffect(() => {
    const element = frameRef.current;
    if (element == null) return;

    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect == null) return;
      setAvailableSize({width: rect.width, height: rect.height});
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="board-frame" ref={frameRef}>
      <div className="board-surface">
        <Goban
          className="uro-goban"
          vertexSize={vertexSize}
          showCoordinates={showCoordinates}
          signMap={signMap}
          markerMap={markerMap}
          selectedVertices={position.lastMove == null ? [] : [pointToVertex(position.lastMove)!]}
          onVertexClick={(_event, vertex) => onVertexClick(vertexToPoint(vertex[0], vertex[1]))}
        />
      </div>
    </div>
  );
}
