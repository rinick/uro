import {app, BrowserWindow, Menu, dialog, ipcMain, shell, type WebContents} from 'electron';
import extract from 'extract-zip';
import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import http from 'node:http';
import path from 'node:path';

interface KataGoSettings {
  executablePath: string;
  modelPath: string;
  configPath: string;
  altCommand: string;
  maxVisits: number;
  fastVisits: number;
  wideRootNoise: number;
}

interface AnalysisSettings {
  moveDisplay: 'none' | 'score' | 'winrate' | 'absScore';
  topMoveDisplay: 'dot' | 'number' | 'none';
  maxMoves: 1 | 5 | 20 | 'all';
  minVisits: number;
  showNextMove: boolean;
  showTopMoves: boolean;
  showExpectedTerritory: boolean;
  boardBackground: 'auto' | 'golden' | 'natural' | 'flat';
  autoAnalyze: boolean;
}

const defaultKataGoSettings: KataGoSettings = {
  executablePath: '',
  modelPath: '',
  configPath: '',
  altCommand: '',
  maxVisits: 800,
  fastVisits: 100,
  wideRootNoise: 0.04,
};

const defaultAnalysisSettings: AnalysisSettings = {
  moveDisplay: 'score',
  topMoveDisplay: 'dot',
  maxMoves: 5,
  minVisits: 50,
  showNextMove: true,
  showTopMoves: true,
  showExpectedTerritory: false,
  boardBackground: 'auto',
  autoAnalyze: true,
};

const googleDriveScope = 'https://www.googleapis.com/auth/drive.file';
const googleProjectNumber = '218591242507';
const webGoogleClientId = '218591242507-ri5lbt729mok7n0tkbst69lhcb3kpele.apps.googleusercontent.com';
const googleDriveBridgePorts = [5274, 5375, 5476, 5072];
const sgfMimeType = 'application/x-go-sgf';

interface DownloadOption {
  id: string;
  label: string;
  url: string;
  installedPath?: string;
}

interface GoogleDriveBridgeSgf {
  content: string;
  fileName: string;
  fileId?: string | null;
}

interface GoogleDriveBridgeFile {
  content: string;
  fileId: string;
  fileName: string;
}

interface GoogleDriveBridgeSaveResult {
  fileId: string;
  fileName: string;
}

interface KataGoAnalysisQuery {
  id: string;
  boardXSize: number;
  boardYSize: number;
  komi: number;
  rules?: string;
  initialStones: Array<[string, string]>;
  moves: Array<[string, string]>;
  analyzeTurns?: number[];
  maxVisits?: number;
  priority?: number;
  includePolicy: boolean;
  includeOwnership: boolean;
  reportDuringSearchEvery?: number;
  overrideSettings?: {
    wideRootNoise?: number;
  };
}

let katagoProcess: ChildProcessWithoutNullStreams | null = null;
let katagoOutputBuffer = '';
let katagoSender: WebContents | null = null;
let consoleMessageCounter = 0;
let activeGoogleDriveBridgeCancel: (() => void) | null = null;
const activeKataGoQueryIds = new Set<string>();

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

const modelDownloadOptions: DownloadOption[] = [
  {
    id: 'recommended-18b',
    label: 'Recommended 18b model',
    url: 'https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz',
  },
  {
    id: 'old-15b',
    label: 'Old 15 block model',
    url: 'https://github.com/lightvector/KataGo/releases/download/v1.3.2/g170e-b15c192-s1672170752-d466197061.txt.gz',
  },
  {
    id: 'old-20b',
    label: 'Old 20 block model',
    url: 'https://github.com/lightvector/KataGo/releases/download/v1.4.5/g170e-b20c256x2-s5303129600-d1228401921.bin.gz',
  },
  {
    id: 'old-30b',
    label: 'Old 30 block model',
    url: 'https://github.com/lightvector/KataGo/releases/download/v1.4.5/g170-b30c320x2-s4824661760-d1229536699.bin.gz',
  },
  {
    id: 'fat-40b',
    label: 'Fat 40 block model',
    url: 'https://d3dndmfyhecmj0.cloudfront.net/g170/neuralnets/g170e-b40c384x2-s2348692992-d1229892979.zip',
  },
];

const katagoDownloadOptionsByPlatform: Record<string, DownloadOption[]> = {
  win32: [
    {
      id: 'opencl-win',
      label: 'OpenCL v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-opencl-windows-x64.zip',
    },
    {
      id: 'eigen-avx2-win',
      label: 'Eigen AVX2 (Modern CPUs) v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigenavx2-windows-x64.zip',
    },
    {
      id: 'eigen-win',
      label: 'Eigen (CPU, Non-optimized) v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigen-windows-x64.zip',
    },
  ],
  linux: [
    {
      id: 'opencl-linux',
      label: 'OpenCL v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-opencl-linux-x64.zip',
    },
    {
      id: 'eigen-avx2-linux',
      label: 'Eigen AVX2 (Modern CPUs) v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigenavx2-linux-x64.zip',
    },
    {
      id: 'eigen-linux',
      label: 'Eigen (CPU, Non-optimized) v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigen-linux-x64.zip',
    },
  ],
};

