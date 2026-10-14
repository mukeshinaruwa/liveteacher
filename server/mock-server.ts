import express from 'express';
import { z } from 'zod';
import { CommentSchema, DirectorRequestSchema, PlannerRequestSchema, RespondRequestSchema, TTSRequestSchema } from '../src/contracts';
import { estimateWordTimings, safeFallbackTimeline } from '../src/utils/timeline';

const app = express();
const port = Number(process.env.PORT || 8787);
app.use(express.json({ limit: '1mb' }));
app.use((_req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); if (_req.method === 'OPTIONS') return res.sendStatus(204); next(); });
app.get('/health', (_req, res) => res.json({ ok: true, service: 'live-teacher-mock-server', time: new Date().toISOString() }));

app.post('/plan', (req, res) => {
  const parsed = PlannerRequestSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  const p = parsed.data; const id = `mock-${Date.now()}`;
  const text = p.notes.trim() || `${p.topic} को परिभाषा, मुख्य पक्ष, उदाहरण, नेपाली सन्दर्भ र परीक्षामुखी पुनरावलोकन।`;
  return res.json({ id, title: p.topic, lang: p.lang, objectives: p.objectives.length ? p.objectives : ['मुख्य अवधारणा व्याख्या गर्ने', 'उदाहरण र निष्कर्षसहित उत्तर लेख्ने'], keyTerms: [], segments: [{ id: `${id}-seg-01`, title: p.topic, text, durationMin: p.durationMin, notes: p.notes }], durationMin: p.durationMin, disclaimer: 'DEMO — प्रयोगअघि आधिकारिक स्रोतबाट पुष्टि गर्नुहोस्' });
});

app.post('/direct', (req, res) => {
  const parsed = DirectorRequestSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  const { segment, lang } = parsed.data;
  return res.json(safeFallbackTimeline(segment.id, segment.text, lang));
});

app.post('/tts', (req, res) => {
  const parsed = TTSRequestSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  const timings = estimateWordTimings(parsed.data.text, parsed.data.style?.pace ?? 0.95);
  return res.json({ wordTimings: timings, durationMs: (timings.at(-1)?.endMs ?? 500) + 200, mimeType: 'application/x-silent' });
});

const seededComments = [
  { author: 'सिता', text: 'सुशासनको एउटा उदाहरण दिनुहोस्।', platform: 'youtube' as const },
  { author: 'प्रकाश', text: 'पारदर्शिता र जवाफदेहिता फरक कसरी?', platform: 'facebook' as const },
  { author: 'अनु', text: 'परीक्षामा उत्तर कसरी संरचना गर्ने?', platform: 'youtube' as const },
  { author: 'रमेश', text: 'नमस्कार सर!', platform: 'facebook' as const },
  { author: 'कविता', text: 'संघीय संरचनामा समन्वय किन आवश्यक छ?', platform: 'youtube' as const },
];
app.get('/comments', (req, res) => {
  const since = Math.max(0, Number(req.query.since || 0));
  const limit = Math.min(3, seededComments.length - since);
  const comments = seededComments.slice(since, since + limit).map((c, i) => CommentSchema.parse({ ...c, id: `server-${since + i + 1}`, ts: Date.now() - (since + i) * 1000 }));
  return res.json({ comments, cursor: String(Math.min(seededComments.length, since + comments.length)) });
});

app.post('/respond', (req, res) => {
  const parsed = RespondRequestSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  const decisions = parsed.data.comments.map(comment => {
    if (/https?:\/\/|www\./i.test(comment.text)) return { commentId: comment.id, decision: 'ignore' as const };
    const asksQuestion = /[?？]|के हो|कसरी|किन|व्याख्या/i.test(comment.text);
    return { commentId: comment.id, decision: asksQuestion ? 'answer_at_segment_end' as const : 'answer_later' as const,
      tone: 'encouraging' as const, reply: asksQuestion ? `राम्रो प्रश्न। ${parsed.data.currentSegment.title} को मुख्य पक्ष बुझेर उत्तरमा परिभाषा, व्याख्या र उदाहरण राख्नुहोस्। डेमो सामग्री भएकाले आधिकारिक स्रोतबाट पुष्टि गर्नुहोस्।` : 'धन्यवाद! प्रश्नलाई पुनरावलोकनमा समेट्नेछौँ।' };
  });
  return res.json({ decisions });
});
const replies: { commentId: string; text: string; at: string }[] = [];
app.post('/comments/reply', (req, res) => {
  const parsed = z.object({ commentId: z.string().min(1), text: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  replies.push({ ...parsed.data, at: new Date().toISOString() }); return res.json({ ok: true });
});
app.get('/debug/replies', (_req, res) => res.json({ replies }));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[mock-server]', error); return res.status(500).json({ error: 'internal_error', message: 'Mock server handled the error safely.' });
});
app.listen(port, () => console.log(`Live Teacher mock endpoints: http://localhost:${port} (Ctrl+C to stop)`));