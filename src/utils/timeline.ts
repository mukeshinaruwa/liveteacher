import { ActionTimelineSchema, type Action, type ActionTimeline, type WordTiming } from '../contracts';

export function estimateWordTimings(text: string, pace = 1): WordTiming[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const safePace = Math.min(2, Math.max(0.5, pace));
  let cursor = 0;
  return tokens.map((word, index) => {
    const startMs = cursor;
    const base = 160 + word.length * 52;
    const punctuation = /[।!?;,:]$/.test(word) ? 180 : 0;
    cursor += (base + punctuation) / safePace;
    if (index % 7 === 6) cursor += 100 / safePace;
    return { word, startMs: Math.round(startMs), endMs: Math.round(cursor) };
  });
}
export function resolveTimeline(input: ActionTimeline, timings: WordTiming[] = []): ActionTimeline {
  const byId = new Map<string, number>();
  let lastWordAnchor = 0;
  const actions: Action[] = input.actions.map((source, index) => {
    let t = source.t ?? 0;
    if (source.anchor?.kind === 'word') {
      const w = timings[source.anchor.wordIndex ?? 0];
      t = (w?.startMs ?? lastWordAnchor) + (source.anchor.offsetMs ?? 0);
      lastWordAnchor = t;
    } else if (source.anchor?.kind === 'action') {
      t = (byId.get(source.anchor.actionId ?? '') ?? t) + (source.anchor.offsetMs ?? 0);
    }
    t = Math.max(0, Math.min(Math.round(t), input.totalMs));
    const clean = { ...source, t } as Action;
    if (source.actionId) byId.set(source.actionId, t);
    return clean;
  });
  actions.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  const candidate = { ...input, actions };
  return ActionTimelineSchema.parse(candidate);
}
export function safeFallbackTimeline(segmentId: string, text: string, lang: 'ne' | 'en' = 'ne'): ActionTimeline {
  const timings = estimateWordTimings(text);
  const totalMs = Math.max(5000, (timings.at(-1)?.endMs ?? 0) + 1800);
  return ActionTimelineSchema.parse({ segmentId, lang, totalMs, actions: [
    { t: 0, type: 'camera', shot: 'medium', ease: 'smooth' },
    { t: 150, type: 'emotion', name: 'warm', intensity: 0.65 },
    { t: 250, type: 'speak', text },
    { t: 1200, type: 'gesture', name: 'open_palm' },
    { t: Math.max(2000, totalMs - 1000), type: 'recap', points: ['मुख्य अवधारणा बुझ्नुहोस्', 'उदाहरणसहित उत्तर लेख्नुहोस्'] },
  ] });
}