async function createWindow(): Promise<void> {
  app.setName('Ulugo AI review');
  Menu.setApplicationMenu(null);

  const window = new BrowserWindow({
    title: 'Ulugo AI review',
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f4f7f5',
    icon: path.join(__dirname, '../../web/src/assets/icon-512.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  window.setMenuBarVisibility(false);
  window.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
      window.webContents.toggleDevTools();
    }
  });

  if (process.env.ULUGO_WEB_URL != null && process.env.ULUGO_WEB_URL !== '') {
    await window.loadURL(process.env.ULUGO_WEB_URL);
    return;
  }

  await window.loadFile(path.join(__dirname, '../../web/dist/index.html'));
}

app.whenReady().then(async () => {
  registerIpc();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpc(): void {
  ipcMain.handle('ulugo:import-sgf', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{name: 'Game records', extensions: ['sgf', 'gib']}],
    });
    if (result.canceled || result.filePaths[0] == null) return null;

    const filePath = result.filePaths[0];
    const buffer = await fs.readFile(filePath);
    return {
      content: decodeGameRecordBuffer(buffer, filePath.toLowerCase().endsWith('.gib')),
      fileName: path.basename(filePath),
      filePath,
    };
  });

  ipcMain.handle(
    'ulugo:export-sgf',
    async (_event, request: {content: string; suggestedName: string; filePath?: string}) => {
      const filePath =
        request.filePath ??
        (
          await dialog.showSaveDialog({
            defaultPath: request.suggestedName,
            filters: [{name: 'SGF files', extensions: ['sgf']}],
          })
        ).filePath;
      if (filePath == null) return {canceled: true};

      await fs.writeFile(filePath, request.content, 'utf8');
      return {canceled: false, filePath, fileName: path.basename(filePath)};
    }
  );

  ipcMain.handle(
    'ulugo:select-file',
    async (_event, options?: {title?: string; filters?: Array<{name: string; extensions: string[]}>}) => {
      const result = await dialog.showOpenDialog({
        title: options?.title,
        properties: ['openFile'],
        filters: options?.filters,
      });
      if (result.canceled || result.filePaths[0] == null) return null;
      return result.filePaths[0];
    }
  );

  ipcMain.handle('ulugo:google-drive:open-sgf', () => openGoogleDriveSgf());
  ipcMain.handle(
    'ulugo:google-drive:save-sgf',
    (_event, request: {content: string; fileName: string; fileId?: string | null}) =>
      saveGoogleDriveSgf(request.content, request.fileName, request.fileId)
  );
  ipcMain.handle('ulugo:google-drive:cancel', () => cancelGoogleDriveBridge());

  ipcMain.handle('ulugo:katago:get-settings', async () => {
    const settings = await readJson('katago-settings.json', defaultKataGoSettings);
    const normalized = await normalizeKataGoSettings(settings);
    await writeJson('katago-settings.json', normalized);
    return normalized;
  });
  ipcMain.handle('ulugo:katago:save-settings', async (_event, settings: KataGoSettings) =>
    writeJson('katago-settings.json', await normalizeKataGoSettings({...defaultKataGoSettings, ...settings}))
  );
  ipcMain.handle('ulugo:katago:get-download-options', async () => ({
    katago: await withInstalledPaths('katago', katagoDownloadOptionsByPlatform[process.platform] ?? []),
    models: await withInstalledPaths('model', modelDownloadOptions),
  }));
  ipcMain.handle('ulugo:katago:download', async (event, request: {kind: 'katago' | 'model'; optionId: string}) => {
    const options =
      request.kind === 'katago' ? (katagoDownloadOptionsByPlatform[process.platform] ?? []) : modelDownloadOptions;
    const option = options.find((item) => item.id === request.optionId);
    if (option == null) throw new Error(`Unknown download option: ${request.optionId}`);

    sendKataGoConsole(event.sender, 'ulugo', 'info', `Downloading ${option.label}.`);
    const result = await downloadKataGoAsset(option, request.kind, (progress) => {
      event.sender.send('ulugo:katago:download-progress', progress);
    });
    const settings = await readJson('katago-settings.json', defaultKataGoSettings);
    const nextSettings = await normalizeKataGoSettings(
      request.kind === 'katago' ? {...settings, executablePath: result.path} : {...settings, modelPath: result.path},
      path.dirname(result.path)
    );
    await saveInstalledAsset(request.kind, option.id, result.path);
    await writeJson('katago-settings.json', nextSettings);
    sendKataGoConsole(event.sender, 'ulugo', 'info', `${option.label} installed at ${result.path}.`);
    return {...result, settings: nextSettings};
  });
  ipcMain.handle('ulugo:katago:analyze', async (event, query: KataGoAnalysisQuery) => {
    const normalizedQuery = normalizeAnalysisQuery(query);
    try {
      const settings = await normalizeKataGoSettings(await readJson('katago-settings.json', defaultKataGoSettings));
      await ensureKataGoEngine(settings, event.sender);
      await writeKataGoQuery(withKataGoOverrideSettings(normalizedQuery, settings));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to write KataGo analysis query.';
      sendKataGoConsole(event.sender, 'katago', 'error', message);
      event.sender.send('ulugo:katago:analysis', {id: normalizedQuery.id, error: message, isDuringSearch: false});
      event.sender.send('ulugo:katago:analysis-error', message);
    }
  });
  ipcMain.handle('ulugo:katago:stop-analysis', async (_event, queryIds?: unknown) => {
    await stopKataGoAnalysis(
      Array.isArray(queryIds) ? queryIds.filter((queryId): queryId is string => typeof queryId === 'string') : undefined
    );
  });
  ipcMain.handle('ulugo:analysis:get-settings', async () =>
    readJson('analysis-settings.json', defaultAnalysisSettings)
  );
  ipcMain.handle('ulugo:analysis:save-settings', async (_event, settings: AnalysisSettings) =>
    writeJson('analysis-settings.json', {...defaultAnalysisSettings, ...settings})
  );
}

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(settingsPath(name), 'utf8');
    return {...fallback, ...JSON.parse(raw)} as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(name: string, value: T): Promise<T> {
  await fs.mkdir(app.getPath('userData'), {recursive: true});
  await fs.writeFile(settingsPath(name), JSON.stringify(value, null, 2), 'utf8');
  return value;
}

