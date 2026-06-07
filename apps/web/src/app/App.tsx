import {
  DownloadOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  LineChartOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  TranslationOutlined,
} from '@ant-design/icons';
import {
  Button,
  Checkbox,
  ConfigProvider,
  Dropdown,
  Layout,
  Segmented,
  Select,
  Space,
  Switch,
  Tooltip,
  message,
  theme,
} from 'antd';
import type {MenuProps} from 'antd';
import {
  addLabel,
  addMarkup,
  addMove,
  createNewGame,
  deleteNode,
  erasePoint,
  getComment,
  getBoardSize,
  getGameInfo,
  getNodeAtPath,
  buildTree,
  moveBranch,
  moveBranchToMain,
  replaceMove,
  samePath,
  serializeSgf,
  updateComment,
  updateGameInfo,
  type SgfColor,
  type SgfDocument,
} from '@uro/sgf-core';
import {boardSizes, type BoardSize} from '@uro/ui-shared';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {deriveBoardPosition} from '@uro/go-core';
import {
  defaultAnalysisSettings,
  type AnalysisSettings,
  type AnalysisChartPoint,
} from '@uro/analysis-core';
import {
  buildKataGoQuery,
  defaultKataGoSettings,
  type KataGoConsoleMessage,
  type KataGoSettings,
} from '@uro/katago-core';
import {GoBoard, type MoveNumberLimit} from '../features/board/GoBoard';
import {CommentsPanel} from '../features/comments/CommentsPanel';
import {GameInfoModal} from '../features/game-info/GameInfoModal';
import {AnalysisSettingsModal} from '../features/analysis/AnalysisSettingsModal';
import {KataGoSettingsModal} from '../features/katago/KataGoSettingsModal';
import {SgfTreePanel} from '../features/sgf-tree/SgfTreePanel';
import {layoutTree} from '../features/sgf-tree/layout';
import {OpenGameModal} from '../features/storage/OpenGameModal';
import {
  deleteStoredGame,
  listStoredGames,
  loadStoredGame,
  saveStoredGame,
  type StoredGameSummary,
} from '../features/storage/gameStorage';
import {EditorToolbar} from '../features/toolbar/EditorToolbar';
import type {EditorTool} from '../features/toolbar/types';
import {getAppCapabilities} from './capabilities';
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
import {
  addSetupStoneToPath,
  collectNodeIds,
  findChildMovePath,
  getCurrentBranchMovePaths,
  getMovePaths,
  isCurrentSetupStone,
  isTextInputActive,
  nextFirstChildPath,
  nextRememberedPath,
  nodeKey,
  normalizeSelectedPath,
  oppositeColor,
  parseGameRecord,
  pathKey,
  readGameRecordFile,
  safeFileName,
  toolToMarkup,
  withImportedGameName,
} from './appSgfUtils';
import {
  antdLocales,
  createLocalConsoleMessage,
  formatConsoleTime,
  languageOptions,
  normalizeLanguage,
} from './appUiUtils';

const {Header, Content} = Layout;
const liveAnalysisVisits = 10_000_000;

interface ReplaceDocumentOptions {
  clearAnalysisCache?: boolean;
  invalidatePath?: number[];
  pendingSetupPath?: number[] | null;
}

