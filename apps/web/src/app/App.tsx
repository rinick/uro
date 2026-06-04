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
  message,
  theme,
} from 'antd';
import deDE from 'antd/locale/de_DE';
import enUS from 'antd/locale/en_US';
import frFR from 'antd/locale/fr_FR';
import jaJP from 'antd/locale/ja_JP';
import koKR from 'antd/locale/ko_KR';
import ruRU from 'antd/locale/ru_RU';
import zhCN from 'antd/locale/zh_CN';
import type {MenuProps} from 'antd';
import {
  addLabel,
  addMarkup,
  addMove,
  addSetupStone,
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
  parseSgf,
  serializeSgf,
  updateComment,
  updateGameInfo,
  type MarkupKind,
  type SgfDocument,
  type SgfNode,
} from '@uro/sgf-core';
import {boardSizes, type BoardSize} from '@uro/ui-shared';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {deriveBoardPosition} from '@uro/go-core';
import {
  defaultAnalysisSettings,
  type AnalysisSettings,
  type AnalysisChartPoint,
  type KataGoAnalysisResult,
  type KataGoMoveInfo,
} from '@uro/analysis-core';
import {sgfPointToGtp} from '@uro/sgf-analysis-tree';
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

const {Header, Content} = Layout;
const liveAnalysisVisits = 10_000_000;

const languageOptions = [
  {value: 'en', label: 'English'},
  {value: 'zh', label: '中文'},
  {value: 'ja', label: '日本語'},
  {value: 'ko', label: '한국어'},
  {value: 'fr', label: 'Français'},
  {value: 'de', label: 'Deutsch'},
  {value: 'ru', label: 'Русский'},
];

const antdLocales = {
  de: deDE,
  en: enUS,
  fr: frFR,
  ja: jaJP,
  ko: koKR,
  ru: ruRU,
  zh: zhCN,
} as const;

interface CachedAnalysis {
  result: KataGoAnalysisResult;
  visits: number;
  completed: boolean;
}

interface AnalysisQueryContext {
  nodeId: string;
  path: number[];
  version: number;
  mode: 'fast' | 'live';
}