function settingsPath(name: string): string {
  return path.join(app.getPath('userData'), name);
}

async function normalizeKataGoSettings(settings: KataGoSettings, searchDirectory?: string): Promise<KataGoSettings> {
  const executableDirectory = settings.executablePath === '' ? undefined : path.dirname(settings.executablePath);
  const configPath = await resolveKataGoConfig(settings.configPath, searchDirectory ?? executableDirectory);
  return {...defaultKataGoSettings, ...settings, configPath};
}

async function resolveKataGoConfig(configPath: string, searchDirectory?: string): Promise<string> {
  if (configPath !== '' && (await fileExists(configPath))) return configPath;

  if (searchDirectory != null && searchDirectory !== '' && (await fileExists(searchDirectory))) {
    const bundledConfig = await findFirstFile(searchDirectory, (file) => {
      const name = path.basename(file).toLowerCase();
      return name.endsWith('.cfg') && name.includes('analysis');
    });
    if (bundledConfig != null) return bundledConfig;
  }

  return ensureDefaultKataGoConfig();
}

async function ensureDefaultKataGoConfig(): Promise<string> {
  const configPath = path.join(app.getPath('userData'), 'katago', 'ulugo-analysis.cfg');
  if (await fileExists(configPath)) return configPath;

  await fs.mkdir(path.dirname(configPath), {recursive: true});
  await fs.writeFile(configPath, defaultKataGoConfigText(), 'utf8');
  sendKataGoConsole(katagoSender, 'ulugo', 'info', `Created KataGo analysis config at ${configPath}.`);
  return configPath;
}

function defaultKataGoConfigText(): string {
  return [
    '# Ulugo KataGo analysis config',
    '# Created automatically. You can edit this file for advanced KataGo tuning.',
    '',
    'reportAnalysisWinratesAs = BLACK',
    'conservativePass = true',
    'maxVisits = 500',
    'numAnalysisThreads = 2',
    'numSearchThreads = 8',
    'nnMaxBatchSize = 32',
    'nnCacheSizePowerOfTwo = 20',
    'nnMutexPoolSizePowerOfTwo = 16',
    'nnRandomize = true',
    '',
  ].join('\n');
}

function decodeGameRecordBuffer(buffer: Uint8Array, preferKorean: boolean): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!preferKorean || !utf8.includes('\uFFFD')) return utf8;

  try {
    return new TextDecoder('euc-kr').decode(buffer);
  } catch {
    return utf8;
  }
}

