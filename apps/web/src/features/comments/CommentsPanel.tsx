import {Button, Empty, Input, Space} from 'antd';
import {useMemo, useState} from 'react';
import type {MouseEvent} from 'react';
import {useTranslation} from 'react-i18next';
import type {AnalysisChartPoint} from '@uro/analysis-core';

interface CommentsPanelProps {
  value: string;
  onChange: (value: string) => void;
  showAnalysisControls?: boolean;
  chartData?: AnalysisChartPoint[];
  selectedMoveNumber?: number | null;
  chartSummary?: AnalysisChartSummary | null;
  onSelectChartMove?: (moveNumber: number) => void;
}

interface AnalysisChartSummary {
  scoreLead: number | null;
  winrate: number | null;
}

interface PlotPoint {
  x: number;
  y: number;
  value: number;
  moveNumber: number;
}

export function CommentsPanel({
  value,
  onChange,
  showAnalysisControls = false,
  chartData = [],
  selectedMoveNumber = null,
  chartSummary = null,
  onSelectChartMove,
}: CommentsPanelProps) {
  const {t} = useTranslation();
  const [showScore, setShowScore] = useState(false);
  const [showWinrate, setShowWinrate] = useState(false);
  const showChart = showAnalysisControls && (showScore || showWinrate);
  const scoreData = useMemo(() => chartData.filter((item) => item.series === 'score'), [chartData]);
  const winrateData = useMemo(() => chartData.filter((item) => item.series === 'winrate'), [chartData]);
  const hasVisibleData = (showScore && scoreData.length > 0) || (showWinrate && winrateData.length > 0);

  return (
    <section className="side-panel comments-panel">
      <div className="comments-panel-header">
        <h2>{t('panels.comments')}</h2>
        {showAnalysisControls ? (
          <Space.Compact>
            <Button
              size="small"
              type={showScore ? 'primary' : 'default'}
              onClick={() => setShowScore((current) => !current)}
            >
              {t('analysis.score')}
            </Button>
            <Button
              size="small"
              type={showWinrate ? 'primary' : 'default'}
              onClick={() => setShowWinrate((current) => !current)}
            >
              {t('analysis.winrate')}
            </Button>
            <Button
              size="small"
              type={!showChart ? 'primary' : 'default'}
              onClick={() => {
                setShowScore(false);
                setShowWinrate(false);
              }}
            >
              {t('panels.comments')}
            </Button>
          </Space.Compact>
        ) : null}
      </div>
      {showChart ? (
        hasVisibleData ? (
          <AnalysisChart
            scoreData={showScore ? scoreData : []}
            winrateData={showWinrate ? winrateData : []}
            allData={chartData}
            scoreLabel={t('analysis.score')}
            selectedMoveNumber={selectedMoveNumber}
            summary={chartSummary}
            onSelectMove={onSelectChartMove}
          />
        ) : (
          <Empty className="analysis-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('analysis.noData')} />
        )
      ) : (
        <Input.TextArea
          size="small"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoSize={false}
        />
      )}
    </section>
  );
}

