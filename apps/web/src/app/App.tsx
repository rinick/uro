import {
  DownloadOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {Button, Checkbox, ConfigProvider, Dropdown, Layout, Modal, Segmented, Space, message, theme} from 'antd';
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
} from '@ulugo/sgf-core';
import {boardSizes, type BoardSize} from '@ulugo/ui-shared';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {deriveBoardPosition} from '@ulugo/go-core';
import type {AnalysisSettings} from '@ulugo/analysis-core';
import {GoogleAd} from '../features/ads/GoogleAd';
import {GoBoard} from '../features/board/GoBoard';
import {CommentsPanel, type CommentsPanelHandle} from '../features/comments/CommentsPanel';
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
import {KeyboardShortcutsModal} from '../features/shortcuts/KeyboardShortcutsModal';
import {
  readKeyboardShortcuts,
  shortcutActionForEvent,
  shortcutActions,
  shortcutLabel,
  writeKeyboardShortcuts,
  type KeyboardShortcutConfig,
  type ShortcutActionId,
} from '../features/shortcuts/keyboardShortcuts';
import {EditorToolbar} from '../features/toolbar/EditorToolbar';
import type {EditorTool} from '../features/toolbar/types';
import {getAppCapabilities} from './capabilities';
import {
  addSetupStoneToPath,
  findChildMovePath,
  getAnalysisQueuePaths,
  getCurrentBranchMovePaths,
  isCurrentSetupStone,
  isTextInputActive,
  nextFirstChildPath,
  nextRememberedPath,
  normalizeSelectedPath,
  oppositeColor,
  parseGameRecord,
  pathKey,
  readGameRecordFile,
  safeFileName,
  toolToMarkup,
  withImportedGameName,
} from './appSgfUtils';
import {type AppLanguage, antdLocales, formatConsoleTime, normalizeLanguage, saveLanguage} from './appUiUtils';
import {getAppFontFamily} from './fonts';
import {useKataGoAnalysis} from './useKataGoAnalysis';