async function ensureKataGoEngine(settings: KataGoSettings, sender: WebContents): Promise<void> {
  katagoSender = sender;
  if (katagoProcess != null) return;

  if (settings.executablePath === '' || !(await fileExists(settings.executablePath))) {
    sendKataGoConsole(sender, 'ulugo', 'error', 'KataGo executable is not configured.');
    throw new Error('KataGo executable is not configured.');
  }
  if (settings.modelPath === '' || !(await fileExists(settings.modelPath))) {
    sendKataGoConsole(sender, 'ulugo', 'error', 'KataGo model is not configured.');
    throw new Error('KataGo model is not configured.');
  }
  if (settings.configPath === '' || !(await fileExists(settings.configPath))) {
    sendKataGoConsole(sender, 'ulugo', 'error', 'KataGo config is not configured.');
    throw new Error('KataGo config is not configured.');
  }

  const {command, args, options} = kataGoCommand(settings);
  katagoOutputBuffer = '';
  sendKataGoConsole(sender, 'ulugo', 'info', `Starting KataGo: ${command} ${args.join(' ')}`);
  katagoProcess = spawn(command, args, options);

  katagoProcess.stdout.on('data', (chunk: Buffer) => {
    katagoOutputBuffer += chunk.toString('utf8');
    const lines = katagoOutputBuffer.split(/\r?\n/);
    katagoOutputBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.trim() === '') continue;
      try {
        const payload = JSON.parse(line);
        if (typeof payload.error === 'string') {
          if (typeof payload.id === 'string') activeKataGoQueryIds.delete(payload.id);
          sendKataGoConsole(katagoSender, 'katago', 'error', payload.error);
          katagoSender?.send('ulugo:katago:analysis', payload);
          katagoSender?.send('ulugo:katago:analysis-error', payload.error);
        } else if (typeof payload.warning === 'string') {
          sendKataGoConsole(katagoSender, 'katago', 'warning', payload.warning);
        } else {
          if (typeof payload.id === 'string' && payload.isDuringSearch !== true) {
            activeKataGoQueryIds.delete(payload.id);
          }
          katagoSender?.send('ulugo:katago:analysis', payload);
        }
      } catch (error) {
        sendKataGoConsole(katagoSender, 'katago', 'warning', line);
        katagoSender?.send(
          'ulugo:katago:analysis-error',
          error instanceof Error ? error.message : 'Invalid KataGo output.'
        );
      }
    }
  });

  katagoProcess.stderr.on('data', (chunk: Buffer) => {
    const message = chunk.toString('utf8').trim();
    if (message !== '') {
      const level = /error|failed|fatal/i.test(message) ? 'error' : /warn/i.test(message) ? 'warning' : 'info';
      sendKataGoConsole(katagoSender, 'katago', level, message);
      if (level === 'error') katagoSender?.send('ulugo:katago:analysis-error', message);
    }
  });

  katagoProcess.stdin.on('error', (error) => {
    sendKataGoConsole(katagoSender, 'katago', 'error', error.message);
    katagoSender?.send('ulugo:katago:analysis-error', error.message);
  });

  katagoProcess.on('error', (error) => {
    sendKataGoConsole(katagoSender, 'katago', 'error', error.message);
    katagoSender?.send('ulugo:katago:analysis-error', error.message);
    katagoProcess = null;
    activeKataGoQueryIds.clear();
  });

  katagoProcess.on('exit', (code, signal) => {
    katagoProcess = null;
    activeKataGoQueryIds.clear();
    sendKataGoConsole(
      katagoSender,
      code === 0 || signal != null ? 'ulugo' : 'katago',
      code === 0 || signal != null ? 'info' : 'error',
      signal == null ? `KataGo exited with code ${code}.` : `KataGo stopped by signal ${signal}.`
    );
    if (code !== 0 && signal == null)
      katagoSender?.send('ulugo:katago:analysis-error', `KataGo exited with code ${code}.`);
  });
}

async function writeKataGoQuery(query: KataGoAnalysisQuery): Promise<void> {
  activeKataGoQueryIds.add(query.id);
  try {
    await writeKataGoMessage(query);
  } catch (error) {
    activeKataGoQueryIds.delete(query.id);
    throw error;
  }
}

