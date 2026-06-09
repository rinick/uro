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
  nextColorForPath,
  normalizeWinratePercent,
  shouldCountHiddenPassAnalysis,
  shouldRequestHiddenPassAnalysis,
  updateAnalysisCache,
  updateHiddenMoveAnalysisCache,
  type AnalysisQueryContext,
  type CachedAnalysis,
} from './appAnalysisUtils';
import {collectNodeIds, nodeKey, pathKey} from './appSgfUtils';
import {createLocalConsoleMessage} from './appUiUtils';

const liveAnalysisVisits = 10_000_000;
const maxFastAnalysisQueries = 2;
const nextFastAnalysisCount = 5;
const analysisSettingsStorageKey = 'uro.analysisSettings';

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

type FastAnalysisJob = {path: number[]; hiddenPass: boolean};

export function useKataGoAnalysis({
  enabled,
  document,
  path,
  analysisPaths,
  analysisChartPaths,
  pendingSetupPathRef,
  startFailedMessage,
}: UseKataGoAnalysisOptions) {
  const [analysisSettings, setAnalysisSettings] = useState<AnalysisSettings>(() => readStoredAnalysisSettings());
  const [kataGoSettings, setKataGoSettings] = useState<KataGoSettings>(defaultKataGoSettings);
  const [analysisCache, setAnalysisCache] = useState<Record<string, CachedAnalysis>>({});
  const [kataGoConsoleMessages, setKataGoConsoleMessages] = useState<KataGoConsoleMessage[]>([]);
  const [analysisMode, setAnalysisMode] = useState(false);
  const [analysisQueueRevision, setAnalysisQueueRevision] = useState(0);
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
      return cached == null || cached.visits < analysisTargetVisits;
    }).length;
    const hiddenPass =
      analysisSettings.moveDisplay === 'absScore'
        ? analysisPaths.filter((movePath) =>
            shouldCountHiddenPassAnalysis(document, movePath, analysisCache, analysisTargetVisits)
          ).length
        : 0;
    return {normal, hiddenPass};
  }, [
    analysisCache,
    analysisPaths,
    analysisQueueRevision,
    analysisSettings.moveDisplay,
    analysisTargetVisits,
    document,
    enabled,
  ]);
  const fastAnalysisPendingCount = analysisPendingCounts.normal + analysisPendingCounts.hiddenPass;
  const analysisChartData = useMemo<AnalysisChartPoint[]>(
    () => (enabled ? buildAnalysisChartData(document, analysisChartPaths, analysisCache, analysisTargetVisits) : []),
    [analysisCache, analysisChartPaths, analysisTargetVisits, document, enabled]
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
    let changed = false;
    for (const [id, context] of analysisQueryContextRef.current.entries()) {
      if (context.mode === mode) {
        analysisQueryContextRef.current.delete(id);
        changed = true;
      }
    }
    if (changed) setAnalysisQueueRevision((current) => current + 1);
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

  const resetAnalysisForDocumentChange = useCallback(
    (next: SgfDocument, options: AnalysisDocumentChangeOptions): void => {
      const pendingQueryIds = [...analysisQueryContextRef.current.keys()];
      documentVersionRef.current += 1;
      analysisQueryContextRef.current.clear();
      if (pendingQueryIds.length > 0) {
        setAnalysisQueueRevision((current) => current + 1);
        if (enabled && window.uro != null) void window.uro.katago.stopAnalysis(pendingQueryIds);
      }

      if (options.clearAnalysisCache === true) {
        setAnalysisCache({});
      } else if (options.invalidatePath != null) {
        const invalidatedNodeIds = new Set(collectNodeIds(getNodeAtPath(next, options.invalidatePath)));
        setAnalysisCache((current) =>
          Object.fromEntries(Object.entries(current).filter(([nodeId]) => !invalidatedNodeIds.has(nodeId)))
        );
      }
    },
    [enabled]
  );

  const saveAnalysisSettings = useCallback((settings: AnalysisSettings): void => {
    writeStoredAnalysisSettings(settings);
    setAnalysisSettings(settings);
  }, []);

  const updateAnalysisSettings = useCallback((values: Partial<AnalysisSettings>): void => {
    setAnalysisSettings((current) => {
      const next = {...current, ...values};
      writeStoredAnalysisSettings(next);
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
      .then((settings) => saveAnalysisSettings({...defaultAnalysisSettings, ...settings}))
      .catch(() => undefined);
  }, [enabled, refreshKataGoSettings, saveAnalysisSettings]);

  useEffect(() => {
    if (!enabled || window.uro == null) return;

    const unsubscribeAnalysis = window.uro.katago.onAnalysis((result) => {
      const context = analysisQueryContextRef.current.get(result.id);
      if (context == null) return;
      if (!result.isDuringSearch) {
        analysisQueryContextRef.current.delete(result.id);
        setAnalysisQueueRevision((current) => current + 1);
      }

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
      setAnalysisQueueRevision((current) => current + 1);

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
        setAnalysisQueueRevision((current) => current + 1);
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
      setAnalysisQueueRevision((current) => current + 1);

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
        setAnalysisQueueRevision((current) => current + 1);
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
    if (fastAnalysisPendingCount > 0 || hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast')) {
      if (hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live')) {
        const liveQueryIds = getPendingAnalysisQueryIds(analysisQueryContextRef.current, 'live');
        clearPendingAnalysisQueries('live');
        void uro.katago.stopAnalysis(liveQueryIds);
      }
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
    analysisQueueRevision,
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

  const handleFastAnalysis = useCallback(async (): Promise<void> => {
    if (!enabled || window.uro == null || !analysisMode) return;

    try {
      const settings = await refreshKataGoSettings();
      const targetVisits = Math.max(1, settings.fastVisits || defaultKataGoSettings.fastVisits);
      const runVersion = documentVersionRef.current;
      const staleFastQueryIds = getFastQueryIdsOutsidePaths(analysisQueryContextRef.current, analysisPaths);
      if (staleFastQueryIds.length > 0) {
        for (const queryId of staleFastQueryIds) analysisQueryContextRef.current.delete(queryId);
        setAnalysisQueueRevision((current) => current + 1);
        await window.uro.katago.stopAnalysis(staleFastQueryIds);
      }

      let availableSlots =
        maxFastAnalysisQueries - getPendingAnalysisQueryIds(analysisQueryContextRef.current, 'fast').length;
      if (availableSlots <= 0) return;

      const jobs = buildFastAnalysisJobs({
        analysisPaths,
        currentPath: path,
        valueMode: analysisSettings.moveDisplay === 'absScore',
        document,
        analysisCache,
        targetVisits,
        pendingQueries: analysisQueryContextRef.current,
      });

      for (const job of jobs) {
        if (availableSlots <= 0 || !analysisModeRef.current || runVersion !== documentVersionRef.current) break;
        if (job.hiddenPass) {
          await requestHiddenPassAnalysis(job.path, 'fast', targetVisits, -100);
        } else {
          await requestAnalysis(job.path, 'fast', targetVisits);
        }
        availableSlots -= 1;
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
    path,
    refreshKataGoSettings,
    requestAnalysis,
    requestHiddenPassAnalysis,
    startFailedMessage,
  ]);

  useEffect(() => {
    if (!analysisMode || analysisPaths.length === 0) return;
    void handleFastAnalysis();
  }, [analysisPaths.length, analysisMode, analysisQueueRevision, handleFastAnalysis]);

  return {
    analysisSettings,
    updateAnalysisSettings,
    onAnalysisSettingsSave: saveAnalysisSettings,
    analysisMode,
    setAnalysisModeActive,
    toggleAnalysisMode,
    currentAnalysis,
    stoneScoreDeltas,
    analysisChartData,
    selectedChartMoveNumber,
    analysisChartSummary,
    fastAnalysisPendingCount,
    kataGoConsoleMessages,
    setKataGoConsoleMessages,
    kataGoConsoleRef,
    refreshKataGoSettings,
    resetAnalysisForDocumentChange,
  };
}

function readStoredAnalysisSettings(): AnalysisSettings {
  try {
    const value = localStorage.getItem(analysisSettingsStorageKey);
    if (value == null) return defaultAnalysisSettings;
    return {...defaultAnalysisSettings, ...JSON.parse(value)};
  } catch {
    return defaultAnalysisSettings;
  }
}

function writeStoredAnalysisSettings(settings: AnalysisSettings): void {
  try {
    localStorage.setItem(analysisSettingsStorageKey, JSON.stringify(settings));
  } catch {
    // Ignore storage failures; settings still apply for this session.
  }
}

function buildFastAnalysisJobs({
  analysisPaths,
  currentPath,
  valueMode,
  document,
  analysisCache,
  targetVisits,
  pendingQueries,
}: {
  analysisPaths: number[][];
  currentPath: number[];
  valueMode: boolean;
  document: SgfDocument;
  analysisCache: Record<string, CachedAnalysis>;
  targetVisits: number;
  pendingQueries: Map<string, AnalysisQueryContext>;
}): FastAnalysisJob[] {
  const currentIndex = analysisPaths.findIndex((movePath) => samePath(movePath, currentPath));
  const firstNextIndex = currentIndex < 0 ? 0 : currentIndex + 1;
  const nextPaths = analysisPaths.slice(firstNextIndex, firstNextIndex + nextFastAnalysisCount);
  const currentPaths = currentIndex < 0 ? [] : [analysisPaths[currentIndex]];
  const nextKeys = new Set(nextPaths.map(pathKey));
  const currentKeys = new Set(currentPaths.map(pathKey));
  const otherPaths = analysisPaths.filter((movePath) => {
    const key = pathKey(movePath);
    return !currentKeys.has(key) && !nextKeys.has(key);
  });
  const jobs: FastAnalysisJob[] = [];
  const queued = new Set<string>();

  function addNormalJobs(paths: number[][]): void {
    for (const movePath of paths) {
      const nodeId = nodeKey(document, movePath);
      const cached = analysisCache[nodeId];
      if (cached != null && cached.visits >= targetVisits) continue;
      if (hasPendingAnalysisQuery(pendingQueries, 'fast', nodeId, null)) continue;
      addJob({path: movePath, hiddenPass: false});
    }
  }

  function addHiddenPassJobs(paths: number[][]): void {
    if (!valueMode) return;
    for (const movePath of paths) {
      const nodeId = nodeKey(document, movePath);
      if (!shouldRequestHiddenPassAnalysis(document, movePath, analysisCache, targetVisits)) continue;
      if (hasPendingAnalysisQuery(pendingQueries, 'fast', nodeId, 'pass')) continue;
      addJob({path: movePath, hiddenPass: true});
    }
  }

  function addJob(job: FastAnalysisJob): void {
    const key = `${pathKey(job.path)}:${job.hiddenPass ? 'pass' : 'normal'}`;
    if (queued.has(key)) return;
    queued.add(key);
    jobs.push(job);
  }

  addNormalJobs(currentPaths);
  addHiddenPassJobs(currentPaths);
  addNormalJobs(nextPaths);
  addHiddenPassJobs(nextPaths);
  addNormalJobs(otherPaths);
  addHiddenPassJobs(otherPaths);

  return jobs;
}

function getFastQueryIdsOutsidePaths(
  pendingQueries: Map<string, AnalysisQueryContext>,
  analysisPaths: number[][]
): string[] {
  const pathKeys = new Set(analysisPaths.map(pathKey));
  return [...pendingQueries.entries()]
    .filter(([, context]) => context.mode === 'fast' && !pathKeys.has(pathKey(context.path)))
    .map(([queryId]) => queryId);
}
