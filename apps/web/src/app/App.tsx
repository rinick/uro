import {
  DownloadOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  SaveOutlined,
  TranslationOutlined,
} from '@ant-design/icons';
import {Button, ConfigProvider, Dropdown, Layout, Select, Space, Switch, message, theme} from 'antd';
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
  erasePoint,
  getComment,
  getBoardSize,
  getGameInfo,
  getNodeAtPath,
  buildTree,
  samePath,
  parseSgf,
  serializeSgf,
  updateComment,
  updateGameInfo,
  type MarkupKind,
  type SgfDocument,
} from '@uro/sgf-core';
import {boardSizes, type BoardSize} from '@uro/ui-shared';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {deriveBoardPosition} from '@uro/go-core';
import {GoBoard} from '../features/board/GoBoard';
import {CommentsPanel} from '../features/comments/CommentsPanel';
import {GameInfoModal} from '../features/game-info/GameInfoModal';
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

const {Header, Content} = Layout;

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

export function App() {
  const {t, i18n} = useTranslation();
  const [document, setDocument] = useState<SgfDocument>(() => createNewGame());
  const [path, setPath] = useState<number[]>([]);
  const [tool, setTool] = useState<EditorTool>('auto');
  const [autoColorOverride, setAutoColorOverride] = useState<'B' | 'W' | null>(null);
  const [showCoordinates, setShowCoordinates] = useState(true);
  const [showMoveNumbers, setShowMoveNumbers] = useState(true);
  const [gameInfoOpen, setGameInfoOpen] = useState(false);
  const [openGameModalOpen, setOpenGameModalOpen] = useState(false);
  const [storedGameId, setStoredGameId] = useState<string | null>(null);
  const [storedGames, setStoredGames] = useState<StoredGameSummary[]>([]);
  const [selectedStoredGameId, setSelectedStoredGameId] = useState<string | null>(null);
  const [storedGamesLoading, setStoredGamesLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const branchMemoryRef = useRef(new Map<string, number>());
  const gameInfo = useMemo(() => getGameInfo(document), [document]);
  const boardSize = useMemo(() => getBoardSize(document), [document]);
  const position = useMemo(() => deriveBoardPosition(document, path), [document, path]);
  const treeLayout = useMemo(() => layoutTree(buildTree(document)[0], boardSize), [boardSize, document]);
  const nextAutoColor = autoColorOverride ?? position.nextColor;
  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);
  const antdLocale = antdLocales[currentLanguage];
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

  function replaceDocument(next: SgfDocument, nextPath: number[] = []): void {
    setDocument(next);
    setPath(nextPath);
    setAutoColorOverride(null);
    rememberPath(nextPath);
  }

  function handleNew(size: BoardSize = 19): void {
    branchMemoryRef.current.clear();
    setStoredGameId(null);
    replaceDocument(createNewGame(size));
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
      replaceDocument(nextDocument);
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

  function handleExportSgf(): void {
    const blob = new Blob([serializeSgf(document)], {type: 'application/x-go-sgf;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = 'game.sgf';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportSgf(file: File | undefined): Promise<void> {
    if (file == null) return;

    try {
      const text = await file.text();
      const importedDocument = withImportedGameName(parseSgf(text), file);
      branchMemoryRef.current.clear();
      setStoredGameId(null);
      replaceDocument(importedDocument);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to open SGF.');
    } finally {
      if (fileInputRef.current != null) fileInputRef.current.value = '';
    }
  }

  function handleCommentChange(value: string): void {
    replaceDocument(updateComment(document, path, value), path);
  }

  const navigateToFirst = useCallback(() => {
    setPath([]);
    setAutoColorOverride(null);
  }, []);

  const navigatePrevious = useCallback((steps = 1) => {
    setPath((current) => {
      rememberPath(current);
      return current.slice(0, Math.max(0, current.length - steps));
    });
    setAutoColorOverride(null);
  }, []);

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
    },
    [path, treeLayout]
  );

  function handleToolChange(nextTool: EditorTool): void {
    setTool(nextTool);
    if (nextTool !== 'auto') setAutoColorOverride(null);
  }

  function handleAutoToolClick(): void {
    if (tool !== 'auto') {
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
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateBranch, navigateNext, navigatePrevious]);

  function handleBoardClick(point: string): void {
    if (tool === 'auto') {
      const color = nextAutoColor;
      const result = addMove(document, path, color, point);
      replaceDocument(result.document, result.path);
      return;
    }

    if (tool === 'black' || tool === 'white') {
      const color = tool === 'black' ? 'B' : 'W';
      replaceDocument(addSetupStone(document, path, color, point), path);
      return;
    }

    if (tool === 'erase') {
      replaceDocument(erasePoint(document, path, point), path);
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
    const result = addMove(document, path, nextAutoColor, '');
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
              <Button size="small" icon={<FolderOpenOutlined />} onClick={openSavedGameDialog}>
                {t('menu.open')}
              </Button>
              <Button size="small" icon={<SaveOutlined />} onClick={() => void handleSaveBrowserGame()}>
                {t('menu.save')}
              </Button>
              <Button size="small" icon={<FolderOpenOutlined />} onClick={() => fileInputRef.current?.click()}>
                {t('menu.importSgf')}
              </Button>
              <Button size="small" icon={<DownloadOutlined />} onClick={handleExportSgf}>
                {t('menu.exportSgf')}
              </Button>
              <Button size="small" icon={<InfoCircleOutlined />} onClick={() => setGameInfoOpen(true)}>
                {t('menu.editGameInfo')}
              </Button>
              <Space className="view-toggles">
                <span>{t('menu.coordinates')}</span>
                <Switch size="small" checked={showCoordinates} onChange={setShowCoordinates} />
                <span>{t('menu.numbers')}</span>
                <Switch size="small" checked={showMoveNumbers} onChange={setShowMoveNumbers} />
              </Space>
              <Select
                size="small"
                aria-label={t('menu.language')}
                value={currentLanguage}
                suffixIcon={<TranslationOutlined />}
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
          />
        </Header>
        <Content className="app-content">
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
              showMoveNumbers={showMoveNumbers}
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
            <CommentsPanel value={getComment(document, path)} onChange={handleCommentChange} />
            <SgfTreePanel
              document={document}
              selectedPath={path}
              onSelectPath={(nextPath) => {
                rememberPath(nextPath);
                setPath(nextPath);
                setAutoColorOverride(null);
              }}
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
      <GameInfoModal
        open={gameInfoOpen}
        values={gameInfo}
        onCancel={() => setGameInfoOpen(false)}
        onSave={(values) => {
          replaceDocument(updateGameInfo(document, values), path);
          setGameInfoOpen(false);
        }}
      />
    </ConfigProvider>
  );
}

function pathKey(path: number[]): string {
  return path.join('.');
}

function withImportedGameName(document: SgfDocument, file: File): SgfDocument {
  const info = getGameInfo(document);
  if (info.GN.trim() !== '') return document;

  return updateGameInfo(document, {...info, GN: gameNameFromSgfFile(file)});
}

function gameNameFromSgfFile(file: File): string {
  const name = file.name.replace(/\.sgf$/i, '').trim();
  return name === '' ? 'Imported game' : name;
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
