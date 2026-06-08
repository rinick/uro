import type {AnalysisChartPoint, KataGoAnalysisResult, KataGoMoveInfo} from '@uro/analysis-core';
import {deriveBoardPosition} from '@uro/go-core';
import {defaultKataGoSettings, type KataGoSettings} from '@uro/katago-core';
import {getBoardSize, getNodeAtPath, type SgfColor, type SgfDocument} from '@uro/sgf-core';
import {sgfPointToGtp} from '@uro/sgf-analysis-tree';
import {getLinePaths, nodeKey} from './appSgfUtils';

export interface CachedAnalysis {
  result: KataGoAnalysisResult;
  visits: number;
  completed: boolean;
}

export interface AnalysisQueryContext {
  nodeId: string;
  path: number[];
  version: number;
  mode: 'fast' | 'live';
  hiddenMove?: string;
}

export function hasPendingAnalysisQuery(
  contexts: Map<string, AnalysisQueryContext>,
  mode: AnalysisQueryContext['mode'],
  nodeId?: string,
  hiddenMove?: string | null
): boolean {
  for (const context of contexts.values()) {
    if (context.mode !== mode) continue;
    if (hiddenMove !== undefined && (context.hiddenMove ?? null) !== hiddenMove) continue;
    if (nodeId == null || context.nodeId === nodeId) return true;
  }
  return false;
}

export function getPendingAnalysisQueryIds(
  contexts: Map<string, AnalysisQueryContext>,
  mode: AnalysisQueryContext['mode']
): string[] {
  return [...contexts.entries()].filter(([, context]) => context.mode === mode).map(([id]) => id);
}

export function getAnalysisVisits(result: KataGoAnalysisResult): number {
  return Math.max(result.rootInfo?.visits ?? 0, ...(result.moveInfos ?? []).map((move) => move.visits ?? 0));
}

export function hiddenPassVisits(settings: KataGoSettings, live: boolean): number {
  if (!live) return Math.max(1, settings.fastVisits || defaultKataGoSettings.fastVisits);

  const maxVisits = Math.max(1, settings.maxVisits || defaultKataGoSettings.maxVisits);
  return Math.max(1, Math.ceil(maxVisits * 0.5));
}

export function shouldRequestHiddenPassAnalysis(
  document: SgfDocument,
  path: number[],
  cache: Record<string, CachedAnalysis>,
  targetVisits: number
): boolean {
  const analysis = cache[nodeKey(document, path)]?.result;
  if (analysis?.rootInfo == null) return false;

  return shouldCountHiddenPassAnalysis(document, path, cache, targetVisits);
}

export function shouldCountHiddenPassAnalysis(
  document: SgfDocument,
  path: number[],
  cache: Record<string, CachedAnalysis>,
  targetVisits: number
): boolean {
  const analysis = cache[nodeKey(document, path)]?.result;
  const passMove = analysis?.moveInfos?.find((move) => move.move.toLowerCase() === 'pass');
  return (passMove?.visits ?? 0) < targetVisits;
}

export function nextColorForPath(document: SgfDocument, path: number[]): SgfColor {
  return deriveBoardPosition(document, path).nextColor;
}

export function updateAnalysisCache({
  cache,
  document,
  path,
  result,
  visits,
  completed,
}: {
  cache: Record<string, CachedAnalysis>;
  document: SgfDocument;
  path: number[];
  result: KataGoAnalysisResult;
  visits: number;
  completed: boolean;
}): Record<string, CachedAnalysis> {
  const nodeId = nodeKey(document, path);
  const existing = cache[nodeId];
  const nextCache = {
    ...cache,
    [nodeId]: {
      result: mergeAnalysisResult(existing?.result, result),
      visits: Math.max(visits, existing?.visits ?? 0),
      completed: existing?.completed === true || completed,
    },
  };

  return updateParentMoveAnalysis(nextCache, document, path, result);
}

export function updateHiddenMoveAnalysisCache({
  cache,
  document,
  path,
  move,
  result,
  completed,
}: {
  cache: Record<string, CachedAnalysis>;
  document: SgfDocument;
  path: number[];
  move: string;
  result: KataGoAnalysisResult;
  completed: boolean;
}): Record<string, CachedAnalysis> {
  if (result.rootInfo == null) return cache;

  const nodeId = nodeKey(document, path);
  const existing = cache[nodeId];
  const analysis = existing?.result ?? {id: result.id};
  return {
    ...cache,
    [nodeId]: {
      result: mergeMoveInfoIntoAnalysis(analysis, {move, ...result.rootInfo}),
      visits: existing?.visits ?? 0,
      completed: existing?.completed === true || completed,
    },
  };
}

function updateParentMoveAnalysis(
  cache: Record<string, CachedAnalysis>,
  document: SgfDocument,
  path: number[],
  result: KataGoAnalysisResult
): Record<string, CachedAnalysis> {
  if (path.length === 0 || result.rootInfo == null) return cache;

  const node = getNodeAtPath(document, path);
  const color = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
  const point = color == null ? null : (node.data[color]?.[0] ?? '');
  if (color == null || point == null) return cache;

  const parentPath = path.slice(0, -1);
  const parentId = nodeKey(document, parentPath);
  const parent = cache[parentId];
  if (parent == null) return cache;

  return {
    ...cache,
    [parentId]: {
      ...parent,
      result: mergeMoveInfoIntoAnalysis(parent.result, {
        move: sgfPointToGtp(point, getBoardSize(document)),
        ...result.rootInfo,
      }),
    },
  };
}

