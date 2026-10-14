import {
  ActionTimelineSchema, CommentsResponseSchema, CommentSchema, DirectorRequestSchema, LessonPlanSchema,
  PlannerRequestSchema, RespondResponseSchema, TTSResponseSchema, type ActionTimeline, type Comment,
  type CommentDecision, type LessonPlan, type LessonSegment, type TTSResponse, type WordTiming,
} from '../contracts';
import { DEMO_LABEL, topicToPlan, type CourseTopic } from '../data/demo/course';
import { eventLog } from '../utils/log';
import { estimateWordTimings, safeFallbackTimeline } from '../utils/timeline';
import { getSettings } from './settings';

export interface PlannerProvider { plan(input: unknown): Promise<LessonPlan> }
export interface DirectorProvider { direct(segment: LessonSegment, plan: LessonPlan, history?: string[]): Promise<ActionTimeline> }
export interface PreparedSpeech { text: string; response: TTSResponse; durationMs: number; lang: 'ne' | 'en'; style?: Record<string, unknown> }
export interface TTSProvider {
  prepare(text: string, lang: 'ne' | 'en', style?: Record<string, unknown>): Promise<PreparedSpeech>;
  play(prepared: PreparedSpeech, onWord?: (wordIndex: number, timing: WordTiming) => void): Promise<void>;
  cancel(): void;
  voices?(): SpeechSynthesisVoice[];
}
export interface CommentResponderProvider { respond(comments: Comment[], lessonContext: string, currentSegment: LessonSegment): Promise<CommentDecision[]> }
export interface CommentSourceProvider { poll(cursor?: string | number): Promise<{ comments: Comment[]; cursor?: string | number }>; reply(commentId: string, text: string): Promise<void> }

