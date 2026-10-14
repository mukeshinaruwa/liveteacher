export type ClassStatus = 'IDLE' | 'PLANNING' | 'TEACHING' | 'INTERRUPT' | 'RESUMING' | 'RECAP' | 'NEXT_TOPIC' | 'PAUSED' | 'ENDED' | 'ERROR';
const allowed: Record<ClassStatus, ClassStatus[]> = {
  IDLE: ['PLANNING', 'TEACHING', 'ENDED'], PLANNING: ['TEACHING', 'IDLE', 'ERROR', 'ENDED'], TEACHING: ['INTERRUPT', 'RECAP', 'PAUSED', 'NEXT_TOPIC', 'ENDED', 'ERROR'],
  INTERRUPT: ['RESUMING', 'TEACHING', 'PAUSED', 'ERROR', 'ENDED'], RESUMING: ['TEACHING', 'INTERRUPT', 'PAUSED', 'ENDED', 'ERROR'],
  RECAP: ['NEXT_TOPIC', 'ENDED', 'PAUSED', 'ERROR'], NEXT_TOPIC: ['PLANNING', 'TEACHING', 'INTERRUPT', 'ENDED', 'ERROR'],
  PAUSED: ['TEACHING', 'INTERRUPT', 'RECAP', 'NEXT_TOPIC', 'ENDED', 'IDLE'], ENDED: ['PLANNING', 'TEACHING', 'IDLE'], ERROR: ['PLANNING', 'TEACHING', 'IDLE', 'ENDED'],
};
export class StateMachine {
  private current: ClassStatus = 'IDLE';
  private listeners = new Set<(next: ClassStatus, previous: ClassStatus) => void>();
  get status(): ClassStatus { return this.current; }
  can(next: ClassStatus): boolean { return this.current === next || allowed[this.current].includes(next); }
  transition(next: ClassStatus): void {
    if (next === this.current) return;
    if (!this.can(next)) throw new Error(`Invalid class transition: ${this.current} → ${next}`);
    const previous = this.current; this.current = next;
    this.listeners.forEach(fn => fn(next, previous));
  }
  subscribe(fn: (next: ClassStatus, previous: ClassStatus) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}