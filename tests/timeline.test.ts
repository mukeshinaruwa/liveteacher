import { describe, expect, it } from 'vitest';
import { ActionTimelineSchema } from '../src/contracts';
import { estimateWordTimings, resolveTimeline, safeFallbackTimeline } from '../src/utils/timeline';

describe('timeline resolution', () => {
  it('resolves word anchors into clamped absolute times and preserves ordering', () => {
    const timings = estimateWordTimings('संविधान नागरिक सेवा', 1);
    const timeline = ActionTimelineSchema.parse({ segmentId: 't1', lang: 'ne', totalMs: 4000, actions: [
      { actionId: 'speech', t: 0, type: 'speak', text: 'संविधान नागरिक सेवा' },
      { actionId: 'highlight', anchor: { kind: 'word', wordIndex: 1, offsetMs: 40 }, type: 'board', op: 'highlight', id: 'line.1' },
      { actionId: 'follow', anchor: { kind: 'action', actionId: 'highlight', offsetMs: 120 }, type: 'gesture', name: 'point_board' },
    ] });
    const resolved = resolveTimeline(timeline, timings);
    expect(resolved.actions[1].t).toBe(timings[1].startMs + 40);
    expect(resolved.actions[2].t).toBe((resolved.actions[1].t ?? 0) + 120);
    expect(resolved.actions.map(a=>a.t)).toEqual([...resolved.actions.map(a=>a.t)].sort((a,b)=>(a??0)-(b??0)));
  });
  it('creates a parseable safe fallback for empty or malformed provider output', () => {
    const fallback = safeFallbackTimeline('safe-1', 'यो परीक्षण पाठ हो।');
    expect(fallback.segmentId).toBe('safe-1'); expect(fallback.actions.some(a=>a.type==='speak')).toBe(true);
    expect(() => ActionTimelineSchema.parse({ segmentId: '', totalMs: -1, actions: [] })).toThrow();
  });
  it('estimates monotonically increasing word timings for Nepali text', () => {
    const timings=estimateWordTimings('शासन प्रणाली पारदर्शिता र जवाफदेहिता');
    expect(timings.length).toBe(5); expect(timings.every(t=>t.endMs>=t.startMs)).toBe(true);
    expect(timings.slice(1).every((t,i)=>t.startMs>=timings[i].startMs)).toBe(true);
  });
});