async function writeKataGoMessage(message: unknown): Promise<void> {
  if (katagoProcess == null || katagoProcess.stdin.destroyed || !katagoProcess.stdin.writable) {
    throw new Error('KataGo is not running.');
  }

  await new Promise<void>((resolve, reject) => {
    katagoProcess?.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
      if (error != null) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function sendKataGoConsole(
  sender: WebContents | null,
  source: 'ulugo' | 'katago',
  level: 'info' | 'warning' | 'error',
  text: string
): void {
  if (sender == null || text.trim() === '') return;
  consoleMessageCounter += 1;
  sender.send('ulugo:katago:console', {
    id: `m${consoleMessageCounter}`,
    time: new Date().toISOString(),
    source,
    level,
    text,
  });
}

function kataGoCommand(settings: KataGoSettings): {
  command: string;
  args: string[];
  options?: {shell?: boolean};
} {
  if (settings.altCommand.trim() !== '') {
    return {command: settings.altCommand.trim(), args: [], options: {shell: true}};
  }

  return {
    command: settings.executablePath,
    args: [
      'analysis',
      '-model',
      settings.modelPath,
      '-config',
      settings.configPath,
      '-override-config',
      `homeDataDir=${app.getPath('userData')}`,
    ],
  };
}

function normalizeAnalysisQuery(query: KataGoAnalysisQuery): KataGoAnalysisQuery {
  return {
    ...query,
    komi: normalizeKomi(query.komi),
    rules: normalizeRules(query.rules),
  };
}

function withKataGoOverrideSettings(query: KataGoAnalysisQuery, settings: KataGoSettings): KataGoAnalysisQuery {
  return {
    ...query,
    overrideSettings: {
      wideRootNoise: settings.wideRootNoise,
      ...query.overrideSettings,
    },
  };
}

function normalizeKomi(value: unknown): number {
  if (value == null) return 6.5;
  if (typeof value === 'string' && value.trim() === '') return 6.5;

  const parsed = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
  if (!Number.isFinite(parsed)) return 6.5;
  if (parsed === 375) return 7.5;

  const clamped = Math.max(-150, Math.min(150, parsed));
  return Math.round(clamped * 2) / 2;
}

function normalizeRules(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return 'japanese';

  const key = value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  const aliases: Record<string, string> = {
    'aga': 'aga',
    'chinese': 'chinese',
    'japanese': 'japanese',
    'korean': 'korean',
    'new-zealand': 'new-zealand',
    'stone-scoring': 'stone-scoring',
    'tromp-taylor': 'tromp-taylor',
  };

  return aliases[key] ?? 'japanese';
}

async function stopKataGoAnalysis(queryIds?: string[]): Promise<void> {
  if (katagoProcess == null) return;
  const idsToTerminate = queryIds ?? [...activeKataGoQueryIds];
  if (idsToTerminate.length === 0) return;

  if (queryIds == null) {
    activeKataGoQueryIds.clear();
  } else {
    for (const queryId of queryIds) activeKataGoQueryIds.delete(queryId);
  }
  await Promise.all(
    idsToTerminate.map((queryId) =>
      writeKataGoMessage({
        id: `ulugo-terminate-${queryId}`,
        action: 'terminate',
        terminateId: queryId,
      }).catch(() => undefined)
    )
  );
}

async function withInstalledPaths(kind: 'katago' | 'model', options: DownloadOption[]): Promise<DownloadOption[]> {
  const installed = await readJson<Record<string, string>>('katago-installed-assets.json', {});

  return Promise.all(
    options.map(async (option) => {
      const installedPath = await resolveInstalledAsset(kind, option, installed[installedAssetKey(kind, option.id)]);
      return installedPath == null ? option : {...option, installedPath};
    })
  );
}

async function saveInstalledAsset(kind: 'katago' | 'model', optionId: string, filePath: string): Promise<void> {
  const installed = await readJson<Record<string, string>>('katago-installed-assets.json', {});
  installed[installedAssetKey(kind, optionId)] = filePath;
  await writeJson('katago-installed-assets.json', installed);
}

function installedAssetKey(kind: 'katago' | 'model', optionId: string): string {
  return `${kind}:${optionId}`;
}

async function resolveInstalledAsset(
  kind: 'katago' | 'model',
  option: DownloadOption,
  manifestPath: string | undefined
): Promise<string | null> {
  if (manifestPath != null && (await fileExists(manifestPath))) return manifestPath;

  const directory = path.join(app.getPath('userData'), kind === 'katago' ? 'katago' : 'models');
  if (!(await fileExists(directory))) return null;

  if (kind === 'model') {
    const fileName = path.basename(new URL(option.url).pathname);
    const directPath = path.join(directory, fileName);
    if (await fileExists(directPath)) return directPath;
  }

  const candidates = (await listFiles(directory)).filter((file) => isInstalledAssetCandidate(kind, file));
  return candidates.length === 1 ? candidates[0] : null;
}

function isInstalledAssetCandidate(kind: 'katago' | 'model', file: string): boolean {
  const name = path.basename(file).toLowerCase();
  if (kind === 'model') return name.endsWith('.bin.gz') || name.endsWith('.txt.gz');
  if (!name.startsWith('katago')) return false;
  if (name.endsWith('.dll') || name.endsWith('.txt') || name.endsWith('.cfg')) return false;
  return process.platform === 'win32' ? name.endsWith('.exe') : !name.includes('.');
}

async function downloadKataGoAsset(
  option: DownloadOption,
  kind: 'katago' | 'model',
  onProgress: (progress: {
    kind: 'katago' | 'model';
    optionId: string;
    status: 'starting' | 'downloading' | 'extracting' | 'complete' | 'error';
    percent: number;
    message: string;
    path?: string;
  }) => void
): Promise<{path: string}> {
  const directory = path.join(app.getPath('userData'), kind === 'katago' ? 'katago' : 'models');
  await fs.mkdir(directory, {recursive: true});

  const fileName = path.basename(new URL(option.url).pathname);
  const downloadPath = path.join(directory, fileName);
  const partialPath = `${downloadPath}.part`;

  try {
    onProgress({kind, optionId: option.id, status: 'starting', percent: 0, message: `Starting ${option.label}`});
    await downloadFile(option.url, partialPath, (percent) => {
      onProgress({
        kind,
        optionId: option.id,
        status: 'downloading',
        percent,
        message: `Downloading ${option.label}`,
      });
    });

    await fs.rename(partialPath, downloadPath);
    onProgress({kind, optionId: option.id, status: 'extracting', percent: 1, message: `Installing ${option.label}`});

    const installedPath = downloadPath.endsWith('.zip')
      ? await extractDownloadedAsset(downloadPath, directory, kind)
      : downloadPath;
    if (kind === 'katago') await makeExecutable(installedPath);

    onProgress({
      kind,
      optionId: option.id,
      status: 'complete',
      percent: 1,
      message: `${option.label} installed`,
      path: installedPath,
    });
    return {path: installedPath};
  } catch (error) {
    await fs.rm(partialPath, {force: true}).catch(() => undefined);
    const message = error instanceof Error ? error.message : `Failed to download ${option.label}`;
    onProgress({kind, optionId: option.id, status: 'error', percent: 0, message});
    throw error;
  }
}

async function downloadFile(url: string, destination: string, onProgress: (percent: number) => void): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || response.body == null)
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);

  const total = Number(response.headers.get('content-length') ?? 0);
  let received = 0;
  const file = await fs.open(destination, 'w');

  try {
    const reader = response.body.getReader();
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      received += result.value.byteLength;
      await file.write(Buffer.from(result.value));
      onProgress(total > 0 ? received / total : 0);
    }
  } finally {
    await file.close();
  }
}

