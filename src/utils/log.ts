export type LogLevel = 'info' | 'warn' | 'error' | 'success';
export interface LogEntry { at: number; level: LogLevel; message: string; detail?: string }
export class EventLog {
  private rows: LogEntry[] = [];
  private listeners = new Set<(rows: readonly LogEntry[]) => void>();
  add(level: LogLevel, message: string, detail?: unknown): void {
    const row: LogEntry = { at: Date.now(), level, message, detail: detail === undefined ? undefined : String(detail) };
    this.rows.push(row); if (this.rows.length > 350) this.rows.shift();
    this.listeners.forEach(fn => fn(this.rows));
    const printer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    printer(`[LiveClass ${new Date(row.at).toLocaleTimeString()}] ${message}`, detail ?? '');
  }
  subscribe(fn: (rows: readonly LogEntry[]) => void): () => void { this.listeners.add(fn); fn(this.rows); return () => this.listeners.delete(fn); }
  all(): readonly LogEntry[] { return this.rows; }
}
export const eventLog = new EventLog();