interface ReplaceDocumentOptions {
  clearAnalysisCache?: boolean;
  invalidatePath?: number[];
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
  const [fastAnalysis, setFastAnalysis] = useState(false);
  const [liveAnalysis, setLiveAnalysis] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const branchMemoryRef = useRef(new Map<string, number>());
  const analysisQueryContextRef = useRef(new Map<string, AnalysisQueryContext>());
  const documentVersionRef = useRef(0);
  const fastAnalysisRef = useRef(false);
  const kataGoConsoleRef = useRef<HTMLDivElement>(null);
  const gameInfo = useMemo(() => getGameInfo(document), [document]);
  const boardSize = useMemo(() => getBoardSize(document), [document]);
  const position = useMemo(() => deriveBoardPosition(document, path), [document, path]);
  const treeLayout = useMemo(() => layoutTree(buildTree(document)[0], boardSize), [boardSize, document]);
  const nextAutoColor = autoColorOverride ?? position.nextColor;
  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);
  const antdLocale = antdLocales[currentLanguage];
  const stoneOverlayDisplay = analysisSettings.topMoveDisplay ?? (analysisSettings.showDots ? 'dot' : 'none');
  const boardMoveNumberLimit =
    capabilities.katago && stoneOverlayDisplay === 'number'
      ? analysisSettings.maxMoves
      : capabilities.katago
        ? 0
        : moveNumberLimit;
  const blackPlayerName = gameInfo.PB.trim() === '' ? t('app.black') : gameInfo.PB;
  const whitePlayerName = gameInfo.PW.trim() === '' ? t('app.white') : gameInfo.PW;
  const mainLinePaths = useMemo(() => getMainLinePaths(document), [document]);
  const movePaths = useMemo(() => getMovePaths(document), [document]);
  const analysisPaths = useMemo(() => [[], ...movePaths], [movePaths]);
  const currentAnalysis = useMemo(
    () => analysisCache[nodeKey(document, path)]?.result ?? null,
    [analysisCache, document, path]
  );
  const analysisTargetVisits = Math.max(1, kataGoSettings.fastVisits || defaultKataGoSettings.fastVisits);
  const analysisPendingCount = useMemo(
    () =>
      analysisPaths.filter((movePath) => {
        const cached = analysisCache[nodeKey(document, movePath)];
        return cached == null || cached.visits < analysisTargetVisits;
      }).length,
    [analysisCache, analysisPaths, analysisTargetVisits, document]
  );
  const analysisChartData = useMemo<AnalysisChartPoint[]>(
    () => buildAnalysisChartData(document, mainLinePaths, analysisCache),
    [analysisCache, document, mainLinePaths]
  );
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
    rememberPath(normalizedPath);
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
        if (existing != null && visits < existing.visits && result.isDuringSearch) return current;

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
    fastAnalysisRef.current = fastAnalysis;
  }, [fastAnalysis]);

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

  useEffect(() => {
    if (!capabilities.katago || window.uro == null) return;
    const uro = window.uro;

    if (!liveAnalysis) {
      if (!hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast')) void uro.katago.stopAnalysis();
      return;
    }

    const targetVisits = Math.max(1, kataGoSettings.maxVisits || defaultKataGoSettings.maxVisits);
    const liveNodeId = nodeKey(document, path);
    if (hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live', liveNodeId)) return;
    let cancelled = false;

    void (async () => {
      try {
        if (hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live')) {
          clearPendingAnalysisQueries('live');
          await uro.katago.stopAnalysis();
        }
        if (!cancelled) await requestAnalysis(path, 'live', targetVisits, true);
      } catch (error: unknown) {
        appendKataGoConsoleMessage(
          createLocalConsoleMessage('uro', 'error', error instanceof Error ? error.message : t('analysis.startFailed'))
        );
        setLiveAnalysis(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    appendKataGoConsoleMessage,
    capabilities.katago,
    document,
    kataGoSettings.maxVisits,
    liveAnalysis,
    path,
    requestAnalysis,
    t,
  ]);

  function handleNew(size: BoardSize = 19): void {
    branchMemoryRef.current.clear();
    setStoredGameId(null);
    fastAnalysisRef.current = false;
    setFastAnalysis(false);
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
      fastAnalysisRef.current = false;
      setFastAnalysis(false);
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
      const text = await file.text();
      importSgfText(text, file.name);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('menu.importFailed'));
    } finally {
      if (fileInputRef.current != null) fileInputRef.current.value = '';
    }
  }

  function importSgfText(text: string, fileName: string): void {
    const importedDocument = withImportedGameName(parseSgf(text), fileName);
    branchMemoryRef.current.clear();
    setStoredGameId(null);
    fastAnalysisRef.current = true;
    setFastAnalysis(true);
    replaceDocument(importedDocument, [], {clearAnalysisCache: true});
  }

  function handleCommentChange(value: string): void {
    replaceDocument(updateComment(document, path, value), path);
  }

  const navigateToFirst = useCallback(() => {
    setPath(normalizeSelectedPath(document, []));
    setAutoColorOverride(null);
    setReplaceMode(false);
  }, [document]);

  const navigatePrevious = useCallback(
    (steps = 1) => {
      setPath((current) => {
        rememberPath(current);
        return normalizeSelectedPath(document, current.slice(0, Math.max(0, current.length - steps)));
      });
      setAutoColorOverride(null);
      setReplaceMode(false);
    },
    [document]
  );

  const navigateNext = useCallback(
    (steps = 1) => {
      setPath((current) => {
        let next = current;
        for (let index = 0; index < steps; index += 1) {
          const node = getNodeAtPath(document, next);
          if (node.children.length === 0) break;
          const rememberedChild = branchMemoryRef.current.get(pathKey(next)) ?? 0;
          next = [...next, rememberedChild < node.children.length ? rememberedChild : 0];
        }
        rememberPath(next);
        return next;
      });
      setAutoColorOverride(null);
      setReplaceMode(false);
    },
    [document]
  );

  const navigateToLast = useCallback(() => {
    setPath((current) => {
      let next = current;
      while (true) {
        const node = getNodeAtPath(document, next);
        if (node.children.length === 0) return next;
        const rememberedChild = branchMemoryRef.current.get(pathKey(next)) ?? 0;
        next = [...next, rememberedChild < node.children.length ? rememberedChild : 0];
      }
    });
    setAutoColorOverride(null);
    setReplaceMode(false);
  }, [document]);

  const navigateBranch = useCallback(
    (direction: -1 | 1) => {
      const currentCell = treeLayout.cells.find((cell) => samePath(cell.path, path));
      if (currentCell == null) return;

      const rowCells = treeLayout.cells
        .filter((cell) => cell.row === currentCell.row)
        .sort((left, right) => left.column - right.column);
      const index = rowCells.findIndex((cell) => samePath(cell.path, path));
      const nextCell = rowCells[index + direction];
      if (nextCell == null) return;

      rememberPath(nextCell.path);
      setPath(nextCell.path);
      setAutoColorOverride(null);
      setReplaceMode(false);
    },
    [path, treeLayout]
  );

  function handleToolChange(nextTool: EditorTool): void {
    setReplaceMode(false);
    setTool(nextTool);
    if (nextTool !== 'auto') setAutoColorOverride(null);
  }

  function handleAutoToolClick(): void {
    setReplaceMode(false);
    if (tool !== 'auto') {
      setTool('auto');
      return;
    }

    setAutoColorOverride((current) => {
      const visibleColor = current ?? position.nextColor;
      return visibleColor === 'B' ? 'W' : 'B';
    });
  }

  const handleFastAnalysis = useCallback(async (): Promise<void> => {
    if (!capabilities.katago || window.uro == null || !fastAnalysis) return;

    try {
      const settings = await refreshKataGoSettings();
      const targetVisits = Math.max(1, settings.fastVisits || defaultKataGoSettings.fastVisits);
      const runVersion = documentVersionRef.current;
      const pathsToAnalyze = analysisPaths.filter((movePath) => {
        const nodeId = nodeKey(document, movePath);
        const cached = analysisCache[nodeId];
        return (
          (cached == null || cached.visits < targetVisits) &&
          !hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast', nodeId)
        );
      });

      for (const movePath of pathsToAnalyze) {
        if (!fastAnalysisRef.current || runVersion !== documentVersionRef.current) break;
        await requestAnalysis(movePath, 'fast', targetVisits);
      }
    } catch (error) {
      appendKataGoConsoleMessage(
        createLocalConsoleMessage('uro', 'error', error instanceof Error ? error.message : t('analysis.startFailed'))
      );
    }
  }, [
    analysisCache,
    appendKataGoConsoleMessage,
    analysisPaths,
    capabilities.katago,
    document,
    fastAnalysis,
    refreshKataGoSettings,
    requestAnalysis,
    t,
  ]);

  useEffect(() => {
    if (!fastAnalysis || analysisPaths.length === 0) return;
    void handleFastAnalysis();
  }, [analysisPaths.length, fastAnalysis, handleFastAnalysis]);

  function handleFastAnalysisToggle(): void {
    setFastAnalysis((current) => {
      const next = !current;
      fastAnalysisRef.current = next;
      if (!next) {
        clearPendingAnalysisQueries('fast');
        if (!liveAnalysis && window.uro != null) void window.uro.katago.stopAnalysis();
      }
      return next;
    });
  }

  function handleLiveAnalysisToggle(): void {
    setLiveAnalysis((current) => {
      const next = !current;
      if (!next) {
        clearPendingAnalysisQueries('live');
        if (window.uro != null) void window.uro.katago.stopAnalysis();
      }
      return next;
    });
  }

  function clearPendingAnalysisQueries(mode: AnalysisQueryContext['mode']): void {
    for (const [id, context] of analysisQueryContextRef.current.entries()) {
      if (context.mode === mode) analysisQueryContextRef.current.delete(id);
    }
  }

  const canNavigatePrevious = path.length > 1;
  const canNavigateNext = getNodeAtPath(document, path).children.length > 0;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (isTextInputActive()) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        navigatePrevious();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        navigateNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigateBranch(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigateBranch(1);
      } else if (capabilities.katago && event.key === ' ') {
        event.preventDefault();
        setLiveAnalysis((current) => !current);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [capabilities.katago, navigateBranch, navigateNext, navigatePrevious]);

  const handleAnalysisSettingsSave = useCallback((settings: AnalysisSettings) => {
    setAnalysisSettings(settings);
  }, []);

  function handleBoardClick(point: string): void {
    if (replaceMode) {
      const result = replaceMove(document, path, point);
      replaceDocument(result.document, result.path, {invalidatePath: result.path});
      return;
    }

    if (tool === 'auto') {
      const color = nextAutoColor;
      const result = addMove(document, path, color, point);
      replaceDocument(result.document, result.path);
      return;
    }

    if (tool === 'black' || tool === 'white') {
      const color = tool === 'black' ? 'B' : 'W';
      replaceDocument(addSetupStone(document, path, color, point), path, {invalidatePath: path});
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
          colorPrimary: '#276749',
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
                  <Button size="small" type={fastAnalysis ? 'primary' : 'default'} onClick={handleFastAnalysisToggle}>
                    {t('analysis.fast')}
                  </Button>
                  <span className="analysis-pending-count">
                    {t('analysis.pendingMoves', {count: analysisPendingCount})}
                  </span>
                  <Button
                    className="live-analysis-toggle"
                    size="small"
                    type={liveAnalysis ? 'primary' : 'default'}
                    icon={<ThunderboltOutlined />}
                    onClick={handleLiveAnalysisToggle}
                  >
                    {t('analysis.live')}
                  </Button>
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
              event.preventDefault();
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
            />
          </main>
          <aside className="right-region">
            <section className="capture-summary">
              <span className="capture-player">
                <span className="capture-name">{blackPlayerName}</span>
                <span className="capture-loss">-</span>
                <span className="capture-count capture-count-black">{position.captures.W}</span>
              </span>
              <span className="capture-player">
                <span className="capture-name">{whitePlayerName}</span>
                <span className="capture-loss">-</span>
                <span className="capture-count capture-count-white">{position.captures.B}</span>
              </span>
            </section>
            <CommentsPanel
              value={getComment(document, path)}
              onChange={handleCommentChange}
              showAnalysisControls={capabilities.katago}
              chartData={analysisChartData}
            />
            <SgfTreePanel
              document={document}
              selectedPath={path}
              replaceActive={replaceMode}
              onSelectPath={(nextPath) => {
                const normalizedPath = normalizeSelectedPath(document, nextPath);
                rememberPath(normalizedPath);
                setPath(normalizedPath);
                setAutoColorOverride(null);
                setReplaceMode(false);
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
        accept=".sgf,application/x-go-sgf,text/plain"
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

function pathKey(path: number[]): string {
  return path.join('.');
}

function getMainLinePaths(document: SgfDocument): number[][] {
  const paths: number[][] = [];
  let node = document.root;
  let path: number[] = [];

  while (node.children[0] != null) {
    path = [...path, 0];
    paths.push(path);
    node = node.children[0];
  }

  return paths;
}

function getMovePaths(document: SgfDocument): number[][] {
  const paths: number[][] = [];

  function walk(node: SgfNode, path: number[]): void {
    if (node.data.B != null || node.data.W != null) paths.push(path);
    node.children.forEach((child, index) => walk(child, [...path, index]));
  }

  walk(document.root, []);
  return paths;
}

function nodeKey(document: SgfDocument, path: number[]): string {
  return getNodeAtPath(document, path).id;
}

function collectNodeIds(node: SgfNode): string[] {
  return [node.id, ...node.children.flatMap(collectNodeIds)];
}

function hasPendingAnalysisQuery(
  contexts: Map<string, AnalysisQueryContext>,
  mode: AnalysisQueryContext['mode'],
  nodeId?: string
): boolean {
  for (const context of contexts.values()) {
    if (context.mode !== mode) continue;
    if (nodeId == null || context.nodeId === nodeId) return true;
  }
  return false;
}

function getAnalysisVisits(result: KataGoAnalysisResult): number {
  return Math.max(result.rootInfo?.visits ?? 0, ...(result.moveInfos ?? []).map((move) => move.visits ?? 0));
}

function updateAnalysisCache({
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

function buildAnalysisChartData(
  document: SgfDocument,
  paths: number[][],
  cache: Record<string, CachedAnalysis>
): AnalysisChartPoint[] {
  const data: AnalysisChartPoint[] = [];

  paths.forEach((path, index) => {
    const rootInfo = cache[nodeKey(document, path)]?.result.rootInfo;
    if (rootInfo?.scoreLead != null) data.push({moveNumber: index + 1, series: 'score', value: rootInfo.scoreLead});
    if (rootInfo?.winrate != null)
      data.push({moveNumber: index + 1, series: 'winrate', value: normalizeWinratePercent(rootInfo.winrate)});
  });

  return data;
}

function buildStoneScoreDeltas(
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

function getLinePaths(path: number[]): number[][] {
  return [[], ...path.map((_, index) => path.slice(0, index + 1))];
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

function normalizeWinratePercent(value: number): number {
  return value > 1 ? value : value * 100;
}

function normalizeSelectedPath(document: SgfDocument, path: number[]): number[] {
  if (document.root.children.length === 0) return [];

  const normalized: number[] = [];
  let node = document.root;
  for (const index of path) {
    if (node.children.length === 0) break;
    const nextIndex = Math.min(Math.max(index, 0), node.children.length - 1);
    normalized.push(nextIndex);
    node = node.children[nextIndex];
  }

  return normalized.length === 0 ? [0] : normalized;
}

function withImportedGameName(document: SgfDocument, fileName: string): SgfDocument {
  const info = getGameInfo(document);
  if (info.GN.trim() !== '') return document;

  return updateGameInfo(document, {...info, GN: gameNameFromSgfFile(fileName)});
}

function gameNameFromSgfFile(fileName: string): string {
  const name = fileName.replace(/\.sgf$/i, '').trim();
  return name === '' ? 'Imported game' : name;
}

function safeFileName(value: string): string {
  const name = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  return name === '' ? 'game' : name;
}

function createLocalConsoleMessage(
  source: 'uro' | 'katago',
  level: 'info' | 'warning' | 'error',
  text: string
): KataGoConsoleMessage {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    time: new Date().toISOString(),
    source,
    level,
    text,
  };
}

function formatConsoleTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'});
}

function normalizeLanguage(language: string): keyof typeof antdLocales {
  const baseLanguage = language.split('-')[0];
  return baseLanguage in antdLocales ? (baseLanguage as keyof typeof antdLocales) : 'en';
}

function isTextInputActive(): boolean {
  const element = window.document.activeElement;
  if (element == null) return false;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )
    return true;
  return element instanceof HTMLElement && element.isContentEditable;
}

function toolToMarkup(tool: EditorTool): MarkupKind | null {
  switch (tool) {
    case 'circle':
      return 'CR';
    case 'square':
      return 'SQ';
    case 'triangle':
      return 'TR';
    case 'cross':
      return 'MA';
    case 'selected':
      return 'SL';
    default:
      return null;
  }
}