async function openGoogleDriveSgf(): Promise<GoogleDriveBridgeFile | null> {
  return runGoogleDriveBridge('open');
}

async function saveGoogleDriveSgf(
  content: string,
  fileName: string,
  fileId?: string | null
): Promise<GoogleDriveBridgeSaveResult | null> {
  return runGoogleDriveBridge('save', {content, fileName, fileId});
}

function cancelGoogleDriveBridge(): void {
  activeGoogleDriveBridgeCancel?.();
}

function runGoogleDriveBridge(mode: 'open', sgf?: undefined): Promise<GoogleDriveBridgeFile | null>;
function runGoogleDriveBridge(mode: 'save', sgf: GoogleDriveBridgeSgf): Promise<GoogleDriveBridgeSaveResult | null>;
async function runGoogleDriveBridge(
  mode: 'open' | 'save',
  sgf?: GoogleDriveBridgeSgf
): Promise<GoogleDriveBridgeFile | GoogleDriveBridgeSaveResult | null> {
  if (activeGoogleDriveBridgeCancel != null) throw new Error('Google Drive operation already in progress.');

  const token = crypto.randomUUID();
  let finish: (result: GoogleDriveBridgeFile | GoogleDriveBridgeSaveResult | null) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const {server, port} = await createGoogleDriveBridgeServer((request, response) => {
    void handleGoogleDriveBridgeRequest({
      request,
      response,
      mode,
      token,
      sgf,
      finish,
      fail,
    }).catch((error) => {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      if (!response.headersSent) sendJson(response, 500, {error: normalizedError.message});
      fail(normalizedError);
    });
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let cancel: () => void = () => undefined;
    const cleanup = () => {
      if (activeGoogleDriveBridgeCancel === cancel) activeGoogleDriveBridgeCancel = null;
      server.close();
      server.closeAllConnections?.();
    };
    finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    cancel = () => finish(null);
    activeGoogleDriveBridgeCancel = cancel;

    shell.openExternal(`http://localhost:${port}/${mode}?token=${encodeURIComponent(token)}`).catch((error) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function createGoogleDriveBridgeServer(
  listener: (request: http.IncomingMessage, response: http.ServerResponse) => void
): Promise<{server: http.Server; port: number}> {
  return googleDriveBridgePorts
    .reduce<Promise<{server: http.Server; port: number} | null>>(
      (previous, port) =>
        previous.then(async (result) => {
          if (result != null) return result;
          try {
            return {server: await listenOnGoogleDriveBridgePort(port, listener), port};
          } catch {
            return null;
          }
        }),
      Promise.resolve(null)
    )
    .then((result) => {
      if (result == null) throw new Error('Could not start Google Drive bridge server.');
      return result;
    });
}

function listenOnGoogleDriveBridgePort(
  port: number,
  listener: (request: http.IncomingMessage, response: http.ServerResponse) => void
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(listener);
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

async function handleGoogleDriveBridgeRequest({
  request,
  response,
  mode,
  token,
  sgf,
  finish,
  fail,
}: {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  mode: 'open' | 'save';
  token: string;
  sgf?: GoogleDriveBridgeSgf;
  finish: (result: GoogleDriveBridgeFile | GoogleDriveBridgeSaveResult | null) => void;
  fail: (error: Error) => void;
}): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  if (requestUrl.pathname === '/redirect' && request.method === 'GET') {
    sendHtml(response, createGoogleDriveBridgePage(mode, token));
    return;
  }

  if (requestUrl.searchParams.get('token') !== token) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/open' && mode === 'open') {
    sendHtml(response, createGoogleDriveBridgePage('open', token));
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/save' && mode === 'save') {
    sendHtml(response, createGoogleDriveBridgePage('save', token));
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/sgf' && mode === 'save' && sgf != null) {
    sendJson(response, 200, sgf);
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/sgf') {
    const body = (await readJsonRequest(request)) as Partial<GoogleDriveBridgeFile & GoogleDriveBridgeSaveResult>;
    if (mode === 'open') {
      if (typeof body.content !== 'string' || typeof body.fileId !== 'string' || typeof body.fileName !== 'string') {
        sendJson(response, 400, {error: 'Invalid SGF payload.'});
        return;
      }
      sendJson(response, 200, {ok: true});
      finish({content: body.content, fileId: body.fileId, fileName: body.fileName});
      return;
    }
    if (typeof body.fileId !== 'string' || typeof body.fileName !== 'string') {
      sendJson(response, 400, {error: 'Invalid save result.'});
      return;
    }
    sendJson(response, 200, {ok: true});
    finish({fileId: body.fileId, fileName: body.fileName});
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/cancel') {
    sendJson(response, 200, {ok: true});
    finish(null);
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/error') {
    const body = (await readJsonRequest(request)) as {message?: unknown};
    sendJson(response, 200, {ok: true});
    fail(new Error(typeof body.message === 'string' ? body.message : 'Google Drive operation failed.'));
    return;
  }

  sendText(response, 404, 'Not found');
}

function readJsonRequest(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > 32 * 1024 * 1024) {
        reject(new Error('Google Drive payload is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('Invalid JSON request.'));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  response
    .writeHead(status, {'Connection': 'close', 'Content-Type': 'application/json; charset=utf-8'})
    .end(JSON.stringify(body));
}

function sendHtml(response: http.ServerResponse, body: string): void {
  response.writeHead(200, {'Connection': 'close', 'Content-Type': 'text/html; charset=utf-8'}).end(body);
}

function sendText(response: http.ServerResponse, status: number, body: string): void {
  response.writeHead(status, {'Connection': 'close', 'Content-Type': 'text/plain; charset=utf-8'}).end(body);
}

function createGoogleDriveBridgePage(mode: 'open' | 'save', token: string): string {
  const title = mode === 'open' ? 'Open from Google Drive' : 'Save to Google Drive';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #1f2933; }
  </style>
</head>
<body>
  Connecting to Google Drive...
  <script>
const MODE = ${JSON.stringify(mode)};
const BRIDGE_TOKEN = ${JSON.stringify(token)};
const GOOGLE_SCOPE = ${JSON.stringify(googleDriveScope)};
const GOOGLE_PROJECT_NUMBER = ${JSON.stringify(googleProjectNumber)};
const GOOGLE_CLIENT_ID = ${JSON.stringify(webGoogleClientId)};
const SGF_MIME_TYPE = ${JSON.stringify(sgfMimeType)};
const AUTHORIZED_KEY = 'ulugo.googleDriveAuthorized';
const TOKEN_KEY = 'ulugo.googleDriveBridgeToken';

run().catch(reportError);

async function run() {
  const token = await authorizeGoogleDrive();
  if (MODE === 'open') {
    await loadPicker();
    const file = await pickGoogleDriveFile(token);
    if (file == null) {
      await reportCancel();
      return;
    }
    setStatus('Opening from Google Drive...');
    const response = await driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media&supportsAllDrives=true', token);
    await writeSgf({ content: await response.text(), fileId: file.id, fileName: file.name });
    finish('File opened. Return to Ulugo. This tab will close shortly.');
    return;
  }

  setStatus('Saving to Google Drive...');
  const sgf = await readSgf();
  const result = sgf.fileId == null || sgf.fileId === ''
    ? await createGoogleDriveFile(token, sgf.content, sgf.fileName)
    : await updateGoogleDriveFile(token, sgf.fileId, sgf.content, sgf.fileName);
  await writeSgf(result);
  finish('File saved. Return to Ulugo. This tab will close shortly.');
}

async function authorizeGoogleDrive() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const hashError = hash.get('error');
  if (hashError != null) throw new Error(hashError);
  const hashToken = hash.get('access_token');
  if (hashToken != null) {
    if (hash.get('state') !== BRIDGE_TOKEN) throw new Error('Google sign-in returned invalid state.');
    const expiresIn = Number(hash.get('expires_in') || '3600');
    saveToken(hashToken, expiresIn);
    localStorage.setItem(AUTHORIZED_KEY, 'true');
    history.replaceState(null, document.title, '/' + MODE + '?token=' + encodeURIComponent(BRIDGE_TOKEN));
    return hashToken;
  }

  const cached = readToken();
  if (cached != null) return cached;

  const redirectUri = location.origin + '/redirect';
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', GOOGLE_SCOPE);
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('state', BRIDGE_TOKEN);
  const prompt = localStorage.getItem(AUTHORIZED_KEY) === 'true' ? '' : 'consent';
  if (prompt !== '') authUrl.searchParams.set('prompt', prompt);
  location.assign(authUrl.toString());
  return new Promise(function() {});
}

function saveToken(token, expiresIn) {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
    accessToken: token,
    expiresAt: Date.now() + expiresIn * 1000
  }));
}

function readToken() {
  try {
    const data = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    if (data != null && data.accessToken != null && data.expiresAt > Date.now() + 60000) return data.accessToken;
  } catch {}
  return null;
}

function loadPicker() {
  if (window.google != null && window.google.picker != null) return Promise.resolve();
  return loadScript('ulugo-google-api', 'https://apis.google.com/js/api.js').then(function() {
    return new Promise(function(resolve, reject) {
      if (window.gapi == null) {
        reject(new Error('Google API loader is unavailable.'));
        return;
      }
      window.gapi.load('picker', resolve);
    });
  });
}

function loadScript(id, src) {
  const existing = document.getElementById(id);
  if (existing != null) {
    return new Promise(function(resolve, reject) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', function() { reject(new Error('Failed to load ' + src)); }, { once: true });
    });
  }
  return new Promise(function(resolve, reject) {
    const script = document.createElement('script');
    script.id = id;
    script.async = true;
    script.defer = true;
    script.src = src;
    script.onload = resolve;
    script.onerror = function() { reject(new Error('Failed to load ' + src)); };
    document.head.appendChild(script);
  });
}

function pickGoogleDriveFile(token) {
  const google = window.google;
  if (google == null || google.picker == null) throw new Error('Google Picker is unavailable.');
  return new Promise(function(resolve) {
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    const builder = new google.picker.PickerBuilder()
      .setAppId(GOOGLE_PROJECT_NUMBER)
      .setOAuthToken(token)
      .addView(view)
      .setCallback(function(data) {
        if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
          return;
        }
        if (data.action !== google.picker.Action.PICKED) return;
        const document = data.docs && data.docs[0];
        if (document == null || document.id == null) {
          resolve(null);
          return;
        }
        resolve({ id: document.id, name: document.name || 'game.sgf' });
      });
    if (google.picker.Feature.SUPPORT_DRIVES != null) builder.enableFeature(google.picker.Feature.SUPPORT_DRIVES);
    builder.build().setVisible(true);
  });
}

