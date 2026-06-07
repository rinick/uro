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
import type {AnalysisSettings} from '@uro/analysis-core';
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
  addSetupStoneToPath,
  findChildMovePath,
  getCurrentBranchMovePaths,
  getMovePaths,
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
import {antdLocales, formatConsoleTime, languageOptions, normalizeLanguage} from './appUiUtils';
import {useKataGoAnalysis} from './useKataGoAnalysis';

const {Header, Content} = Layout;

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const branchMemoryRef = useRef(new Map<string, number>());
  const pendingSetupPathRef = useRef<number[] | null>(null);
  const gameInfo = useMemo(() => getGameInfo(document), [document]);
  const boardSize = useMemo(() => getBoardSize(document), [document]);
  const position = useMemo(() => deriveBoardPosition(document, path), [document, path]);
  const treeLayout = useMemo(() => layoutTree(buildTree(document)[0], boardSize), [boardSize, document]);
  const nextAutoColor = autoColorOverride ?? position.nextColor;
  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);
  const antdLocale = antdLocales[currentLanguage];
  const analysisChartPaths = useMemo(
    () => getCurrentBranchMovePaths(document, path, branchMemoryRef.current),
    [document, path]
  );
  const movePaths = useMemo(() => getMovePaths(document), [document]);
  const analysisPaths = useMemo(() => [[], ...movePaths], [movePaths]);
  const {
    analysisSettings,
    updateAnalysisSettings,
    onAnalysisSettingsSave,
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
  } = useKataGoAnalysis({
    enabled: capabilities.katago,
    document,
    path,
    analysisPaths,
    analysisChartPaths,
    pendingSetupPathRef,
    startFailedMessage: t('analysis.startFailed'),
  });
  const stoneOverlayDisplay = analysisSettings.topMoveDisplay;
  const boardMoveNumberLimit =
    capabilities.katago && stoneOverlayDisplay === 'number'
      ? analysisSettings.maxMoves
      : capabilities.katago
        ? 0
        : moveNumberLimit;
  const blackPlayerName = gameInfo.PB.trim() === '' ? t('app.black') : gameInfo.PB;
  const whitePlayerName = gameInfo.PW.trim() === '' ? t('app.white') : gameInfo.PW;

  const newMenuItems: MenuProps['items'] = boardSizes.map((size) => ({
    key: String(size),
    label: t(`menu.new${size}`),
  }));

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
      setAnalysisModeActive(true);
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
    setAnalysisModeActive(true);
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
        toggleAnalysisMode();
      }
    }

    window.document.body.addEventListener('keydown', handleKeyDown);
    return () => window.document.body.removeEventListener('keydown', handleKeyDown);
  }, [capabilities.katago, navigateBranch, navigateFirstChild, navigateNext, navigatePrevious, toggleAnalysisMode]);

  const handleAnalysisSettingsSave = useCallback(
    (settings: AnalysisSettings) => {
      onAnalysisSettingsSave(settings);
    },
    [onAnalysisSettingsSave]
  );

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
            {capabilities.katago ? (
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
                  onClick={toggleAnalysisMode}
                >
                  {analysisMode ? <span>{fastAnalysisPendingCount}</span> : ''}
                </Button>
              </Tooltip>
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
              value={getComment(document, path)}
              onChange={handleCommentChange}
              showAnalysisControls={capabilities.katago}
              analysisActive={analysisMode}
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
