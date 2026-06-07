import {getNodeAtPath, samePath, type SgfDocument} from '@uro/sgf-core';
import {defaultAnalysisSettings, type AnalysisChartPoint, type AnalysisSettings} from '@uro/analysis-core';
import {
  buildKataGoQuery,
  defaultKataGoSettings,
  type KataGoConsoleMessage,
  type KataGoSettings,
} from '@uro/katago-core';
import {useCallback, useEffect, useMemo, useRef, useState, type RefObject} from 'react';
import {
  buildAnalysisChartData,
  buildStoneScoreDeltas,
  getAnalysisVisits,
  getPendingAnalysisQueryIds,
  hasPendingAnalysisQuery,
  hiddenPassVisits,
  nextColorForPath,
  normalizeWinratePercent,
  shouldCountHiddenPassAnalysis,
  shouldRequestHiddenPassAnalysis,
  updateAnalysisCache,
  updateHiddenMoveAnalysisCache,
  type AnalysisQueryContext,
  type CachedAnalysis,
} from './appAnalysisUtils';
import {collectNodeIds, nodeKey} from './appSgfUtils';
import {createLocalConsoleMessage} from './appUiUtils';

const liveAnalysisVisits = 10_000_000;

interface UseKataGoAnalysisOptions {
  enabled: boolean;
  document: SgfDocument;
  path: number[];
  analysisPaths: number[][];
  analysisChartPaths: number[][];
  pendingSetupPathRef: RefObject<number[] | null>;
  startFailedMessage: string;
}

interface AnalysisDocumentChangeOptions {
  clearAnalysisCache?: boolean;
  invalidatePath?: number[];
}