export function App() {
  const {t, i18n} = useTranslation();
  const capabilities = useMemo(() => getAppCapabilities(), []);
  const [document, setDocument] = useState<SgfDocument>(() => createNewGame());
  const [path, setPath] = useState<number[]>([]);
  const [tool, setTool] = useState<EditorTool>('auto');
  const [autoColorOverride, setAutoColorOverride] = useState<'B' | 'W' | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [showCoordinates, setShowCoordinates] = useState(true);
  const [moveNumberLimit, setMoveNumberLimit] = useState<MoveNumberLimit>('all');
  const [gameInfoOpen, setGameInfoOpen] = useState(false);
  const [openGameModalOpen, setOpenGameModalOpen] = useState(false);
  const [storedGameId, setStoredGameId] = useState<string | null>(null);
  const [storedGames, setStoredGames] = useState<StoredGameSummary[]>([]);
  const [selectedStoredGameId, setSelectedStoredGameId] = useState<string | null>(null);
  const [storedGamesLoading, setStoredGamesLoading] = useState(false);
  const [kataGoSettingsOpen, setKataGoSettingsOpen] = useState(false);
  const [analysisSettingsOpen, setAnalysisSettingsOpen] = useState(false);
  const [analysisSettings, setAnalysisSettings] = useState<AnalysisSettings>(defaultAnalysisSettings);
  const [kataGoSettings, setKataGoSettings] = useState<KataGoSettings>(defaultKataGoSettings);
  const [analysisCache, setAnalysisCache] = useState<Record<string, CachedAnalysis>>({});
  const [kataGoConsoleMessages, setKataGoConsoleMessages] = useState<KataGoConsoleMessage[]>([]);
  const [analysisMode, setAnalysisMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const branchMemoryRef = useRef(new Map<string, number>());
  const analysisQueryContextRef = useRef(new Map<string, AnalysisQueryContext>());
  const documentVersionRef = useRef(0);
  const analysisModeRef = useRef(false);
  const pendingSetupPathRef = useRef<number[] | null>(null);
  const kataGoConsoleRef = useRef<HTMLDivElement>(null);
  const gameInfo = useMemo(() => getGameInfo(document), [document]);
  const boardSize = useMemo(() => getBoardSize(document), [document]);
  const position = useMemo(() => deriveBoardPosition(document, path), [document, path]);
  const treeLayout = useMemo(() => layoutTree(buildTree(document)[0], boardSize), [boardSize, document]);
  const nextAutoColor = autoColorOverride ?? position.nextColor;
  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);
  const antdLocale = antdLocales[currentLanguage];
  const stoneOverlayDisplay = analysisSettings.topMoveDisplay;
  const boardMoveNumberLimit =
    capabilities.katago && stoneOverlayDisplay === 'number'
      ? analysisSettings.maxMoves
      : capabilities.katago
        ? 0
        : moveNumberLimit;
  const blackPlayerName = gameInfo.PB.trim() === '' ? t('app.black') : gameInfo.PB;
  const whitePlayerName = gameInfo.PW.trim() === '' ? t('app.white') : gameInfo.PW;
  const analysisChartPaths = useMemo(
    () => getCurrentBranchMovePaths(document, path, branchMemoryRef.current),
    [document, path]
  );
  const movePaths = useMemo(() => getMovePaths(document), [document]);
  const analysisPaths = useMemo(() => [[], ...movePaths], [movePaths]);
  const currentAnalysis = useMemo(
    () => analysisCache[nodeKey(document, path)]?.result ?? null,
    [analysisCache, document, path]
  );
  const analysisTargetVisits = Math.max(1, kataGoSettings.fastVisits || defaultKataGoSettings.fastVisits);
  const analysisPendingCounts = useMemo(() => {
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
  }, [analysisCache, analysisPaths, analysisSettings.moveDisplay, analysisTargetVisits, document]);
  const fastAnalysisPendingCount = analysisPendingCounts.normal + analysisPendingCounts.hiddenPass;
  const waitingForFastAnalysis = analysisMode && fastAnalysisPendingCount > 0;
  const analysisChartData = useMemo<AnalysisChartPoint[]>(
    () => buildAnalysisChartData(document, analysisChartPaths, analysisCache),
    [analysisCache, analysisChartPaths, document]
  );
  const selectedChartMoveNumber = useMemo(() => {
    const index = analysisChartPaths.findIndex((movePath) => samePath(movePath, path));
    return index < 0 ? null : index;
  }, [analysisChartPaths, path]);
  const analysisChartSummary = useMemo(() => {
    const rootInfo = currentAnalysis?.rootInfo;
    const scoreLead = rootInfo?.scoreLead ?? rootInfo?.scoreMean ?? null;
    const winrate = rootInfo?.winrate == null ? null : normalizeWinratePercent(rootInfo.winrate);
    return scoreLead == null && winrate == null ? null : {scoreLead, winrate};
  }, [currentAnalysis]);
  const stoneScoreDeltas = useMemo(
    () => buildStoneScoreDeltas(document, path, analysisCache),
    [analysisCache, document, path]
  );

  const newMenuItems: MenuProps['items'] = boardSizes.map((size) => ({
    key: String(size),
    label: t(`menu.new${size}`),
  }));

  const appendKataGoConsoleMessage = useCallback((message: KataGoConsoleMessage): void => {
    setKataGoConsoleMessages((current) => [...current.slice(-499), message]);
  }, []);

  function rememberPath(nextPath: number[]): void {
    for (let index = 0; index < nextPath.length; index += 1) {
      const parent = nextPath.slice(0, index);
      branchMemoryRef.current.set(pathKey(parent), nextPath[index]);
    }
  }

  function replaceDocument(next: SgfDocument, nextPath: number[] = [], options: ReplaceDocumentOptions = {}): void {
    const normalizedPath = normalizeSelectedPath(next, nextPath);
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
    setDocument(next);
    setPath(normalizedPath);
    setAutoColorOverride(null);
    setReplaceMode(false);
    pendingSetupPathRef.current = options.pendingSetupPath ?? null;
    rememberPath(normalizedPath);
  }

  function selectPath(nextPath: number[], options: {keepAutoColorOverride?: boolean} = {}): void {
    const normalizedPath = normalizeSelectedPath(document, nextPath);
    pendingSetupPathRef.current = null;

    rememberPath(normalizedPath);
    setPath(normalizedPath);
    if (!options.keepAutoColorOverride) setAutoColorOverride(null);
    setReplaceMode(false);
  }

  const updateAnalysisSettings = useCallback((values: Partial<AnalysisSettings>): void => {
    setAnalysisSettings((current) => {
      const next = {...current, ...values};
      if (window.uro != null) void window.uro.analysis.saveSettings(next);
      return next;
    });
  }, []);

  const refreshKataGoSettings = useCallback(async (): Promise<KataGoSettings> => {
    if (window.uro == null) return defaultKataGoSettings;
    const settings = await window.uro.katago.getSettings();
    setKataGoSettings(settings);
    return settings;
  }, []);

  useEffect(() => {
    if (!capabilities.katago || window.uro == null) return;
    void refreshKataGoSettings();
    window.uro.analysis
      .getSettings()
      .then((settings) => setAnalysisSettings({...defaultAnalysisSettings, ...settings}))
      .catch(() => undefined);
  }, [capabilities.katago, refreshKataGoSettings]);

  useEffect(() => {
    if (!capabilities.katago || window.uro == null) return;

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
  }, [appendKataGoConsoleMessage, capabilities.katago, document]);

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
      if (window.uro == null) return;

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
    [document]
  );

  const requestHiddenPassAnalysis = useCallback(
    async (
      requestPath: number[],
      mode: AnalysisQueryContext['mode'],
      maxVisits: number,
      priority: number
    ): Promise<void> => {
      if (window.uro == null) return;

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
    [document]
  );

  useEffect(() => {
    if (!capabilities.katago || window.uro == null) return;
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
          createLocalConsoleMessage('uro', 'error', error instanceof Error ? error.message : t('analysis.startFailed'))
        );
        analysisModeRef.current = false;
        setAnalysisMode(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    appendKataGoConsoleMessage,
    capabilities.katago,
    document,
    fastAnalysisPendingCount,
    analysisMode,
    kataGoSettings.maxVisits,
    path,
    requestAnalysis,
    t,
  ]);

  useEffect(() => {
    if (!capabilities.katago || window.uro == null || analysisSettings.moveDisplay !== 'absScore') return;

    const targetVisits = hiddenPassVisits(kataGoSettings, analysisMode);
    const nodeId = nodeKey(document, path);
    if (!shouldRequestHiddenPassAnalysis(document, path, analysisCache, targetVisits)) return;
    if (hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast', nodeId, 'pass')) return;

    void requestHiddenPassAnalysis(path, 'fast', targetVisits, 100).catch((error: unknown) => {
      appendKataGoConsoleMessage(
        createLocalConsoleMessage('uro', 'error', error instanceof Error ? error.message : t('analysis.startFailed'))
      );
    });
  }, [
    analysisCache,
    analysisSettings.moveDisplay,
    appendKataGoConsoleMessage,
    capabilities.katago,
    document,
    kataGoSettings,
    analysisMode,
    path,
    requestHiddenPassAnalysis,
    t,
  ]);

  function handleNew(size: BoardSize = 19): void {
    branchMemoryRef.current.clear();
    setStoredGameId(null);
    analysisModeRef.current = false;
    setAnalysisMode(false);
    replaceDocument(createNewGame(size), [], {clearAnalysisCache: true});
  }

  async function handleSaveBrowserGame(): Promise<void> {
    try {
      const id = await saveStoredGame(document, storedGameId);
      setStoredGameId(id);
      message.success(t('savedGames.saved'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('savedGames.saveFailed'));
    }
  }

  async function openSavedGameDialog(): Promise<void> {
    setOpenGameModalOpen(true);
    setStoredGamesLoading(true);
    try {
      const games = await listStoredGames();
      setStoredGames(games);
      setSelectedStoredGameId(games[0]?.id ?? null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('savedGames.loadListFailed'));
    } finally {
      setStoredGamesLoading(false);
    }
  }

  async function handleOpenSavedGame(): Promise<void> {
    if (selectedStoredGameId == null) return;

    try {
      const nextDocument = await loadStoredGame(selectedStoredGameId);
      branchMemoryRef.current.clear();
      setStoredGameId(selectedStoredGameId);
      analysisModeRef.current = true;
      setAnalysisMode(true);
      replaceDocument(nextDocument, [], {clearAnalysisCache: true});
      setOpenGameModalOpen(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('savedGames.openFailed'));
    }
  }

  async function handleDeleteSavedGame(): Promise<void> {
    if (selectedStoredGameId == null) return;

    try {
      await deleteStoredGame(selectedStoredGameId);
      const games = await listStoredGames();
      setStoredGames(games);
      setSelectedStoredGameId(games[0]?.id ?? null);
      if (storedGameId === selectedStoredGameId) setStoredGameId(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('savedGames.deleteFailed'));
    }
  }

  async function handleExportSgf(): Promise<void> {
    const content = serializeSgf(document);
    if (capabilities.storage === 'filesystem' && window.uro != null) {
      try {
        await window.uro.exportSgf({content, suggestedName: `${safeFileName(gameInfo.GN || 'game')}.sgf`});
      } catch (error) {
        message.error(error instanceof Error ? error.message : t('menu.exportFailed'));
      }
      return;
    }

    const blob = new Blob([content], {type: 'application/x-go-sgf;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(gameInfo.GN || 'game')}.sgf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportSgfFromMenu(): Promise<void> {
    if (capabilities.storage === 'filesystem' && window.uro != null) {
      try {
        const result = await window.uro.importSgf();
        if (result == null) return;
        importSgfText(result.content, result.fileName);
      } catch (error) {
        message.error(error instanceof Error ? error.message : t('menu.importFailed'));
      }
      return;
    }

    fileInputRef.current?.click();
  }

  async function handleImportSgf(file: File | undefined): Promise<void> {
    if (file == null) return;

    try {
      const text = await readGameRecordFile(file);
      importSgfText(text, file.name);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('menu.importFailed'));
    } finally {
      if (fileInputRef.current != null) fileInputRef.current.value = '';
    }
  }

  function importSgfText(text: string, fileName: string): void {
    const importedDocument = withImportedGameName(parseGameRecord(text, fileName), fileName);
    branchMemoryRef.current.clear();
    setStoredGameId(null);
    analysisModeRef.current = true;
    setAnalysisMode(true);
    replaceDocument(importedDocument, [], {clearAnalysisCache: true});
  }

  function handleCommentChange(value: string): void {
    replaceDocument(updateComment(document, path, value), path);
  }

  const navigateToFirst = useCallback(() => {
    selectPath([]);
  }, [document, path]);

  const navigatePrevious = useCallback(
    (steps = 1) => {
      rememberPath(path);
      selectPath(path.slice(0, Math.max(0, path.length - steps)));
    },
    [document, path]
  );

  const navigateNext = useCallback(
    (steps = 1) => {
      selectPath(nextRememberedPath(document, path, steps, branchMemoryRef.current));
    },
    [document, path]
  );

  const navigateFirstChild = useCallback(
    (steps = 1) => {
      selectPath(nextFirstChildPath(document, path, steps));
    },
    [document, path]
  );

  const navigateToLast = useCallback(() => {
    selectPath(nextRememberedPath(document, path, Infinity, branchMemoryRef.current));
  }, [document, path]);

  const navigateBranch = useCallback(
    (direction: -1 | 1, steps = 1) => {
      const currentCell = treeLayout.cells.find((cell) => samePath(cell.path, path));
      if (currentCell == null) return;

      const rowCells = treeLayout.cells
        .filter((cell) => cell.row === currentCell.row)
        .sort((left, right) => left.column - right.column);
      const index = rowCells.findIndex((cell) => samePath(cell.path, path));
      const nextIndex = !Number.isFinite(steps)
        ? direction < 0
          ? 0
          : rowCells.length - 1
        : Math.max(0, Math.min(rowCells.length - 1, index + direction * steps));
      const nextPath = rowCells[nextIndex]?.path;
      if (nextPath == null) return;

      selectPath(nextPath);
    },
    [document, path, treeLayout]
  );

  function handleToolChange(nextTool: EditorTool): void {
    if (nextTool !== tool) selectPath(path, {keepAutoColorOverride: nextTool === 'auto'});
    setReplaceMode(false);
    setTool(nextTool);
    if (nextTool !== 'auto') setAutoColorOverride(null);
  }

  function handleAutoToolClick(): void {
    setReplaceMode(false);
    if (tool !== 'auto') {
      selectPath(path);
      setTool('auto');
      return;
    }

    setAutoColorOverride((current) => {
      const visibleColor = current ?? position.nextColor;
      return visibleColor === 'B' ? 'W' : 'B';
    });
  }

  const handleFastAnalysis = useCallback(async (): Promise<void> => {
    if (!capabilities.katago || window.uro == null || !analysisMode) return;

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
        createLocalConsoleMessage('uro', 'error', error instanceof Error ? error.message : t('analysis.startFailed'))
      );
    }
  }, [
    analysisCache,
    analysisSettings.moveDisplay,
    appendKataGoConsoleMessage,
    analysisPaths,
    capabilities.katago,
    document,
    analysisMode,
    refreshKataGoSettings,
    requestAnalysis,
    requestHiddenPassAnalysis,
    t,
  ]);

  useEffect(() => {
    if (!analysisMode || analysisPaths.length === 0) return;
    void handleFastAnalysis();
  }, [analysisPaths.length, analysisMode, handleFastAnalysis]);

  const handleAnalysisModeToggle = useCallback((): void => {
    const next = !analysisMode;
    analysisModeRef.current = next;
    setAnalysisMode(next);
    if (!next) {
      clearPendingAnalysisQueries('fast');
      clearPendingAnalysisQueries('live');
      if (window.uro != null) void window.uro.katago.stopAnalysis();
    }
  }, [analysisMode]);

  function clearPendingAnalysisQueries(mode: AnalysisQueryContext['mode']): void {
    for (const [id, context] of analysisQueryContextRef.current.entries()) {
      if (context.mode === mode) analysisQueryContextRef.current.delete(id);
    }
  }

  const canNavigatePrevious = path.length > 0;
  const canNavigateNext = getNodeAtPath(document, path).children.length > 0;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (isTextInputActive()) return;
      const steps = event.ctrlKey ? Infinity : event.shiftKey ? 10 : 1;
      const key = event.key.toLowerCase();
      if (event.key === 'ArrowLeft' || key === 'a') {
        event.preventDefault();
        navigateBranch(-1, steps);
      } else if (event.key === 'ArrowRight' || key === 'd' || key === 'z') {
        event.preventDefault();
        navigateBranch(1, steps);
      } else if (event.key === 'ArrowUp' || key === 'w' || key === 'x') {
        event.preventDefault();
        navigatePrevious(steps);
      } else if (event.key === 'ArrowDown' || key === 's') {
        event.preventDefault();
        navigateNext(steps);
      } else if (key === 'c') {
        event.preventDefault();
        navigateFirstChild(steps);
      } else if (capabilities.katago && event.key === ' ') {
        event.preventDefault();
        handleAnalysisModeToggle();
      }
    }

    window.document.body.addEventListener('keydown', handleKeyDown);
    return () => window.document.body.removeEventListener('keydown', handleKeyDown);
  }, [
    capabilities.katago,
    handleAnalysisModeToggle,
    navigateBranch,
    navigateFirstChild,
    navigateNext,
    navigatePrevious,
  ]);

  const handleAnalysisSettingsSave = useCallback((settings: AnalysisSettings) => {
    setAnalysisSettings(settings);
  }, []);

  function handleBoardClick(point: string, colorOverride?: SgfColor): void {
    if (replaceMode) {
      const result = replaceMove(document, path, point);
      replaceDocument(result.document, result.path, {invalidatePath: result.path});
      return;
    }

    if (tool === 'auto') {
      if (position.stones.has(point)) return;
      const color = nextAutoColor;
      const existingChildPath = findChildMovePath(document, path, color, point);
      if (existingChildPath != null) {
        selectPath(existingChildPath);
        return;
      }

      const result = addMove(document, path, color, point);
      replaceDocument(result.document, result.path);
      return;
    }

    if (tool === 'black' || tool === 'white' || colorOverride != null) {
      const color = colorOverride ?? (tool === 'black' ? 'B' : 'W');
      if (path.length === 0 && getNodeAtPath(document, path).children.length === 0) {
        if (position.stones.has(point) && !isCurrentSetupStone(document, path, point)) return;

        const result = addSetupStoneToPath(document, path, color, point);
        replaceDocument(result.document, result.path, {invalidatePath: result.path, pendingSetupPath: result.path});
        if (result.placed) setAutoColorOverride(oppositeColor(color));
        return;
      }

      if (position.stones.has(point)) return;
      const existingChildPath = findChildMovePath(document, path, color, point);
      if (existingChildPath != null) {
        selectPath(existingChildPath);
        return;
      }

      const result = addMove(document, path, color, point);
      replaceDocument(result.document, result.path);
      return;
    }

    if (tool === 'erase') {
      replaceDocument(erasePoint(document, path, point), path, {invalidatePath: path});
      return;
    }

    if (tool === 'number' || tool === 'alphabet') {
      const value = window.prompt(
        t(tool === 'number' ? 'prompt.number' : 'prompt.alphabet'),
        tool === 'number' ? '1' : 'A'
      );
      if (value == null || value.trim() === '') return;
      replaceDocument(addLabel(document, path, point, value.trim()), path);
      return;
    }

    const markup = toolToMarkup(tool);
    if (markup != null) replaceDocument(addMarkup(document, path, markup, point), path);
  }

  function handleBoardRightClick(point: string): void {
    if (tool !== 'black' && tool !== 'white') return;
    handleBoardClick(point, tool === 'black' ? 'W' : 'B');
  }

  function handlePass(): void {
    if (replaceMode) {
      const result = replaceMove(document, path, '');
      replaceDocument(result.document, result.path, {invalidatePath: result.path});
      return;
    }

    const result = addMove(document, path, nextAutoColor, '');
    replaceDocument(result.document, result.path);
  }

  function handleMoveBranchToMain(): void {
    const result = moveBranchToMain(document, path);
    replaceDocument(result.document, result.path);
  }

  function handleMoveBranchLeft(): void {
    const result = moveBranch(document, path, -1);
    replaceDocument(result.document, result.path);
  }

  function handleMoveBranchRight(): void {
    const result = moveBranch(document, path, 1);
    replaceDocument(result.document, result.path);
  }

  function handleDeleteNode(): void {
    const result = deleteNode(document, path);
    replaceDocument(result.document, result.path);
  }

  return (
    <ConfigProvider
      locale={antdLocale}
      componentSize="small"
      theme={{
        algorithm: [theme.defaultAlgorithm, theme.compactAlgorithm],
        token: {
          borderRadius: 6,
          fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        },
      }}
    >
      <Layout className="app-shell">
        <Header className="app-header">
          <div className="menu-row">
            <div className="app-title">{t('app.title')}</div>
            <Space wrap>
              <Dropdown.Button
                size="small"
                icon={<FileAddOutlined />}
                menu={{
                  items: newMenuItems,
                  onClick: (info) => handleNew(Number(info.key) as BoardSize),
                }}
                onClick={() => handleNew(19)}
              >
                {t('menu.new')}
              </Dropdown.Button>
              {capabilities.storage === 'indexeddb' ? (
                <>
                  <Button size="small" icon={<FolderOpenOutlined />} onClick={openSavedGameDialog}>
                    {t('menu.open')}
                  </Button>
                  <Button size="small" icon={<SaveOutlined />} onClick={() => void handleSaveBrowserGame()}>
                    {t('menu.save')}
                  </Button>
                </>
              ) : null}
              <Button size="small" icon={<FolderOpenOutlined />} onClick={() => void handleImportSgfFromMenu()}>
                {t('menu.importSgf')}
              </Button>
              <Button size="small" icon={<DownloadOutlined />} onClick={() => void handleExportSgf()}>
                {t('menu.exportSgf')}
              </Button>
              <Button size="small" icon={<InfoCircleOutlined />} onClick={() => setGameInfoOpen(true)}>
                {t('menu.editGameInfo')}
              </Button>
              {capabilities.katago ? (
                <>
                  <Button size="small" icon={<SettingOutlined />} onClick={() => setKataGoSettingsOpen(true)}>
                    {t('katago.button')}
                  </Button>
                  <Button size="small" icon={<LineChartOutlined />} onClick={() => setAnalysisSettingsOpen(true)}>
                    {t('analysis.button')}
                  </Button>
                </>
              ) : null}
              <Space className="view-toggles">
                <span>{t('menu.coordinates')}</span>
                <Switch size="small" checked={showCoordinates} onChange={setShowCoordinates} />
                {!capabilities.katago ? (
                  <>
                    <span>{t('menu.numbers')}</span>
                    <Select
                      size="small"
                      value={moveNumberLimit}
                      popupMatchSelectWidth={false}
                      onChange={setMoveNumberLimit}
                      options={[
                        {value: 0, label: t('moveNumbers.none')},
                        {value: 1, label: '1'},
                        {value: 5, label: '5'},
                        {value: 20, label: '20'},
                        {value: 'all', label: t('moveNumbers.all')},
                      ]}
                    />
                  </>
                ) : null}
              </Space>
              <Select
                size="small"
                aria-label={t('menu.language')}
                value={currentLanguage}
                suffixIcon={<TranslationOutlined />}
                popupMatchSelectWidth={false}
                onChange={(value) => void i18n.changeLanguage(value)}
                options={languageOptions}
              />
            </Space>
          </div>
          <EditorToolbar
            tool={tool}
            nextColor={nextAutoColor}
            canNavigatePrevious={canNavigatePrevious}
            canNavigateNext={canNavigateNext}
            onToolChange={handleToolChange}
            onAutoToolClick={handleAutoToolClick}
            onPass={handlePass}
            onFirst={navigateToFirst}
            onPrevious10={() => navigatePrevious(10)}
            onPrevious={() => navigatePrevious()}
            onNext={() => navigateNext()}
            onNext10={() => navigateNext(10)}
            onLast={navigateToLast}
            extraEnd={
              capabilities.katago ? (
                <Space className="analysis-toolbar-options">
                  <Checkbox
                    checked={analysisSettings.showNextMove}
                    onChange={(event) => updateAnalysisSettings({showNextMove: event.target.checked})}
                  >
                    {t('analysis.nextMove')}
                  </Checkbox>
                  <Checkbox
                    checked={analysisSettings.showTopMoves}
                    onChange={(event) => updateAnalysisSettings({showTopMoves: event.target.checked})}
                  >
                    {t('analysis.topMoves')}
                  </Checkbox>
                  <Segmented
                    size="small"
                    value={stoneOverlayDisplay}
                    onChange={(value) =>
                      updateAnalysisSettings({topMoveDisplay: value as AnalysisSettings['topMoveDisplay']})
                    }
                    options={[
                      {value: 'dot', label: t('analysis.dot')},
                      {value: 'number', label: t('analysis.number')},
                      {value: 'none', label: t('analysis.none')},
                    ]}
                  />
                  <Select
                    size="small"
                    value={analysisSettings.maxMoves}
                    popupMatchSelectWidth={false}
                    onChange={(value) => updateAnalysisSettings({maxMoves: value as AnalysisSettings['maxMoves']})}
                    options={[
                      {value: 1, label: '1'},
                      {value: 5, label: '5'},
                      {value: 20, label: '20'},
                      {value: 'all', label: t('moveNumbers.all')},
                    ]}
                  />
                  <Checkbox
                    checked={analysisSettings.showExpectedTerritory}
                    onChange={(event) => updateAnalysisSettings({showExpectedTerritory: event.target.checked})}
                  >
                    {t('analysis.expectedTerritory')}
                  </Checkbox>
                </Space>
              ) : null
            }
          />
        </Header>
        <Content className={`app-content ${capabilities.katago ? 'with-katago-console' : ''}`}>
          {capabilities.katago ? (
            <aside className="katago-console-panel">
              <div className="katago-console-header">
                <h2>{t('panels.katagoConsole')}</h2>
                <Button size="small" onClick={() => setKataGoConsoleMessages([])}>
                  {t('action.clear')}
                </Button>
              </div>
              <div className="katago-console-log" ref={kataGoConsoleRef}>
                {kataGoConsoleMessages.length === 0 ? (
                  <div className="katago-console-empty">{t('katago.consoleEmpty')}</div>
                ) : (
                  kataGoConsoleMessages.map((item) => (
                    <div key={item.id} className={`katago-console-line ${item.level}`}>
                      <div className="katago-console-meta">
                        <span className="katago-console-time">{formatConsoleTime(item.time)}</span>
                        <span className={`katago-console-source ${item.source}`}>{item.source}</span>
                      </div>
                      <div className="katago-console-text">{item.text}</div>
                    </div>
                  ))
                )}
              </div>
            </aside>
          ) : null}
          <main
            className="board-region"
            onWheel={(event) => {
              if (event.deltaY > 0) navigateNext();
              if (event.deltaY < 0) navigatePrevious();
            }}
          >
            <GoBoard
              document={document}
              path={path}
              showCoordinates={showCoordinates}
              moveNumberLimit={boardMoveNumberLimit}
              analysis={currentAnalysis}
              stoneScoreDeltas={stoneScoreDeltas}
              analysisSettings={analysisSettings}
              onVertexClick={handleBoardClick}
              onVertexRightClick={handleBoardRightClick}
            />
            <Tooltip title={t('analysis.button')}>
              <Button
                className={[
                  'analysis-button',
                  analysisMode ? 'glow-button' : '',
                  waitingForFastAnalysis ? 'glow-fast' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                icon={<ThunderboltOutlined />}
                type={analysisMode ? 'primary' : 'default'}
                onClick={handleAnalysisModeToggle}
              >
                {analysisMode ? <span>{fastAnalysisPendingCount}</span> : null}
              </Button>
            </Tooltip>
          </main>
          <aside className="right-region">
            <section className="capture-summary">
              <span className="capture-player">
                <span className="capture-name">{blackPlayerName}</span>
                <span className="capture-loss">−</span>
                <span className="capture-count capture-count-black">{position.captures.W}</span>
              </span>
              <span className="capture-player">
                <span className="capture-name">{whitePlayerName}</span>
                <span className="capture-loss">−</span>
                <span className="capture-count capture-count-white">{position.captures.B}</span>
              </span>
            </section>
            <CommentsPanel
              value={getComment(document, path)}
              onChange={handleCommentChange}
              showAnalysisControls={capabilities.katago}
              chartData={analysisChartData}
              selectedMoveNumber={selectedChartMoveNumber}
              chartSummary={analysisChartSummary}
              onPreviousMove={() => navigatePrevious()}
              onNextMove={() => navigateNext()}
              onSelectChartMove={(moveNumber) => {
                const nextPath = analysisChartPaths[moveNumber];
                if (nextPath == null) return;
                selectPath(nextPath);
              }}
            />
            <SgfTreePanel
              document={document}
              selectedPath={path}
              replaceActive={replaceMode}
              onSelectPath={(nextPath) => {
                selectPath(nextPath);
              }}
              onMoveToMain={handleMoveBranchToMain}
              onMoveLeft={handleMoveBranchLeft}
              onMoveRight={handleMoveBranchRight}
              onReplace={() => setReplaceMode(true)}
              onDelete={handleDeleteNode}
            />
          </aside>
        </Content>
      </Layout>
      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept=".sgf,.gib,application/x-go-sgf,text/plain"
        onChange={(event) => void handleImportSgf(event.target.files?.[0])}
      />
      {capabilities.storage === 'indexeddb' ? (
        <OpenGameModal
          open={openGameModalOpen}
          games={storedGames}
          selectedId={selectedStoredGameId}
          loading={storedGamesLoading}
          onSelect={(id) => setSelectedStoredGameId(id === '' ? null : id)}
          onOpen={() => void handleOpenSavedGame()}
          onDelete={() => void handleDeleteSavedGame()}
          onCancel={() => setOpenGameModalOpen(false)}
        />
      ) : null}
      {capabilities.katago ? (
        <>
          <KataGoSettingsModal
            open={kataGoSettingsOpen}
            onCancel={() => {
              setKataGoSettingsOpen(false);
              void refreshKataGoSettings();
            }}
          />
          <AnalysisSettingsModal
            open={analysisSettingsOpen}
            onCancel={() => setAnalysisSettingsOpen(false)}
            onSave={handleAnalysisSettingsSave}
          />
        </>
      ) : null}
      <GameInfoModal
        open={gameInfoOpen}
        values={gameInfo}
        onCancel={() => setGameInfoOpen(false)}
        onSave={(values) => {
          replaceDocument(updateGameInfo(document, values), path, {clearAnalysisCache: true});
          setGameInfoOpen(false);
        }}
      />
    </ConfigProvider>
  );
}