const {Header, Content} = Layout;
const showCoordinatesStorageKey = 'ulugo.showCoordinates';
const showMarkupStorageKey = 'ulugo.showMarkup';

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
  const [labelText, setLabelText] = useState('A');
  const [autoColorOverride, setAutoColorOverride] = useState<'B' | 'W' | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [showCoordinates, setShowCoordinates] = useState(() => readStoredBoolean(showCoordinatesStorageKey, true));
  const [showMarkup, setShowMarkup] = useState(() =>
    readStoredBoolean(showMarkupStorageKey, capabilities.platform === 'web')
  );
  const [gameInfoOpen, setGameInfoOpen] = useState(false);
  const [openGameModalOpen, setOpenGameModalOpen] = useState(false);
  const [storedGameId, setStoredGameId] = useState<string | null>(null);
  const [storedGames, setStoredGames] = useState<StoredGameSummary[]>([]);
  const [selectedStoredGameId, setSelectedStoredGameId] = useState<string | null>(null);
  const [storedGamesLoading, setStoredGamesLoading] = useState(false);
  const [kataGoSettingsOpen, setKataGoSettingsOpen] = useState(false);
  const [analysisSettingsOpen, setAnalysisSettingsOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [keyboardShortcuts, setKeyboardShortcuts] = useState(() => readKeyboardShortcuts());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentsPanelRef = useRef<CommentsPanelHandle>(null);
  const branchMemoryRef = useRef(new Map<string, number>());
  const pendingSetupPathRef = useRef<number[] | null>(null);
  const gameInfo = useMemo(() => getGameInfo(document), [document]);
  const boardSize = useMemo(() => getBoardSize(document), [document]);
  const position = useMemo(() => deriveBoardPosition(document, path), [document, path]);
  const treeLayout = useMemo(() => layoutTree(buildTree(document)[0], boardSize), [boardSize, document]);
  const nextAutoColor = autoColorOverride ?? position.nextColor;
  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);
  const antdLocale = antdLocales[currentLanguage];
  const appFontFamily = useMemo(() => getAppFontFamily(currentLanguage), [currentLanguage]);
  const analysisChartPaths = useMemo(
    () => getCurrentBranchMovePaths(document, path, branchMemoryRef.current),
    [document, path]
  );
  const analysisPaths = useMemo(
    () => getAnalysisQueuePaths(document, analysisChartPaths),
    [analysisChartPaths, document]
  );
  const shortcutLabels = useMemo(
    () =>
      Object.fromEntries(
        shortcutActions.map((action) => [action.id, shortcutLabel(keyboardShortcuts[action.id])])
      ) as Partial<Record<ShortcutActionId, string>>,
    [keyboardShortcuts]
  );

  useEffect(() => {
    globalThis.document.documentElement.lang = currentLanguage;
    globalThis.document.documentElement.style.setProperty('--ulugo-font-family', appFontFamily);
  }, [appFontFamily, currentLanguage]);

  useEffect(() => {
    writeStoredBoolean(showCoordinatesStorageKey, showCoordinates);
  }, [showCoordinates]);

  useEffect(() => {
    writeStoredBoolean(showMarkupStorageKey, showMarkup);
  }, [showMarkup]);

  useEffect(() => {
    if (!showMarkup && isMarkupTool(tool)) setTool('auto');
  }, [showMarkup, tool]);

  const {
    analysisSettings,
    updateAnalysisSettings,
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
  } = useKataGoAnalysis({
    enabled: capabilities.katago,
    document,
    path,
    analysisPaths,
    analysisChartPaths,
    pendingSetupPathRef,
    startFailedMessage: t('analysis.startFailed'),
  });
  const stoneOverlayDisplay =
    !capabilities.katago && analysisSettings.topMoveDisplay === 'dot' ? 'number' : analysisSettings.topMoveDisplay;
  const boardMoveNumberLimit = stoneOverlayDisplay === 'number' ? analysisSettings.maxMoves : 0;
  const appTitle = capabilities.platform === 'electron' ? t('app.electronTitle') : t('app.title');
  const blackPlayerName = gameInfo.PB.trim() === '' ? t('app.black') : gameInfo.PB;
  const whitePlayerName = gameInfo.PW.trim() === '' ? t('app.white') : gameInfo.PW;

  const newMenuItems: MenuProps['items'] = boardSizes.map((size) => ({
    key: String(size),
    label: t(`menu.new${size}`),
  }));
  const storageMenuItems: MenuProps['items'] = [
    {key: 'save', icon: <SaveOutlined />, label: t('menu.save')},
    {key: 'load', icon: <FolderOpenOutlined />, label: t('menu.load')},
  ];

  useEffect(() => {
    if (capabilities.katago || analysisSettings.topMoveDisplay !== 'dot') return;
    updateAnalysisSettings({topMoveDisplay: 'number', maxMoves: 'all'});
  }, [analysisSettings.topMoveDisplay, capabilities.katago, updateAnalysisSettings]);

  function rememberPath(nextPath: number[]): void {
    for (let index = 0; index < nextPath.length; index += 1) {
      const parent = nextPath.slice(0, index);
      branchMemoryRef.current.set(pathKey(parent), nextPath[index]);
    }
  }

  function replaceDocument(next: SgfDocument, nextPath: number[] = [], options: ReplaceDocumentOptions = {}): void {
    const normalizedPath = normalizeSelectedPath(next, nextPath);
    resetAnalysisForDocumentChange(next, options);
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

  function handleNew(size: BoardSize = 19): void {
    branchMemoryRef.current.clear();
    setStoredGameId(null);
    setAnalysisModeActive(false);
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
      setAnalysisModeActive(capabilities.katago && analysisSettings.autoAnalyze);
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
    if (capabilities.storage === 'filesystem' && window.ulugo != null) {
      try {
        await window.ulugo.exportSgf({content, suggestedName: `${safeFileName(gameInfo.GN || 'game')}.sgf`});
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
    if (capabilities.storage === 'filesystem' && window.ulugo != null) {
      try {
        const result = await window.ulugo.importSgf();
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
    setAnalysisModeActive(capabilities.katago && analysisSettings.autoAnalyze);
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
    if (!showMarkup && isMarkupTool(nextTool)) return;
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

  const canNavigatePrevious = path.length > 0;
  const canNavigateNext = getNodeAtPath(document, path).children.length > 0;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const shortcutAction = shortcutActionForEvent(event, keyboardShortcuts);
      if (shortcutAction == null) return;

      const action = shortcutActions.find((item) => item.id === shortcutAction);
      if (action?.electronOnly === true && !capabilities.katago) return;
      if (isTextInputActive() && (action?.navigation === true || !(event.ctrlKey || event.metaKey || event.altKey)))
        return;

      const steps = event.ctrlKey || event.metaKey ? Infinity : event.shiftKey ? 10 : 1;
      event.preventDefault();

      switch (shortcutAction) {
        case 'open':
          void handleImportSgfFromMenu();
          break;
        case 'save':
          void handleExportSgf();
          break;
        case 'gameInfo':
          setGameInfoOpen(true);
          break;
        case 'previousMove':
          navigatePrevious(steps);
          break;
        case 'nextMoveMain':
          navigateFirstChild(steps);
          break;
        case 'nextMoveCurrent':
          navigateNext(steps);
          break;
        case 'previousBranch':
          navigateBranch(-1, steps);
          break;
        case 'nextBranch':
          navigateBranch(1, steps);
          break;
        case 'pass':
          handlePass();
          break;
        case 'toolAuto':
          handleToolChange('auto');
          break;
        case 'toolBlack':
          handleToolChange('black');
          break;
        case 'toolWhite':
          handleToolChange('white');
          break;
        case 'addLabel':
          handleToolChange('alphabet');
          break;
        case 'addCircle':
          handleToolChange('circle');
          break;
        case 'addSquare':
          handleToolChange('square');
          break;
        case 'addTriangle':
          handleToolChange('triangle');
          break;
        case 'addCross':
          handleToolChange('cross');
          break;
        case 'eraseMarkup':
          handleToolChange('erase');
          break;
        case 'toggleShowCoordinates':
          setShowCoordinates((current) => !current);
          break;
        case 'toggleShowNextMove':
          updateAnalysisSettings({showNextMove: !analysisSettings.showNextMove});
          break;
        case 'toggleShowTopMoves':
          updateAnalysisSettings({showTopMoves: !analysisSettings.showTopMoves});
          break;
        case 'toggleDisplayDot':
          updateAnalysisSettings({topMoveDisplay: analysisSettings.topMoveDisplay === 'dot' ? 'none' : 'dot'});
          break;
        case 'toggleDisplayNumber':
          updateAnalysisSettings({topMoveDisplay: analysisSettings.topMoveDisplay === 'number' ? 'none' : 'number'});
          break;
        case 'toggleTerritory':
          updateAnalysisSettings({showExpectedTerritory: !analysisSettings.showExpectedTerritory});
          break;
        case 'toggleScore':
          commentsPanelRef.current?.toggleScore();
          break;
        case 'togglePointLoss':
          commentsPanelRef.current?.togglePointLoss();
          break;
        case 'toggleWinrate':
          commentsPanelRef.current?.toggleWinrate();
          break;
        case 'toggleComments':
          commentsPanelRef.current?.toggleComments();
          break;
        case 'toggleAnalysisMode':
          toggleAnalysisMode();
          break;
      }
    }

    window.document.body.addEventListener('keydown', handleKeyDown);
    return () => window.document.body.removeEventListener('keydown', handleKeyDown);
  }, [
    analysisSettings.showExpectedTerritory,
    analysisSettings.showNextMove,
    analysisSettings.showTopMoves,
    analysisSettings.topMoveDisplay,
    capabilities.katago,
    keyboardShortcuts,
    navigateBranch,
    navigateFirstChild,
    navigateNext,
    navigatePrevious,
    toggleAnalysisMode,
    updateAnalysisSettings,
  ]);

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

    if (!showMarkup && isMarkupTool(tool)) return;

    if (tool === 'alphabet') {
      const value = labelText.trim();
      if (value === '') return;
      replaceDocument(addLabel(document, path, point, value), path);
      setLabelText(nextLabelText(value));
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
    if (getNodeAtPath(document, path).children.length > 0) {
      Modal.confirm({
        title: t('treeActions.deleteConfirmTitle'),
        content: t('treeActions.deleteConfirmContent'),
        okText: t('action.ok'),
        cancelText: t('action.cancel'),
        okButtonProps: {danger: true},
        onOk: () => {
          const result = deleteNode(document, path);
          replaceDocument(result.document, result.path);
        },
      });
      return;
    }

    const result = deleteNode(document, path);
    replaceDocument(result.document, result.path);
  }

  function handleLanguageChange(language: AppLanguage): void {
    saveLanguage(language);
    void i18n.changeLanguage(language);
  }

  function handleKeyboardShortcutsApply(next: KeyboardShortcutConfig): void {
    writeKeyboardShortcuts(next);
    setKeyboardShortcuts(next);
    setKeyboardShortcutsOpen(false);
  }

  function openKeyboardShortcuts(): void {
    setAnalysisSettingsOpen(false);
    setKeyboardShortcutsOpen(true);
  }

  return (
    <ConfigProvider
      locale={antdLocale}
      componentSize="small"
      theme={{
        algorithm: [theme.defaultAlgorithm, theme.compactAlgorithm],
        components: {
          Button: {
            defaultHoverBorderColor: '#dc8916',
            defaultHoverColor: '#dc8916',
          },
        },
        token: {
          colorPrimary: '#f4b458',
          borderRadius: 6,
          fontFamily: appFontFamily,
        },
      }}
    >
      <Layout className="app-shell">
        <Header className="app-header">
          <div className="menu-row">
            <div className="app-title">{appTitle}</div>
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
              <Button size="small" icon={<FolderOpenOutlined />} onClick={() => void handleImportSgfFromMenu()}>
                {t('menu.importSgf')}
              </Button>
              <Button size="small" icon={<DownloadOutlined />} onClick={() => void handleExportSgf()}>
                {t('menu.exportSgf')}
              </Button>
              {capabilities.storage === 'indexeddb' ? (
                <Dropdown.Button
                  size="small"
                  icon={<SaveOutlined />}
                  menu={{
                    items: storageMenuItems,
                    onClick: (info) => {
                      if (info.key === 'save') {
                        void handleSaveBrowserGame();
                      } else if (info.key === 'load') {
                        void openSavedGameDialog();
                      }
                    },
                  }}
                >
                  {t('menu.storage')}
                </Dropdown.Button>
              ) : null}
              <Button size="small" icon={<InfoCircleOutlined />} onClick={() => setGameInfoOpen(true)}>
                {t('menu.editGameInfo')}
              </Button>
              {capabilities.katago ? (
                <Button size="small" icon={<SettingOutlined />} onClick={() => setKataGoSettingsOpen(true)}>
                  {t('katago.button')}
                </Button>
              ) : null}
              <Button size="small" icon={<SettingOutlined />} onClick={() => setAnalysisSettingsOpen(true)}>
                {t('settings.title')}
              </Button>
            </Space>
          </div>
          <EditorToolbar
            tool={tool}
            nextColor={nextAutoColor}
            canNavigatePrevious={canNavigatePrevious}
            canNavigateNext={canNavigateNext}
            showMarkup={showMarkup}
            labelText={labelText}
            shortcutLabels={shortcutLabels}
            onToolChange={handleToolChange}
            onLabelTextChange={setLabelText}
            onAutoToolClick={handleAutoToolClick}
            onPass={handlePass}
            onFirst={navigateToFirst}
            onPrevious10={() => navigatePrevious(10)}
            onPrevious={() => navigatePrevious()}
            onNext={() => navigateNext()}
            onNext10={() => navigateNext(10)}
            onLast={navigateToLast}
            extraEnd={
              <Space className="analysis-toolbar-options">
                <Checkbox
                  checked={analysisSettings.showNextMove}
                  onChange={(event) => updateAnalysisSettings({showNextMove: event.target.checked})}
                >
                  {t('analysis.nextMove')}
                </Checkbox>
                {capabilities.katago ? (
                  <>
                    <Checkbox
                      checked={analysisSettings.showTopMoves}
                      onChange={(event) => updateAnalysisSettings({showTopMoves: event.target.checked})}
                    >
                      {t('analysis.topMoves')}
                    </Checkbox>
                  </>
                ) : null}
                <Segmented
                  size="small"
                  value={stoneOverlayDisplay}
                  onChange={(value) =>
                    updateAnalysisSettings({topMoveDisplay: value as AnalysisSettings['topMoveDisplay']})
                  }
                  options={
                    capabilities.katago
                      ? [
                          {value: 'dot', label: t('analysis.dot')},
                          {value: 'number', label: t('analysis.number')},
                          {value: 'none', label: t('analysis.none')},
                        ]
                      : [
                          {value: 'number', label: t('analysis.number')},
                          {value: 'none', label: t('analysis.none')},
                        ]
                  }
                />
                {capabilities.katago ? (
                  <Checkbox
                    checked={analysisSettings.showExpectedTerritory}
                    onChange={(event) => updateAnalysisSettings({showExpectedTerritory: event.target.checked})}
                  >
                    {t('analysis.expectedTerritory')}
                  </Checkbox>
                ) : null}
              </Space>
            }
          />
        </Header>
        <Content className="app-content">
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
          ) : capabilities.platform === 'web' ? (
            <aside className="katago-console-panel web-ad-panel">
              <GoogleAd />
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
              showMarkup={showMarkup}
              moveNumberLimit={boardMoveNumberLimit}
              analysis={currentAnalysis}
              stoneScoreDeltas={stoneScoreDeltas}
              analysisSettings={analysisSettings}
              onVertexClick={handleBoardClick}
              onVertexRightClick={handleBoardRightClick}
            />
            {capabilities.katago ? (
              <Button
                className={['analysis-button', analysisMode ? 'glow-button' : ''].filter(Boolean).join(' ')}
                icon={<ThunderboltOutlined />}
                type={analysisMode ? 'primary' : 'default'}
                title={t('analysis.button')}
                onClick={toggleAnalysisMode}
              >
                {analysisMode ? <span>{fastAnalysisPendingCount}</span> : ''}
              </Button>
            ) : null}
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
              ref={commentsPanelRef}
              value={getComment(document, path)}
              onChange={handleCommentChange}
              showAnalysisControls={capabilities.katago}
              analysisActive={analysisMode}
              chartData={analysisChartData}
              moveDisplay={analysisSettings.moveDisplay}
              selectedMoveNumber={capabilities.katago ? selectedChartMoveNumber : path.length}
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
              onPreviousMove={() => navigatePrevious()}
              onNextMove={() => navigateNext()}
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
        <KataGoSettingsModal
          open={kataGoSettingsOpen}
          onCancel={() => {
            setKataGoSettingsOpen(false);
            void refreshKataGoSettings();
          }}
        />
      ) : null}
      <AnalysisSettingsModal
        open={analysisSettingsOpen}
        settings={analysisSettings}
        language={currentLanguage}
        showCoordinates={showCoordinates}
        showMarkup={showMarkup}
        showKataGoSettings={capabilities.katago}
        onCancel={() => setAnalysisSettingsOpen(false)}
        onSettingsChange={updateAnalysisSettings}
        onLanguageChange={handleLanguageChange}
        onShowCoordinatesChange={setShowCoordinates}
        onShowMarkupChange={setShowMarkup}
        onKeyboardShortcutsClick={openKeyboardShortcuts}
      />
      <KeyboardShortcutsModal
        open={keyboardShortcutsOpen}
        shortcuts={keyboardShortcuts}
        showElectronShortcuts={capabilities.katago}
        onApply={handleKeyboardShortcutsApply}
        onCancel={() => setKeyboardShortcutsOpen(false)}
      />
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

function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    if (value == null) return fallback;
    return value === 'true';
  } catch {
    return fallback;
  }
}

function writeStoredBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures; the current session state is still updated.
  }
}

function isMarkupTool(tool: EditorTool): boolean {
  return tool === 'alphabet' || tool === 'circle' || tool === 'square' || tool === 'triangle' || tool === 'cross';
}

function nextLabelText(value: string): string {
  if (/^\d+$/.test(value)) return (BigInt(value) + 1n).toString();
  if (/^[a-z]+$/.test(value)) return nextLetters(value, 'a'.charCodeAt(0));
  if (/^[A-Z]+$/.test(value)) return nextLetters(value, 'A'.charCodeAt(0));
  return value;
}

function nextLetters(value: string, baseCode: number): string {
  const codes = [...value].map((char) => char.charCodeAt(0) - baseCode);

  for (let index = codes.length - 1; index >= 0; index -= 1) {
    if (codes[index] < 25) {
      codes[index] += 1;
      return codes.map((code) => String.fromCharCode(baseCode + code)).join('');
    }
    codes[index] = 0;
  }

  return String.fromCharCode(baseCode) + codes.map((code) => String.fromCharCode(baseCode + code)).join('');
}
