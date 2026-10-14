import type { Lang, TeachingStyle } from '../contracts';

export type ProviderMode = 'mock' | 'http';
export interface AppSettings {
  apiBaseUrl: string;
  authHeader: string;
  authValue: string;
  paths: { plan: string; direct: string; tts: string; respond: string; comments: string; reply: string };
  providers: { planner: ProviderMode; director: ProviderMode; tts: 'mock' | 'browser' | 'http'; responder: ProviderMode; commentSource: ProviderMode };
  lang: Lang;
  style: TeachingStyle;
  pace: number;
  voiceURI: string;
  volume: number;
  commentIntervalMs: number;
  answerBudgetRatio: number;
  quality: 'low' | 'medium' | 'high';
  resolution: '1280x720' | '1920x1080' | '2560x1440';
  mockComments: boolean;
  autoStartBroadcast: boolean;
}
export const DEFAULT_SETTINGS: AppSettings = {
  apiBaseUrl: 'http://localhost:8787', authHeader: 'Authorization', authValue: '',
  paths: { plan: '/plan', direct: '/direct', tts: '/tts', respond: '/respond', comments: '/comments', reply: '/comments/reply' },
  providers: { planner: 'mock', director: 'mock', tts: 'browser', responder: 'mock', commentSource: 'mock' },
  lang: 'ne', style: 'exam-oriented', pace: 0.95, voiceURI: '', volume: 0.9,
  commentIntervalMs: 3000, answerBudgetRatio: 0.2, quality: 'medium', resolution: '1920x1080', mockComments: true, autoStartBroadcast: false,
};
const KEY = 'liveTeacher.settings.v1';
export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const value = JSON.parse(raw) as Partial<AppSettings>;
    return { ...structuredClone(DEFAULT_SETTINGS), ...value, paths: { ...DEFAULT_SETTINGS.paths, ...value.paths }, providers: { ...DEFAULT_SETTINGS.providers, ...value.providers } };
  } catch { return structuredClone(DEFAULT_SETTINGS); }
}
export function saveSettings(settings: AppSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (error) { console.warn('Settings could not be saved locally.', error); }
}