async function createGoogleDriveFile(token, content, fileName) {
  const boundary = 'ulugo_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const body = [
    '--' + boundary,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: fileName, mimeType: SGF_MIME_TYPE }),
    '--' + boundary,
    'Content-Type: ' + SGF_MIME_TYPE + '; charset=UTF-8',
    '',
    content,
    '--' + boundary + '--'
  ].join('\\r\\n');
  const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', token, {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body: body
  });
  const file = await response.json();
  return { fileId: file.id, fileName: file.name || fileName };
}

async function updateGoogleDriveFile(token, fileId, content, fileName) {
  const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media&fields=id,name&supportsAllDrives=true', token, {
    method: 'PATCH',
    headers: { 'Content-Type': SGF_MIME_TYPE + '; charset=UTF-8' },
    body: content
  });
  const file = await response.json();
  return { fileId: file.id, fileName: file.name || fileName };
}

async function driveFetch(url, token, init) {
  const options = init || {};
  options.headers = Object.assign({}, options.headers, { Authorization: 'Bearer ' + token });
  const response = await fetch(url, options);
  if (!response.ok) throw new Error('Google Drive request failed (' + response.status + ').');
  return response;
}

async function readSgf() {
  const response = await fetch('/api/sgf?token=' + encodeURIComponent(BRIDGE_TOKEN));
  if (!response.ok) throw new Error('Ulugo did not provide an SGF file.');
  return response.json();
}