export function useKataGoAnalysis({
  enabled,
  document,
  path,
  analysisPaths,
  analysisChartPaths,
  pendingSetupPathRef,
  startFailedMessage,
}: UseKataGoAnalysisOptions) {
  const [analysisSettings, setAnalysisSettings] = useState<AnalysisSettings>(defaultAnalysisSettings);
  const [kataGoSettings, setKataGoSettings] = useState<KataGoSettings>(defaultKataGoSettings);
  const [analysisCache, setAnalysisCache] = useState<Record<string, CachedAnalysis>>({});
  const [kataGoConsoleMessages, setKataGoConsoleMessages] = useState<KataGoConsoleMessage[]>([]);
  const [analysisMode, setAnalysisMode] = useState(false);
  const analysisQueryContextRef = useRef(new Map<string, AnalysisQueryContext>());
  const documentVersionRef = useRef(0);
  const analysisModeRef = useRef(false);
  const kataGoConsoleRef = useRef<HTMLDivElement>(null);

  const currentAnalysis = useMemo(
    () => (enabled ? (analysisCache[nodeKey(document, path)]?.result ?? null) : null),
    [analysisCache, document, enabled, path]
  );
  const analysisTargetVisits = Math.max(1, kataGoSettings.fastVisits || defaultKataGoSettings.fastVisits);
  const analysisPendingCounts = useMemo(() => {
    if (!enabled) return {normal: 0, hiddenPass: 0};

    const normal = analysisPaths.filter((movePath) => {
      const nodeId = nodeKey(document, movePath);
      const cached = analysisCache[nodeId];
      return (
        (cached == null || cached.visits < analysisTargetVisits) &&
        !hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live', nodeId)
      );
    }).length;
    const hiddenPass =
      analysisSettings.moveDisplay === 'absScore'
        ? analysisPaths.filter((movePath) => {
            const nodeId = nodeKey(document, movePath);
            return (
              shouldCountHiddenPassAnalysis(document, movePath, analysisCache, analysisTargetVisits) &&
              !hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live', nodeId)
            );
          }).length
        : 0;
    return {normal, hiddenPass};
  }, [analysisCache, analysisPaths, analysisSettings.moveDisplay, analysisTargetVisits, document, enabled]);
  const fastAnalysisPendingCount = analysisPendingCounts.normal + analysisPendingCounts.hiddenPass;
  const waitingForFastAnalysis = analysisMode && fastAnalysisPendingCount > 0;
  const analysisChartData = useMemo<AnalysisChartPoint[]>(
    () => (enabled ? buildAnalysisChartData(document, analysisChartPaths, analysisCache) : []),
    [analysisCache, analysisChartPaths, document, enabled]
  );
  const selectedChartMoveNumber = useMemo(() => {
    if (!enabled) return null;

    const index = analysisChartPaths.findIndex((movePath) => samePath(movePath, path));
    return index < 0 ? null : index;
  }, [analysisChartPaths, enabled, path]);
  const analysisChartSummary = useMemo(() => {
    if (!enabled) return null;

    const rootInfo = currentAnalysis?.rootInfo;
    const scoreLead = rootInfo?.scoreLead ?? rootInfo?.scoreMean ?? null;
    const winrate = rootInfo?.winrate == null ? null : normalizeWinratePercent(rootInfo.winrate);
    return scoreLead == null && winrate == null ? null : {scoreLead, winrate};
  }, [currentAnalysis, enabled]);
  const stoneScoreDeltas = useMemo(
    () => (enabled ? buildStoneScoreDeltas(document, path, analysisCache) : new Map<string, number>()),
    [analysisCache, document, enabled, path]
  );

  const appendKataGoConsoleMessage = useCallback((message: KataGoConsoleMessage): void => {
    setKataGoConsoleMessages((current) => [...current.slice(-499), message]);
  }, []);

  const clearPendingAnalysisQueries = useCallback((mode: AnalysisQueryContext['mode']): void => {
    for (const [id, context] of analysisQueryContextRef.current.entries()) {
      if (context.mode === mode) analysisQueryContextRef.current.delete(id);
    }
  }, []);

  const setAnalysisModeActive = useCallback(
    (active: boolean): void => {
      if (!enabled && active) return;
      analysisModeRef.current = active;
      setAnalysisMode(active);
      if (!active) {
        clearPendingAnalysisQueries('fast');
        clearPendingAnalysisQueries('live');
        if (enabled && window.uro != null) void window.uro.katago.stopAnalysis();
      }
    },
    [clearPendingAnalysisQueries, enabled]
  );

  const toggleAnalysisMode = useCallback((): void => {
    setAnalysisModeActive(!analysisMode);
  }, [analysisMode, setAnalysisModeActive]);

  const resetAnalysisForDocumentChange = useCallback((next: SgfDocument, options: AnalysisDocumentChangeOptions): void => {
    documentVersionRef.current += 1;
    analysisQueryContextRef.current.clear();
    if (options.clearAnalysisCache === true) {
      setAnalysisCache({});
    } else if (options.invalidatePath != null) {
      const invalidatedNodeIds = new Set(collectNodeIds(getNodeAtPath(next, options.invalidatePath)));
      setAnalysisCache((current) =>
        Object.fromEntries(Object.entries(current).filter(([nodeId]) => !invalidatedNodeIds.has(nodeId)))
      );
    }
  }, []);

  const updateAnalysisSettings = useCallback((values: Partial<AnalysisSettings>): void => {
    setAnalysisSettings((current) => {
      const next = {...current, ...values};
      if (window.uro != null) void window.uro.analysis.saveSettings(next);
      return next;
    });
  }, []);

  const refreshKataGoSettings = useCallback(async (): Promise<KataGoSettings> => {
    if (!enabled || window.uro == null) return defaultKataGoSettings;
    const settings = await window.uro.katago.getSettings();
    setKataGoSettings(settings);
    return settings;
  }, [enabled]);

  useEffect(() => {
    if (!enabled || window.uro == null) return;
    void refreshKataGoSettings();
    window.uro.analysis
      .getSettings()
      .then((settings) => setAnalysisSettings({...defaultAnalysisSettings, ...settings}))
      .catch(() => undefined);
  }, [enabled, refreshKataGoSettings]);

  useEffect(() => {
    if (!enabled || window.uro == null) return;

    const unsubscribeAnalysis = window.uro.katago.onAnalysis((result) => {
      const context = analysisQueryContextRef.current.get(result.id);
      if (context == null) return;
      if (!result.isDuringSearch) analysisQueryContextRef.current.delete(result.id);

      if (context.version !== documentVersionRef.current) return;
      if (result.error != null) return;

      const visits = getAnalysisVisits(result);
      setAnalysisCache((current) => {
        const existing = current[context.nodeId];
        if (context.hiddenMove == null && existing != null && visits < existing.visits && result.isDuringSearch)
          return current;
        if (context.hiddenMove != null) {
          return updateHiddenMoveAnalysisCache({
            cache: current,
            document,
            path: context.path,
            move: context.hiddenMove,
            result,
            completed: existing?.completed === true || !result.isDuringSearch,
          });
        }

        return updateAnalysisCache({
          cache: current,
          document,
          path: context.path,
          result,
          visits,
          completed: existing?.completed === true || !result.isDuringSearch,
        });
      });
    });
    const unsubscribeConsole = window.uro.katago.onConsoleMessage(appendKataGoConsoleMessage);

    return () => {
      unsubscribeAnalysis();
      unsubscribeConsole();
    };
  }, [appendKataGoConsoleMessage, document, enabled]);

  useEffect(() => {
    const element = kataGoConsoleRef.current;
    if (element == null) return;
    element.scrollTop = element.scrollHeight;
  }, [kataGoConsoleMessages]);

  useEffect(() => {
    analysisModeRef.current = analysisMode;
  }, [analysisMode]);

  const requestAnalysis = useCallback(
    async (
      requestPath: number[],
      mode: AnalysisQueryContext['mode'],
      maxVisits: number,
      live = false
    ): Promise<void> => {
      if (!enabled || window.uro == null) return;

      const queryId = `uro-${mode}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      analysisQueryContextRef.current.set(queryId, {
        nodeId: nodeKey(document, requestPath),
        path: requestPath,
        version: documentVersionRef.current,
        mode,
      });

      try {
        await window.uro.katago.analyze(
          buildKataGoQuery(document, {
            id: queryId,
            path: requestPath,
            live,
            maxVisits: live ? liveAnalysisVisits : maxVisits,
          })
        );
      } catch (error) {
        analysisQueryContextRef.current.delete(queryId);
        throw error;
      }
    },
    [document, enabled]
  );

  const requestHiddenPassAnalysis = useCallback(
    async (
      requestPath: number[],
      mode: AnalysisQueryContext['mode'],
      maxVisits: number,
      priority: number
    ): Promise<void> => {
      if (!enabled || window.uro == null) return;

      const queryId = `uro-${mode}-pass-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      analysisQueryContextRef.current.set(queryId, {
        nodeId: nodeKey(document, requestPath),
        path: requestPath,
        version: documentVersionRef.current,
        mode,
        hiddenMove: 'pass',
      });

      try {
        await window.uro.katago.analyze(
          buildKataGoQuery(document, {
            id: queryId,
            path: requestPath,
            maxVisits,
            priority,
            nextMove: {color: nextColorForPath(document, requestPath), point: ''},
          })
        );
      } catch (error) {
        analysisQueryContextRef.current.delete(queryId);
        throw error;
      }
    },
    [document, enabled]
  );

  useEffect(() => {
    if (!enabled || window.uro == null) return;
    const uro = window.uro;

    if (!analysisMode) {
      if (!hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast')) void uro.katago.stopAnalysis();
      return;
    }
    if (pendingSetupPathRef.current != null && samePath(pendingSetupPathRef.current, path)) return;

    const liveQueryIds = getPendingAnalysisQueryIds(analysisQueryContextRef.current, 'live');
    if (
      liveQueryIds.length === 0 &&
      (hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast') ||
        (analysisMode && fastAnalysisPendingCount > 0))
    ) {
      return;
    }

    const targetVisits = Math.max(1, kataGoSettings.maxVisits || defaultKataGoSettings.maxVisits);
    const liveNodeId = nodeKey(document, path);
    if (hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live', liveNodeId)) return;
    let cancelled = false;

    void (async () => {
      try {
        if (hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live')) {
          const liveQueryIds = getPendingAnalysisQueryIds(analysisQueryContextRef.current, 'live');
          clearPendingAnalysisQueries('live');
          await uro.katago.stopAnalysis(liveQueryIds);
        }
        if (!cancelled) await requestAnalysis(path, 'live', targetVisits, true);
      } catch (error: unknown) {
        appendKataGoConsoleMessage(
          createLocalConsoleMessage(
            'uro',
            'error',
            error instanceof Error ? error.message : startFailedMessage
          )
        );
        setAnalysisModeActive(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    analysisMode,
    appendKataGoConsoleMessage,
    clearPendingAnalysisQueries,
    document,
    enabled,
    fastAnalysisPendingCount,
    kataGoSettings.maxVisits,
    path,
    pendingSetupPathRef,
    requestAnalysis,
    setAnalysisModeActive,
    startFailedMessage,
  ]);

  useEffect(() => {
    if (!enabled || window.uro == null || analysisSettings.moveDisplay !== 'absScore') return;

    const targetVisits = hiddenPassVisits(kataGoSettings, analysisMode);
    const nodeId = nodeKey(document, path);
    if (!shouldRequestHiddenPassAnalysis(document, path, analysisCache, targetVisits)) return;
    if (hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast', nodeId, 'pass')) return;

    void requestHiddenPassAnalysis(path, 'fast', targetVisits, 100).catch((error: unknown) => {
      appendKataGoConsoleMessage(
        createLocalConsoleMessage('uro', 'error', error instanceof Error ? error.message : startFailedMessage)
      );
    });
  }, [
    analysisCache,
    analysisMode,
    analysisSettings.moveDisplay,
    appendKataGoConsoleMessage,
    document,
    enabled,
    kataGoSettings,
    path,
    requestHiddenPassAnalysis,
    startFailedMessage,
  ]);

  const handleFastAnalysis = useCallback(async (): Promise<void> => {
    if (!enabled || window.uro == null || !analysisMode) return;

    try {
      const settings = await refreshKataGoSettings();
      const targetVisits = Math.max(1, settings.fastVisits || defaultKataGoSettings.fastVisits);
      const runVersion = documentVersionRef.current;
      const pathsToAnalyze = analysisPaths.filter((movePath) => {
        const nodeId = nodeKey(document, movePath);
        const cached = analysisCache[nodeId];
        return (
          (cached == null || cached.visits < targetVisits) &&
          !hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast', nodeId, null) &&
          !hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live', nodeId)
        );
      });

      for (const movePath of pathsToAnalyze) {
        if (!analysisModeRef.current || runVersion !== documentVersionRef.current) break;
        await requestAnalysis(movePath, 'fast', targetVisits);
      }

      if (analysisSettings.moveDisplay === 'absScore') {
        const passPathsToAnalyze = analysisPaths.filter((movePath) => {
          const nodeId = nodeKey(document, movePath);
          return (
            shouldRequestHiddenPassAnalysis(document, movePath, analysisCache, targetVisits) &&
            !hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast', nodeId, 'pass') &&
            !hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live', nodeId)
          );
        });

        for (const movePath of passPathsToAnalyze) {
          if (!analysisModeRef.current || runVersion !== documentVersionRef.current) break;
          await requestHiddenPassAnalysis(movePath, 'fast', targetVisits, -100);
        }
      }
    } catch (error) {
      appendKataGoConsoleMessage(
        createLocalConsoleMessage('uro', 'error', error instanceof Error ? error.message : startFailedMessage)
      );
    }
  }, [
    analysisCache,
    analysisMode,
    analysisPaths,
    analysisSettings.moveDisplay,
    appendKataGoConsoleMessage,
    document,
    enabled,
    refreshKataGoSettings,
    requestAnalysis,
    requestHiddenPassAnalysis,
    startFailedMessage,
  ]);

  useEffect(() => {
    if (!analysisMode || analysisPaths.length === 0) return;
    void handleFastAnalysis();
  }, [analysisPaths.length, analysisMode, handleFastAnalysis]);

  return {
    analysisSettings,
    updateAnalysisSettings,
    onAnalysisSettingsSave: setAnalysisSettings,
    analysisMode,
    setAnalysisModeActive,
    toggleAnalysisMode,
    currentAnalysis,
    stoneScoreDeltas,
    analysisChartData,
    selectedChartMoveNumber,
    analysisChartSummary,
    fastAnalysisPendingCount,
    waitingForFastAnalysis,
    kataGoConsoleMessages,
    setKataGoConsoleMessages,
    kataGoConsoleRef,
    refreshKataGoSettings,
    resetAnalysisForDocumentChange,
  };
}
