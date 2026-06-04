import {Button, Empty, Input, Space} from 'antd';
import {useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {AnalysisChartPoint} from '@uro/analysis-core';

interface CommentsPanelProps {
  value: string;
  onChange: (value: string) => void;
  showAnalysisControls?: boolean;
  chartData?: AnalysisChartPoint[];
}

interface PlotPoint {
  x: number;
  y: number;
  value: number;
  moveNumber: number;
}

export function CommentsPanel({value, onChange, showAnalysisControls = false, chartData = []}: CommentsPanelProps) {
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
            scoreLabel={t('analysis.score')}
            winrateLabel={t('analysis.winrate')}
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
  scoreLabel,
  winrateLabel,
}: {
  scoreData: AnalysisChartPoint[];
  winrateData: AnalysisChartPoint[];
  scoreLabel: string;
  winrateLabel: string;
}) {
  const width = 320;
  const height = 190;
  const padding = {top: 16, right: 42, bottom: 18, left: 42};
  const maxMove = Math.max(
    1,
    ...scoreData.map((item) => item.moveNumber),
    ...winrateData.map((item) => item.moveNumber)
  );
  const scoreScale = scoreScaleFor(scoreData);
  const scorePoints = makePoints(scoreData, width, height, padding, (value) =>
    valueToCenteredY(value, scoreScale, height, padding)
  );
  const winratePoints = makePoints(winrateData, width, height, padding, (value) =>
    valueToWinrateY(value, height, padding)
  );
  const centerY = (padding.top + height - padding.bottom) / 2;

  return (
    <svg className="analysis-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Analysis chart">
      <line
        className="analysis-chart-grid"
        x1={padding.left}
        x2={width - padding.right}
        y1={padding.top}
        y2={padding.top}
      />
      <line className="analysis-chart-axis" x1={padding.left} x2={width - padding.right} y1={centerY} y2={centerY} />
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

      {scorePoints.length > 0 ? (
        <>
          <path className="analysis-chart-line score" d={pointsPath(scorePoints)} />
          <text className="analysis-chart-label score" x="4" y={padding.top + 4}>{`B+${scoreScale}`}</text>
          <text className="analysis-chart-label score" x="4" y={centerY + 4}>
            0
          </text>
          <text className="analysis-chart-label score" x="4" y={height - padding.bottom + 4}>{`W+${scoreScale}`}</text>
          <text className="analysis-chart-title score" x={padding.left} y="11">
            {scoreLabel}
          </text>
        </>
      ) : null}

      {winratePoints.length > 0 ? (
        <>
          <path className="analysis-chart-line winrate" d={pointsPath(winratePoints)} />
          <text className="analysis-chart-label winrate" x={width - padding.right + 6} y={padding.top + 4}>
            100%
          </text>
          <text className="analysis-chart-label winrate" x={width - padding.right + 6} y={centerY + 4}>
            50%
          </text>
          <text className="analysis-chart-label winrate" x={width - padding.right + 6} y={height - padding.bottom + 4}>
            0%
          </text>
          <text className="analysis-chart-title winrate" x={width - padding.right - 48} y="11">
            {winrateLabel}
          </text>
        </>
      ) : null}

      <text className="analysis-chart-label move" x={padding.left} y={height - 3}>
        1
      </text>
      <text className="analysis-chart-label move" x={width - padding.right - 8} y={height - 3}>
        {maxMove}
      </text>
    </svg>
  );
}

function makePoints(
  data: AnalysisChartPoint[],
  width: number,
  height: number,
  padding: {top: number; right: number; bottom: number; left: number},
  yForValue: (value: number) => number
): PlotPoint[] {
  const maxMove = Math.max(1, ...data.map((item) => item.moveNumber));
  const plotWidth = width - padding.left - padding.right;
  return data
    .filter((item) => Number.isFinite(item.value))
    .map((item) => ({
      x: padding.left + ((item.moveNumber - 1) / Math.max(1, maxMove - 1)) * plotWidth,
      y: yForValue(item.value),
      value: item.value,
      moveNumber: item.moveNumber,
    }));
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