function AnalysisChart({
  scoreData,
  winrateData,
  allData,
  scoreLabel,
  selectedMoveNumber,
  summary,
  onSelectMove,
}: {
  scoreData: AnalysisChartPoint[];
  winrateData: AnalysisChartPoint[];
  allData: AnalysisChartPoint[];
  scoreLabel: string;
  selectedMoveNumber: number | null;
  summary: AnalysisChartSummary | null;
  onSelectMove?: (moveNumber: number) => void;
}) {
  const [hoverMoveNumber, setHoverMoveNumber] = useState<number | null>(null);
  const width = 360;
  const height = 190;
  const padding = {top: 16, right: 8, bottom: 18, left: 28};
  const maxMove = Math.max(
    0,
    ...scoreData.map((item) => item.moveNumber),
    ...winrateData.map((item) => item.moveNumber)
  );
  const scoreScale = scoreScaleFor(scoreData);
  const scorePoints = makePoints(scoreData, width, padding, maxMove, (value) =>
    valueToCenteredY(value, scoreScale, height, padding)
  );
  const winratePoints = makePoints(winrateData, width, padding, maxMove, (value) =>
    valueToWinrateY(value, height, padding)
  );
  const centerY = (padding.top + height - padding.bottom) / 2;
  const halfScoreScale = Math.round(scoreScale / 2);
  const halfScoreY = valueToCenteredY(halfScoreScale, scoreScale, height, padding);
  const negativeHalfScoreY = valueToCenteredY(-halfScoreScale, scoreScale, height, padding);
  const selectedX =
    selectedMoveNumber == null
      ? null
      : moveNumberToX(Math.max(0, Math.min(maxMove, selectedMoveNumber)), maxMove, width, padding);
  const hoverX =
    hoverMoveNumber == null ? null : moveNumberToX(Math.max(0, Math.min(maxMove, hoverMoveNumber)), maxMove, width, padding);
  const hoverSummary = hoverMoveNumber == null ? null : chartSummaryForMove(allData, hoverMoveNumber);

  function handleMouseDown(event: MouseEvent<SVGSVGElement>): void {
    if (onSelectMove == null) return;

    event.preventDefault();
    const {x} = mouseEventToViewBoxPoint(event, width, height);
    const moveNumber = xToMoveNumber(x, maxMove, width, padding);
    onSelectMove(moveNumber);
  }

  function handleMouseMove(event: MouseEvent<SVGSVGElement>): void {
    const point = mouseEventToViewBoxPoint(event, width, height);
    setHoverMoveNumber(xToHoverMoveNumber(point.x, point.y, maxMove, width, height, padding));
  }

  return (
    <div className="analysis-chart-wrap">
      <svg
        className="analysis-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Analysis chart"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverMoveNumber(null)}
      >
        <line
          className="analysis-chart-grid"
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top}
          y2={padding.top}
        />
        <line
          className="analysis-chart-grid"
          x1={padding.left}
          x2={width - padding.right}
          y1={halfScoreY}
          y2={halfScoreY}
        />
        <line className="analysis-chart-axis" x1={padding.left} x2={width - padding.right} y1={centerY} y2={centerY} />
        <line
          className="analysis-chart-grid"
          x1={padding.left}
          x2={width - padding.right}
          y1={negativeHalfScoreY}
          y2={negativeHalfScoreY}
        />
        <line
          className="analysis-chart-grid"
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
        />
        <line
          className="analysis-chart-grid vertical"
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={height - padding.bottom}
        />
        <line
          className="analysis-chart-grid vertical"
          x1={width - padding.right}
          x2={width - padding.right}
          y1={padding.top}
          y2={height - padding.bottom}
        />
        {selectedX == null ? null : (
          <line
            className="analysis-chart-selected"
            x1={selectedX}
            x2={selectedX}
            y1={padding.top}
            y2={height - padding.bottom}
          />
        )}
        {hoverX == null ? null : (
          <line
            className="analysis-chart-hover"
            x1={hoverX}
            x2={hoverX}
            y1={padding.top}
            y2={height - padding.bottom}
          />
        )}

        {scorePoints.length > 0 ? (
          <>
            <path className="analysis-chart-line score" d={pointsPath(scorePoints)} />
            {scorePoints.map((point) => (
              <circle key={`score-${point.moveNumber}`} className="analysis-chart-point score" cx={point.x} cy={point.y} r="2.5" />
            ))}
            <text className="analysis-chart-label score" x="2" y={padding.top + 4}>{`B+${scoreScale}`}</text>
            <text className="analysis-chart-label score" x="2" y={halfScoreY + 4}>{`B+${halfScoreScale}`}</text>
            <text className="analysis-chart-label score" x="2" y={centerY + 4}>
              0
            </text>
            <text className="analysis-chart-label score" x="2" y={negativeHalfScoreY + 4}>{`W+${halfScoreScale}`}</text>
            <text className="analysis-chart-label score" x="2" y={height - padding.bottom + 4}>{`W+${scoreScale}`}</text>
            <text className="analysis-chart-title score" x={padding.left} y="11">
              {scoreLabel}
            </text>
          </>
        ) : null}

        {winratePoints.length > 0 ? (
          <>
            <path className="analysis-chart-line winrate" d={pointsPath(winratePoints)} />
            {winratePoints.map((point) => (
              <circle
                key={`winrate-${point.moveNumber}`}
                className="analysis-chart-point winrate"
                cx={point.x}
                cy={point.y}
                r="2.5"
              />
            ))}
          </>
        ) : null}

        <text className="analysis-chart-label move" x={padding.left} y={height - 3}>
          0
        </text>
        {maxMove > 0 ? (
          <text className="analysis-chart-label move" x={width - padding.right - 8} y={height - 3}>
            {maxMove}
          </text>
        ) : null}
      </svg>
      <AnalysisChartSummaryView summary={hoverSummary ?? summary} />
    </div>
  );
}