function mergeAnalysisResult(
  existing: KataGoAnalysisResult | undefined,
  result: KataGoAnalysisResult
): KataGoAnalysisResult {
  if (existing == null) return result;

  return {
    ...existing,
    ...result,
    rootInfo: result.rootInfo ?? existing.rootInfo,
    moveInfos: mergeMoveInfos(existing.moveInfos, result.moveInfos),
    ownership: result.ownership ?? existing.ownership,
    policy: result.policy ?? existing.policy,
  };
}

function mergeMoveInfoIntoAnalysis(analysis: KataGoAnalysisResult, move: KataGoMoveInfo): KataGoAnalysisResult {
  const moveInfos = analysis.moveInfos ?? [];
  const index = moveInfos.findIndex((item) => sameMoveInfo(item, move));
  if (index < 0) return {...analysis, moveInfos: [...moveInfos, move]};

  return {
    ...analysis,
    moveInfos: moveInfos.map((item, itemIndex) => (itemIndex === index ? mergeMoveInfo(item, move) : item)),
  };
}

function mergeMoveInfos(
  existing: KataGoMoveInfo[] | undefined,
  incoming: KataGoMoveInfo[] | undefined
): KataGoMoveInfo[] | undefined {
  if (incoming == null) return existing;
  if (existing == null) return incoming;

  const existingByMove = new Map(existing.map((move) => [move.move.toLowerCase(), move]));
  const incomingMoves = new Set(incoming.map((move) => move.move.toLowerCase()));
  return [
    ...incoming.map((move) => mergeMoveInfo(existingByMove.get(move.move.toLowerCase()), move)),
    ...existing.filter((move) => !incomingMoves.has(move.move.toLowerCase())),
  ];
}

function mergeMoveInfo(existing: KataGoMoveInfo | undefined, incoming: KataGoMoveInfo): KataGoMoveInfo {
  if (existing == null) return incoming;
  return (incoming.visits ?? 0) >= (existing.visits ?? 0) ? {...existing, ...incoming} : {...incoming, ...existing};
}

function sameMoveInfo(first: KataGoMoveInfo, second: KataGoMoveInfo): boolean {
  return first.move.toLowerCase() === second.move.toLowerCase();
}

export function buildAnalysisChartData(
  document: SgfDocument,
  paths: number[][],
  cache: Record<string, CachedAnalysis>,
  targetVisits: number
): AnalysisChartPoint[] {
  const data: AnalysisChartPoint[] = [];

  paths.forEach((path, index) => {
    const rootInfo = cache[nodeKey(document, path)]?.result.rootInfo;
    const node = getNodeAtPath(document, path);
    const color = node.data.B != null ? 'B' : node.data.W != null ? 'W' : undefined;
    if (rootInfo?.scoreLead != null)
      data.push({
        moveNumber: index,
        series: 'score',
        value: rootInfo.scoreLead,
        color,
        hiddenPassReady: !shouldCountHiddenPassAnalysis(document, path, cache, targetVisits),
      });
    if (rootInfo?.winrate != null)
      data.push({moveNumber: index, series: 'winrate', value: normalizeWinratePercent(rootInfo.winrate)});
  });

  return data;
}

export function buildStoneScoreDeltas(
  document: SgfDocument,
  path: number[],
  cache: Record<string, CachedAnalysis>
): Map<string, number> {
  const result = new Map<string, number>();
  const boardSize = getBoardSize(document);

  for (const movePath of getLinePaths(path)) {
    const node = getNodeAtPath(document, movePath);
    const color = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
    const point = color == null ? null : (node.data[color]?.[0] ?? '');
    if (color == null || point == null || point === '') continue;

    const parentPath = movePath.slice(0, -1);
    const parentAnalysis = cache[nodeKey(document, parentPath)]?.result;
    const childAnalysis = cache[nodeKey(document, movePath)]?.result;
    const move = parentAnalysis?.moveInfos?.find(
      (item) => item.move.toLowerCase() === sgfPointToGtp(point, boardSize).toLowerCase()
    );

    const moveVisits = move?.visits ?? 0;
    const childVisits = childAnalysis?.rootInfo?.visits ?? 0;
    const scoreDelta =
      childVisits > moveVisits
        ? analysisRootScoreDelta(parentAnalysis, childAnalysis, color)
        : parentAnalysis != null && move != null
          ? analysisMoveScoreDelta(move, parentAnalysis, color)
          : analysisRootScoreDelta(parentAnalysis, childAnalysis, color);
    if (scoreDelta != null) result.set(point, scoreDelta);
  }

  return result;
}

function analysisMoveScoreDelta(move: KataGoMoveInfo, analysis: KataGoAnalysisResult, color: 'B' | 'W'): number | null {
  const score = move.scoreLead ?? move.scoreMean ?? null;
  const rootScore = analysis.rootInfo?.scoreLead ?? analysis.rootInfo?.scoreMean ?? 0;
  if (score == null) return null;

  return (score - rootScore) * (color === 'B' ? 1 : -1);
}

function analysisRootScoreDelta(
  parent: KataGoAnalysisResult | undefined,
  child: KataGoAnalysisResult | undefined,
  color: 'B' | 'W'
): number | null {
  const parentScore = parent?.rootInfo?.scoreLead ?? parent?.rootInfo?.scoreMean ?? null;
  const childScore = child?.rootInfo?.scoreLead ?? child?.rootInfo?.scoreMean ?? null;
  if (parentScore == null || childScore == null) return null;

  return (childScore - parentScore) * (color === 'B' ? 1 : -1);
}

export function normalizeWinratePercent(value: number): number {
  return value > 1 ? value : value * 100;
}