function endpoint(path: string): string { return `${getSettings().apiBaseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`; }
async function requestJson<T>(path: string, init: RequestInit = {}, retries = 1): Promise<T> {
  const settings = getSettings();
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const headers = new Headers(init.headers);
      headers.set('Content-Type', 'application/json');
      if (settings.authHeader.trim() && settings.authValue) headers.set(settings.authHeader.trim(), settings.authValue);
      const response = await fetch(endpoint(path), { ...init, headers, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${path}`);
      return await response.json() as T;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise(resolve => window.setTimeout(resolve, 250 * 2 ** attempt));
    } finally { window.clearTimeout(timeout); }
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${path}`);
}
const post = <T>(path: string, body: unknown): Promise<T> => requestJson<T>(path, { method: 'POST', body: JSON.stringify(body) }, 1);

export class MockPlanner implements PlannerProvider {
  async plan(raw: unknown): Promise<LessonPlan> {
    const input = PlannerRequestSchema.parse(raw);
    const topic: CourseTopic = {
      id: `generated-${Date.now()}`, title: input.topic || 'नयाँ विषय', objectives: input.objectives.length ? input.objectives : ['अवधारणा बुझ्ने', 'उदाहरणसहित व्याख्या गर्ने'],
      keyTerms: [], notes: input.notes || 'डेमो नोट; आधिकारिक स्रोतबाट पुष्टि गर्नुहोस्।', references: [], durationMin: input.durationMin, difficulty: 'intermediate', lang: input.lang,
      segments: [{ id: `generated-${Date.now()}-seg-01`, title: input.topic, text: input.notes || `${input.topic} को परिभाषा, मुख्य पक्ष, उदाहरण र परीक्षामुखी पुनरावलोकन।`, durationMin: input.durationMin, notes: input.notes || '' }],
    };
    const plan = topicToPlan(topic);
    return LessonPlanSchema.parse({ ...plan, disclaimer: DEMO_LABEL });
  }
}
export class HttpPlanner implements PlannerProvider {
  constructor(private fallback: PlannerProvider = new MockPlanner()) {}
  async plan(raw: unknown): Promise<LessonPlan> {
    const input = PlannerRequestSchema.parse(raw);
    try { return LessonPlanSchema.parse(await post(getSettings().paths.plan, input)); }
    catch (error) { eventLog.add('warn', 'Planner HTTP असफल; demo fallback प्रयोग गरियो।', error); return this.fallback.plan(input); }
  }
}
export class MockDirector implements DirectorProvider {
  async direct(segment: LessonSegment, _plan: LessonPlan): Promise<ActionTimeline> {
    return segment.timeline ? ActionTimelineSchema.parse(segment.timeline) : safeFallbackTimeline(segment.id, segment.text);
  }
}
export class HttpDirector implements DirectorProvider {
  constructor(private fallback: DirectorProvider = new MockDirector()) {}
  async direct(segment: LessonSegment, plan: LessonPlan, history: string[] = []): Promise<ActionTimeline> {
    const settings = getSettings();
    const input = DirectorRequestSchema.parse({ segment, plan, history, persona: 'friendly Nepali PSC instructor', lang: settings.lang });
    try {
      const result = ActionTimelineSchema.safeParse(await post(settings.paths.direct, input));
      if (result.success) return result.data;
      eventLog.add('warn', 'Director JSON schema मिलेन; सुरक्षित demo timeline प्रयोग गरियो।', result.error.message);
    } catch (error) { eventLog.add('warn', 'Director HTTP असफल; demo timeline प्रयोग गरियो।', error); }
    return this.fallback.direct(segment, plan, history);
  }
}

class AudioRouter {
  private context?: AudioContext;
  private gain?: GainNode;
  private streamDestination?: MediaStreamAudioDestinationNode;
  ensure(): { context: AudioContext; gain: GainNode; destination: MediaStreamAudioDestinationNode } | undefined {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return undefined;
    try {
      if (!this.context) {
        this.context = new AudioContext(); this.gain = this.context.createGain();
        this.streamDestination = this.context.createMediaStreamDestination();
        this.gain.connect(this.context.destination); this.gain.connect(this.streamDestination);
        (window as Window & { __liveAudioStream?: MediaStream }).__liveAudioStream = this.streamDestination.stream;
      }
      return { context: this.context, gain: this.gain!, destination: this.streamDestination! };
    } catch (error) { eventLog.add('warn', 'Audio capture routing उपलब्ध भएन।', error); return undefined; }
  }
  setVolume(value: number): void { if (this.gain) this.gain.gain.value = Math.max(0, Math.min(1, value)); }
}
export const audioRouter = new AudioRouter();

export class MockTTS implements TTSProvider {
  async prepare(text: string, lang: 'ne' | 'en', style?: Record<string, unknown>): Promise<PreparedSpeech> {
    const timings = estimateWordTimings(text, Number(style?.pace ?? 0.95));
    return { text, lang, style, response: { wordTimings: timings, durationMs: (timings.at(-1)?.endMs ?? 0) + 150, mimeType: 'application/x-silent' }, durationMs: (timings.at(-1)?.endMs ?? 0) + 150 };
  }
  async play(prepared: PreparedSpeech, onWord?: (wordIndex: number, timing: WordTiming) => void): Promise<void> {
    for (const [index, timing] of (prepared.response.wordTimings ?? []).entries()) onWord?.(index, timing);
    await new Promise(resolve => window.setTimeout(resolve, Math.min(prepared.durationMs, 250)));
  }
  cancel(): void {}
}
export class BrowserTTS implements TTSProvider {
  private current?: SpeechSynthesisUtterance;
  voices(): SpeechSynthesisVoice[] { return 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : []; }
  async prepare(text: string, lang: 'ne' | 'en', style?: Record<string, unknown>): Promise<PreparedSpeech> {
    const pace = Number(style?.pace ?? getSettings().pace);
    const timings = estimateWordTimings(text, pace);
    return { text, lang, style, response: { wordTimings: timings, durationMs: (timings.at(-1)?.endMs ?? 0) + 300 }, durationMs: (timings.at(-1)?.endMs ?? 0) + 300 };
  }
  async play(prepared: PreparedSpeech, onWord?: (wordIndex: number, timing: WordTiming) => void): Promise<void> {
    if (!('speechSynthesis' in window)) throw new Error('यस ब्राउजरमा speechSynthesis उपलब्ध छैन।');
    this.cancel();
    const settings = getSettings();
    const voices = this.voices();
    const selected = voices.find(v => v.voiceURI === settings.voiceURI) || voices.find(v => /ne[-_]NP/i.test(v.lang)) || (prepared.lang === 'ne' ? voices.find(v => /hi[-_]IN/i.test(v.lang)) : undefined) || voices.find(v => /^en/i.test(v.lang));
    const utterance = new SpeechSynthesisUtterance(prepared.text);
    utterance.lang = prepared.lang === 'ne' ? (selected?.lang || 'ne-NP') : (selected?.lang || 'en-US');
    utterance.voice = selected ?? null;
    utterance.rate = Math.max(0.5, Math.min(2, Number(prepared.style?.pace ?? settings.pace)));
    utterance.pitch = Number(prepared.style?.pitch ?? 1); utterance.volume = settings.volume;
    this.current = utterance;
    const estimated = prepared.response.wordTimings ?? estimateWordTimings(prepared.text, utterance.rate);
    return new Promise((resolve, reject) => {
      utterance.onboundary = event => {
        if (event.name !== 'word') return;
        const i = estimated.findIndex((timing, index) => event.charIndex >= 0 && (index === 0 || estimated[index - 1].endMs <= event.charIndex));
        const index = i < 0 ? 0 : i;
        const timing = estimated[index]; if (timing) onWord?.(index, timing);
      };
      utterance.onend = () => { this.current = undefined; resolve(); };
      utterance.onerror = event => { this.current = undefined; if (event.error === 'canceled' || event.error === 'interrupted') resolve(); else reject(new Error(`Browser TTS: ${event.error}`)); };
      window.speechSynthesis.speak(utterance);
      // Some browser voices do not fire boundary events. Estimated timings keep the timeline animated.
      estimated.forEach((timing, i) => window.setTimeout(() => { if (this.current === utterance) onWord?.(i, timing); }, timing.startMs));
    });
  }
  cancel(): void { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); this.current = undefined; }
}
export class HttpTTS implements TTSProvider {
  private active?: HTMLAudioElement;
  async prepare(text: string, lang: 'ne' | 'en', style?: Record<string, unknown>): Promise<PreparedSpeech> {
    try {
      const response = TTSResponseSchema.parse(await post(getSettings().paths.tts, { text, lang, style }));
      const durationMs = response.durationMs ?? (response.wordTimings?.at(-1)?.endMs ?? estimateWordTimings(text).at(-1)?.endMs ?? 1500);
      return { text, lang, style, response, durationMs };
    } catch (error) {
      eventLog.add('warn', 'HTTP TTS असफल; मौन timing fallback प्रयोग हुँदैछ।', error);
      const fallback = await new MockTTS().prepare(text, lang, style); return fallback;
    }
  }
  async play(prepared: PreparedSpeech, onWord?: (wordIndex: number, timing: WordTiming) => void): Promise<void> {
    const resp = prepared.response; const timings = resp.wordTimings ?? estimateWordTimings(prepared.text);
    if (!resp.audioUrl && !resp.audioBase64) {
      timings.forEach((timing, i) => window.setTimeout(() => onWord?.(i, timing), timing.startMs));
      await new Promise(resolve => window.setTimeout(resolve, Math.min(prepared.durationMs, 500))); return;
    }
    const audio = new Audio(resp.audioUrl || `data:${resp.mimeType || 'audio/mpeg'};base64,${resp.audioBase64}`);
    audio.preload = 'auto'; audio.volume = getSettings().volume; this.active = audio;
    const router = audioRouter.ensure();
    if (router) {
      try { const source = router.context.createMediaElementSource(audio); source.connect(router.gain); } catch { /* An already-routed element is still playable. */ }
    }
    timings.forEach((timing, i) => window.setTimeout(() => { if (this.active === audio) onWord?.(i, timing); }, timing.startMs));
    await new Promise<void>((resolve, reject) => { audio.onended = () => resolve(); audio.onerror = () => reject(new Error('TTS audio could not be played')); void audio.play().catch(reject); });
  }
  cancel(): void { if (this.active) { this.active.pause(); this.active.currentTime = 0; this.active = undefined; } }
}