function makePoints(
  data: AnalysisChartPoint[],
  width: number,
  padding: {top: number; right: number; bottom: number; left: number},
  maxMove: number,
  yForValue: (value: number) => number
): PlotPoint[] {
  const plotWidth = width - padding.left - padding.right;
  return data
    .filter((item) => Number.isFinite(item.value))
    .map((item) => ({
      x: padding.left + (item.moveNumber / Math.max(1, maxMove)) * plotWidth,
      y: yForValue(item.value),
      value: item.value,
      moveNumber: item.moveNumber,
    }));
}

function AnalysisChartSummaryView({summary}: {summary: AnalysisChartSummary | null}) {
  if (summary == null) return null;

  const scoreLead = summary.scoreLead;
  const blackWinrate = summary.winrate == null ? null : Math.max(0, Math.min(100, summary.winrate));
  const whiteWinrate = blackWinrate == null ? null : 100 - blackWinrate;

  return (
    <div className="analysis-chart-summary">
      <div className="analysis-chart-scorebox black">
        <span>B {scoreLead == null ? '-' : formatSignedScore(scoreLead)}</span>
        <span>{formatWinrate(blackWinrate)}</span>
      </div>
      <div className="analysis-chart-scorebox white">
        <span>W {scoreLead == null ? '-' : formatSignedScore(-scoreLead)}</span>
        <span>{formatWinrate(whiteWinrate)}</span>
      </div>
    </div>
  );
}

function chartSummaryForMove(data: AnalysisChartPoint[], moveNumber: number): AnalysisChartSummary | null {
  const scoreLead = data.find((item) => item.moveNumber === moveNumber && item.series === 'score')?.value ?? null;
  const winrate = data.find((item) => item.moveNumber === moveNumber && item.series === 'winrate')?.value ?? null;
  return scoreLead == null && winrate == null ? null : {scoreLead, winrate};
}

function mouseEventToViewBoxPoint(event: MouseEvent<SVGSVGElement>, width: number, height: number): {x: number; y: number} {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * width,
    y: ((event.clientY - rect.top) / rect.height) * height,
  };
}

function moveNumberToX(
  moveNumber: number,
  maxMove: number,
  width: number,
  padding: {left: number; right: number}
): number {
  const plotWidth = width - padding.left - padding.right;
  return padding.left + (moveNumber / Math.max(1, maxMove)) * plotWidth;
}

function xToMoveNumber(
  x: number,
  maxMove: number,
  width: number,
  padding: {left: number; right: number}
): number {
  const plotWidth = width - padding.left - padding.right;
  const ratio = (Math.max(padding.left, Math.min(width - padding.right, x)) - padding.left) / plotWidth;
  return Math.max(0, Math.min(maxMove, Math.round(ratio * maxMove)));
}

function xToHoverMoveNumber(
  x: number,
  y: number,
  maxMove: number,
  width: number,
  height: number,
  padding: {top: number; right: number; bottom: number; left: number}
): number | null {
  if (x < padding.left || x > width - padding.right || y < padding.top || y > height - padding.bottom) return null;

  const moveNumber = xToMoveNumber(x, maxMove, width, padding);
  const moveX = moveNumberToX(moveNumber, maxMove, width, padding);
  const plotWidth = width - padding.left - padding.right;
  const moveSpacing = maxMove <= 0 ? plotWidth : plotWidth / maxMove;
  const threshold = Math.min(8, Math.max(4, moveSpacing / 3));
  return Math.abs(x - moveX) <= threshold ? moveNumber : null;
}

function valueToCenteredY(
  value: number,
  scale: number,
  height: number,
  padding: {top: number; bottom: number}
): number {
  const centerY = (padding.top + height - padding.bottom) / 2;
  const plotHeight = height - padding.top - padding.bottom;
  return centerY - (Math.max(-scale, Math.min(scale, value)) / scale) * (plotHeight / 2);
}

function valueToWinrateY(value: number, height: number, padding: {top: number; bottom: number}): number {
  const plotHeight = height - padding.top - padding.bottom;
  return padding.top + ((100 - Math.max(0, Math.min(100, value))) / 100) * plotHeight;
}

function pointsPath(points: PlotPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
}

function scoreScaleFor(data: AnalysisChartPoint[]): number {
  const maxAbs = Math.max(5, ...data.map((item) => Math.abs(item.value)));
  return Math.ceil(maxAbs / 5) * 5;
}

function formatSignedScore(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  return normalized > 0 ? `+${normalized.toFixed(1)}` : normalized.toFixed(1);
}

function formatWinrate(value: number | null): string {
  return value == null ? '-' : `${value.toFixed(1)}%`;
}