async function writeSgf(payload) {
  const response = await fetch('/api/sgf?token=' + encodeURIComponent(BRIDGE_TOKEN), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Ulugo did not accept the Google Drive result.');
}

async function reportCancel() {
  await fetch('/api/cancel?token=' + encodeURIComponent(BRIDGE_TOKEN), { method: 'POST' }).catch(function() {});
  finish('Google Drive operation canceled. Return to Ulugo. This tab will close shortly.');
}

async function reportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  await fetch('/api/error?token=' + encodeURIComponent(BRIDGE_TOKEN), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message })
  }).catch(function() {});
  finish('Google Drive operation failed. Return to Ulugo. This tab will close shortly.');
}

function setStatus(message) {
  document.body.textContent = message;
}

function finish(message) {
  setStatus(message);
  setTimeout(function() { window.close(); }, 300000);
}
  </script>
</body>
</html>`;
}

async function extractDownloadedAsset(zipPath: string, destination: string, kind: 'katago' | 'model'): Promise<string> {
  const existingFiles = new Set(await listFiles(destination));
  await extract(zipPath, {dir: destination});
  await fs.rm(zipPath, {force: true});

  const extractedFiles = (await listFiles(destination)).filter((file) => !existingFiles.has(file));
  const files = extractedFiles.length > 0 ? extractedFiles : await listFiles(destination);
  const installed = files.find((file) => {
    return isInstalledAssetCandidate(kind, file);
  });

  if (installed == null) throw new Error(`Could not find installed ${kind} file in downloaded archive.`);
  return installed;
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, {withFileTypes: true});
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : Promise.resolve([entryPath]);
    })
  );
  return nested.flat();
}

async function findFirstFile(directory: string, predicate: (file: string) => boolean): Promise<string | null> {
  for (const file of await listFiles(directory)) {
    if (predicate(file)) return file;
  }
  return null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function makeExecutable(filePath: string): Promise<void> {
  if (process.platform === 'win32') return;
  const mode = fsSync.statSync(filePath).mode;
  await fs.chmod(filePath, mode | 0o111);
}