export class MockCommentResponder implements CommentResponderProvider {
  async respond(comments: Comment[], _lessonContext: string, segment: LessonSegment): Promise<CommentDecision[]> {
    return comments.map(comment => {
      const text = comment.text.toLowerCase();
      if (/(subscribe|free money|http:\/\/|https:\/\/)/i.test(text)) return { commentId: comment.id, decision: 'ignore' as const };
      if (/[?？]|के हो|कसरी|किन|बताउनु|व्याख्या/i.test(text)) return { commentId: comment.id, decision: 'answer_at_segment_end' as const, tone: 'encouraging' as const, reply: `राम्रो प्रश्न। ${segment.title} सँग जोडेर छोटकरीमा भनौँ: ${segment.text.slice(0, 150)}। विस्तृत विषयवस्तु आधिकारिक स्रोतसँग मिलाएर हेर्नुहोस्।` };
      if (/नमस्ते|हेलो|hello|नमस्कार/i.test(text)) return { commentId: comment.id, decision: 'answer_later' as const, tone: 'warm' as const, reply: 'नमस्कार, कक्षामा स्वागत छ! पाठसँग सम्बन्धित प्रश्न पनि लेख्नुहोस्।' };
      return { commentId: comment.id, decision: 'answer_later' as const, reply: 'धन्यवाद। यस बुँदालाई पुनरावलोकनमा समेट्नेछौँ।' };
    });
  }
}
export class HttpCommentResponder implements CommentResponderProvider {
  constructor(private fallback: CommentResponderProvider = new MockCommentResponder()) {}
  async respond(comments: Comment[], lessonContext: string, currentSegment: LessonSegment): Promise<CommentDecision[]> {
    const settings = getSettings();
    try { return RespondResponseSchema.parse(await post(settings.paths.respond, { comments, lessonContext, currentSegment })).decisions; }
    catch (error) { eventLog.add('warn', 'Comment responder HTTP असफल; स्थानीय नियम प्रयोग गरियो।', error); return this.fallback.respond(comments, lessonContext, currentSegment); }
  }
}
export class MockCommentSource implements CommentSourceProvider {
  private count = 0;
  private pool = [
    ['सिता', 'सुशासनको एउटा उदाहरण दिनुहोस्।', 'youtube'], ['प्रकाश', 'पारदर्शिता र जवाफदेहिता फरक कसरी?', 'facebook'],
    ['अनु', 'परीक्षामा उत्तर कसरी संरचना गर्ने?', 'youtube'], ['रमेश', 'नमस्कार सर, आवाज राम्रो छ।', 'facebook'],
    ['कविता', 'संघीय संरचनामा समन्वय किन आवश्यक छ?', 'youtube'],
  ] as const;
  async poll(_cursor?: string | number): Promise<{ comments: Comment[]; cursor: string }> {
    if (Math.random() > 0.42) return { comments: [], cursor: String(this.count) };
    const [author, text, platform] = this.pool[this.count % this.pool.length]; this.count++;
    return { comments: [CommentSchema.parse({ id: `mock-${this.count}`, author, text, platform, ts: Date.now() })], cursor: String(this.count) };
  }
  async reply(_commentId: string, _text: string): Promise<void> { /* demo provider keeps replies local */ }
}
export class HttpCommentSource implements CommentSourceProvider {
  async poll(cursor?: string | number): Promise<{ comments: Comment[]; cursor?: string | number }> {
    const path = getSettings().paths.comments;
    const query = cursor === undefined ? '' : `?since=${encodeURIComponent(String(cursor))}`;
    try { const value = CommentsResponseSchema.parse(await requestJson(`${path}${query}`, {}, 0)); return value; }
    catch (error) { eventLog.add('warn', 'Comment polling असफल; पछिल्लो कक्षा चलिरहन्छ।', error); return { comments: [] }; }
  }
  async reply(commentId: string, text: string): Promise<void> {
    try { await post(getSettings().paths.reply, { commentId, text }); }
    catch (error) { eventLog.add('warn', 'Reply post-back असफल।', error); }
  }
}

export function createProviders() {
  const settings = getSettings();
  const planner: PlannerProvider = settings.providers.planner === 'http' ? new HttpPlanner() : new MockPlanner();
  const director: DirectorProvider = settings.providers.director === 'http' ? new HttpDirector() : new MockDirector();
  const tts: TTSProvider = settings.providers.tts === 'http' ? new HttpTTS() : settings.providers.tts === 'mock' ? new MockTTS() : new BrowserTTS();
  const responder: CommentResponderProvider = settings.providers.responder === 'http' ? new HttpCommentResponder() : new MockCommentResponder();
  const commentSource: CommentSourceProvider = settings.providers.commentSource === 'http' ? new HttpCommentSource() : new MockCommentSource();
  return { planner, director, tts, responder, commentSource };
}