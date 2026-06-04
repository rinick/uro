import type {KataGoAnalysisResult, AnalysisSettings} from '@uro/analysis-core';
import type {
  KataGoAnalysisQuery,
  KataGoConsoleMessage,
  KataGoDownloadOption,
  KataGoDownloadProgress,
  KataGoDownloadResult,
  KataGoSettings,
} from '@uro/katago-core';

export interface ElectronImportResult {
  content: string;
  fileName: string;
}

export interface ElectronExportRequest {
  content: string;
  suggestedName: string;
}

export interface ElectronExportResult {
  canceled: boolean;
  filePath?: string;
}

export interface UroElectronApi {
  platform: 'electron';
  importSgf: () => Promise<ElectronImportResult | null>;
  exportSgf: (request: ElectronExportRequest) => Promise<ElectronExportResult>;
  selectFile: (options?: {
    title?: string;
    filters?: Array<{name: string; extensions: string[]}>;
  }) => Promise<string | null>;
  katago: {
    getSettings: () => Promise<KataGoSettings>;
    saveSettings: (settings: KataGoSettings) => Promise<KataGoSettings>;
    getDownloadOptions: () => Promise<{katago: KataGoDownloadOption[]; models: KataGoDownloadOption[]}>;
    download: (request: {kind: 'katago' | 'model'; optionId: string}) => Promise<KataGoDownloadResult>;
    onDownloadProgress: (callback: (progress: KataGoDownloadProgress) => void) => () => void;
    analyze: (query: KataGoAnalysisQuery) => Promise<void>;
    stopAnalysis: () => Promise<void>;
    onAnalysis: (callback: (result: KataGoAnalysisResult) => void) => () => void;
    onAnalysisError: (callback: (message: string) => void) => () => void;
    onConsoleMessage: (callback: (message: KataGoConsoleMessage) => void) => () => void;
  };
  analysis: {
    getSettings: () => Promise<AnalysisSettings>;
    saveSettings: (settings: AnalysisSettings) => Promise<AnalysisSettings>;
  };
}

declare global {
  interface Window {
    uro?: UroElectronApi;
  }
}
