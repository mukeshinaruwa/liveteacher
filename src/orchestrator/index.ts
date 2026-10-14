import type { Action, ActionTimeline, Comment, CommentDecision, LessonPlan, LessonSegment } from '../contracts';
import { ActionTimelineSchema } from '../contracts';
import type { PreparedSpeech } from '../providers';
import { createProviders } from '../providers';
import { getSettings } from '../providers/settings';
import { DEMO_LABEL, type CourseTopic } from '../data/demo/course';
import { eventLog } from '../utils/log';
import { resolveTimeline, safeFallbackTimeline } from '../utils/timeline';
import { CommentBatcher, dedupeComments } from './comments';
import { StateMachine, type ClassStatus } from './state-machine';

export interface FeaturedComment { comment: Comment; reply?: string; phase: 'incoming' | 'reply' }
export interface DirectorStage {
  applyAction(action: Action): void;
  setLessonTitle(title: string): void;
  setWord(index: number, word: string): void;
  setProgress(progress: number, totalMs: number): void;
  setStatus(status: ClassStatus): void;
  featureComment(value: FeaturedComment | null): void;
  showMessage(message: string, kind?: 'info' | 'warn' | 'success'): void;
}
export interface PublicClassState {
  status: ClassStatus; courseTitle: string; topicTitle: string; topicIndex: number; segmentIndex: number;
  totalTopics: number; segmentTitle: string; progress: number; totalMs: number; parkedComments: number;
  logs: ReturnType<typeof eventLog.all>; startedAt?: number;
}
type Prefetch = { timeline: ActionTimeline; speech: Map<string, PreparedSpeech> };

export class LiveClassOrchestrator {
  readonly machine = new StateMachine();
  private readonly providers = createProviders();
  private readonly batcher = new CommentBatcher(12);
  private seen = new Set<string>(); private cursor?: string | number;
  private topicIndex = 0; private segmentIndex = 0; private courseTopics: CourseTopic[] = [];
  private courseTitle = ''; private activePlan?: LessonPlan; private timeline?: ActionTimeline;
  private startedAt?: number; private actionTimers: number[] = []; private frameTimer?: number; private commentTimer?: number; private batchTimer?: number; private watchdog?: number;
  private pausedAt?: number; private interrupting = false; private resumeStatus: ClassStatus = 'TEACHING';
  private prefetch = new Map<string, Promise<Prefetch>>(); private speechToken = 0; private commentBudgetUsed = 0;
  private currentProgress = 0; private currentTotalMs = 0; private history: string[] = [];
  constructor(private stage: DirectorStage, private onState: (state: PublicClassState) => void) {
    this.machine.subscribe((status) => { this.stage.setStatus(status); eventLog.add('info', `कक्षा अवस्था: ${status}`); this.emitState(); });
    eventLog.subscribe(() => this.emitState());
  }
  get activeTimeline(): ActionTimeline | undefined { return this.timeline; }
  get parkedComments(): readonly Comment[] { return this.batcher.parked; }
  get state(): PublicClassState {
    const topic = this.courseTopics[this.topicIndex]; const segment = topic?.segments[this.segmentIndex];
    return { status: this.machine.status, courseTitle: this.courseTitle, topicTitle: topic?.title ?? '', topicIndex: this.topicIndex, segmentIndex: this.segmentIndex,
      totalTopics: this.courseTopics.length, segmentTitle: segment?.title ?? '', progress: this.currentProgress, totalMs: this.currentTotalMs,
      parkedComments: this.batcher.size, logs: eventLog.all(), startedAt: this.startedAt };
  }
  private emitState(): void { try { this.onState(this.state); } catch (error) { console.warn('UI state listener failed', error); } }
  async loadCourse(courseTitle: string, topics: CourseTopic[]): Promise<void> {
    this.stopTimers(); this.providers.tts.cancel(); this.courseTitle = courseTitle; this.courseTopics = topics;
    this.topicIndex = 0; this.segmentIndex = 0; this.activePlan = undefined; this.timeline = undefined; this.prefetch.clear();
    if (this.machine.status !== 'IDLE') this.machine.transition('IDLE'); this.stage.showMessage(DEMO_LABEL, 'warn'); this.emitState();
  }
  async start(topicIndex = this.topicIndex): Promise<void> {
    if (!this.courseTopics.length) return;
    this.stopTimers(); this.providers.tts.cancel(); this.speechToken++; this.prefetch.clear(); this.topicIndex = Math.max(0, Math.min(topicIndex, this.courseTopics.length - 1)); this.segmentIndex = 0;
    this.startedAt = Date.now(); this.commentBudgetUsed = 0; this.history = [];
    try {
      const prior = this.machine.status;
      if (prior === 'TEACHING' || prior === 'PAUSED' || prior === 'RECAP') this.machine.transition('NEXT_TOPIC');
      else if (prior === 'INTERRUPT' || prior === 'RESUMING') { this.machine.transition('PAUSED'); this.machine.transition('NEXT_TOPIC'); }
      if (this.machine.status !== 'PLANNING') this.machine.transition('PLANNING');
      const topic = this.courseTopics[this.topicIndex];
      this.stage.setLessonTitle(topic.title);
      const settings = getSettings();
      this.activePlan = settings.providers.planner === 'http'
        ? await this.providers.planner.plan({ topic: topic.title, notes: topic.notes, objectives: topic.objectives, durationMin: topic.durationMin, style: settings.style, lang: settings.lang })
        : topicToPlanSafe(topic);
      if (!this.activePlan.segments.length) throw new Error('Planner returned no segments');
      this.stage.showMessage(`${topic.title} · ${DEMO_LABEL}`, 'info');
      await this.startSegment(0);
      this.startPolling();
    } catch (error) {
      eventLog.add('error', 'पाठ सुरु हुन सकेन; सुरक्षित demo प्रयास हुँदैछ।', error);
      if (this.machine.status !== 'ERROR') this.machine.transition('ERROR');
      const topic = this.courseTopics[this.topicIndex];
      this.activePlan = topicToPlanSafe(topic);
      await this.startSegment(0);
    }
  }
  private startPolling(): void {
    const settings = getSettings();
    if (this.commentTimer) window.clearInterval(this.commentTimer);
    if (this.batchTimer) window.clearInterval(this.batchTimer);
    this.commentTimer = window.setInterval(() => { void this.pollComments(); }, settings.commentIntervalMs);
    this.batchTimer = window.setInterval(() => { void this.processCommentBatch(); }, 14000);
    if (settings.mockComments) void this.pollComments();
  }
  private async pollComments(): Promise<void> {
    try {
      const result = await this.providers.commentSource.poll(this.cursor); if (result.cursor !== undefined) this.cursor = result.cursor;
      const fresh = dedupeComments(result.comments, this.seen); if (!fresh.length) return;
      this.batcher.add(fresh); fresh.forEach(c => { this.stage.featureComment({ comment: c, phase: 'incoming' }); eventLog.add('info', `टिप्पणी प्राप्त: ${c.author}`, c.text); });
      this.emitState();
    } catch (error) { eventLog.add('warn', 'टिप्पणी जाँचमा अस्थायी समस्या।', error); }
  }
  pushComment(raw: unknown): void {
    const accepted = dedupeComments([raw as Comment], this.seen);
    if (!accepted.length) { this.stage.showMessage('टिप्पणी मान्य भएन वा दोहोरिएको छ।', 'warn'); return; }
    this.batcher.add(accepted); this.stage.featureComment({ comment: accepted[0], phase: 'incoming' }); this.emitState();
  }
  private async processCommentBatch(): Promise<void> {
    if (this.machine.status !== 'TEACHING' || this.interrupting || !this.activePlan) return;
    const comments = this.batcher.take(); if (!comments.length) return;
    const segment = this.activePlan.segments[this.segmentIndex]; if (!segment) return;
    try {
      const decisions = await this.providers.responder.respond(comments, `${this.courseTitle}. ${this.activePlan.title}. ${DEMO_LABEL}`, segment);
      this.queueDecisions(decisions, comments);
    } catch (error) { eventLog.add('warn', 'टिप्पणीका उत्तर तयार भएनन्; प्रश्नहरू पछि हेर्नका लागि राखिए।', error); this.batcher.add(comments); }
  }
  private decisions: { decision: CommentDecision; comment: Comment }[] = [];
  private queueDecisions(decisions: CommentDecision[], comments: Comment[]): void {
    for (const decision of decisions) {
      const comment = comments.find(c => c.id === decision.commentId); if (!comment) continue;
      if (decision.decision === 'ignore') continue;
      if (decision.decision === 'answer_later' || decision.decision === 'add_to_recap') { this.batcher.add([comment]); continue; }
      this.decisions.push({ decision, comment });
    }
  }
  private prefetchSegment(segment: LessonSegment): Promise<Prefetch> {
    const existing = this.prefetch.get(segment.id); if (existing) return existing;
    const task = (async () => {
      const plan = this.activePlan ?? topicToPlanSafe(this.courseTopics[this.topicIndex]);
      let timeline: ActionTimeline;
      try { timeline = await this.providers.director.direct(segment, plan, this.history); }
      catch (error) { eventLog.add('warn', 'Timeline fallback प्रयोग गरियो।', error); timeline = safeFallbackTimeline(segment.id, segment.text); }
      const speech = new Map<string, PreparedSpeech>();
      for (const action of timeline.actions) if (action.type === 'speak') {
        try { speech.set(action.actionId ?? `speak:${action.text}`, await this.providers.tts.prepare(action.text, timeline.lang, action.style as Record<string, unknown>)); }
        catch (error) { eventLog.add('warn', 'TTS prefetch असफल; estimate प्रयोग हुनेछ।', error); }
      }
      return { timeline: ActionTimelineSchemaSafe(timeline, safeFallbackTimeline(segment.id, segment.text)), speech };
    })();
    this.prefetch.set(segment.id, task); return task;
  }
  private async startSegment(index: number): Promise<void> {
    if (!this.activePlan) return;
    const segment = this.activePlan.segments[index]; if (!segment) return;
    this.segmentIndex = index; this.stopTimelineTimers(); this.providers.tts.cancel(); this.timeline = undefined;
    const state = this.machine.status;
    if (state === 'NEXT_TOPIC' || state === 'RECAP' || state === 'PLANNING' || state === 'IDLE' || state === 'ERROR' || state === 'ENDED') this.machine.transition('TEACHING');
    const loadingStarted = performance.now();
    try {
      const prepared = await this.prefetchSegment(segment);
      this.timeline = resolveTimeline(prepared.timeline);
      this.currentTotalMs = this.timeline.totalMs; this.currentProgress = 0; this.startedAt = Date.now(); this.startedAtTimeline = performance.now();
      eventLog.add('success', `पाठ सुरु: ${segment.title}`);
      const next = this.activePlan.segments[index + 1]; if (next) void this.prefetchSegment(next).catch(e => eventLog.add('warn', 'अर्को खण्ड prefetch असफल।', e));
      this.runTimeline(this.timeline, prepared.speech, segment);
      if (this.watchdog) window.clearTimeout(this.watchdog);
      this.watchdog = window.setTimeout(() => {
        if (this.machine.status === 'TEACHING' && performance.now() - this.startedAtTimeline > this.currentTotalMs + 12000) {
          eventLog.add('error', 'Segment watchdog: अड्किएको खण्ड सुरक्षित रूपमा अघि बढाइयो।'); void this.finishSegment();
        }
      }, this.currentTotalMs + 13000);
    } catch (error) {
      eventLog.add('error', 'Timeline सुरु गर्न असफल; सुरक्षित fallback चलाइयो।', error);
      const safe = safeFallbackTimeline(segment.id, segment.text); this.timeline = safe; this.currentTotalMs = safe.totalMs; this.startedAtTimeline = performance.now();
      this.runTimeline(safe, new Map(), segment);
    }
    if (performance.now() - loadingStarted > 3000) eventLog.add('warn', 'Segment preparation took longer than expected.');
  }
  private startedAtTimeline = performance.now();
  private runTimeline(timeline: ActionTimeline, preparedSpeech: Map<string, PreparedSpeech>, segment: LessonSegment, skipPast = false): void {
    const actions = timeline.actions.slice().sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
    const initialElapsed = Math.max(0, performance.now() - this.startedAtTimeline);
    let actionIndex = skipPast ? actions.findIndex(action => (action.t ?? 0) > initialElapsed + 20) : 0;
    if (actionIndex < 0) actionIndex = actions.length;
    const tick = () => {
      if (this.machine.status !== 'TEACHING' && this.machine.status !== 'INTERRUPT' && this.machine.status !== 'RESUMING') return;
      const elapsed = performance.now() - this.startedAtTimeline;
      while (actionIndex < actions.length && (actions[actionIndex].t ?? 0) <= elapsed) {
        const action = actions[actionIndex++];
        try { this.executeAction(action, preparedSpeech, timeline, segment, actionIndex - 1); }
        catch (error) { eventLog.add('warn', `Action ${action.type} विफल; बाँकी कक्षा चलिरहन्छ।`, error); }
      }
      this.currentProgress = Math.min(1, elapsed / Math.max(1, timeline.totalMs)); this.stage.setProgress(this.currentProgress, timeline.totalMs);
      if (Math.floor(elapsed / 200) !== Math.floor(Math.max(0, elapsed - 35) / 200)) this.emitState();
      if (elapsed >= timeline.totalMs + 350) { void this.finishSegment(); return; }
      this.frameTimer = window.setTimeout(tick, 35);
    };
    this.stage.showMessage(`${segment.title} · ${DEMO_LABEL}`, 'info'); tick();
  }
  private executeAction(action: Action, preparedSpeech: Map<string, PreparedSpeech>, timeline: ActionTimeline, segment: LessonSegment, index: number): void {
    this.stage.applyAction(action);
    if (action.type === 'speak') {
      const token = ++this.speechToken;
      const prepared = preparedSpeech.get(action.actionId ?? `speak:${action.text}`);
      const promise = prepared ? Promise.resolve(prepared) : this.providers.tts.prepare(action.text, timeline.lang, action.style as Record<string, unknown>);
      void promise.then(value => this.providers.tts.play(value, (wordIndex, timing) => {
        if (token !== this.speechToken) return; this.stage.setWord(wordIndex, timing.word);
      })).catch(error => eventLog.add('warn', 'TTS playback असफल; दृश्य timeline जारी छ।', error));
    }
    if (action.type === 'question') this.stage.showMessage(action.text, 'info');
    if (action.type === 'recap') this.history.push(`${segment.title}: ${action.points.join(' / ')}`);
  }
  async pause(): Promise<void> {
    if (this.machine.status === 'PAUSED') { await this.resume(); return; }
    if (!['TEACHING', 'INTERRUPT', 'RESUMING'].includes(this.machine.status)) return;
    this.resumeStatus = this.machine.status; this.pausedAt = performance.now(); this.stopTimelineTimers(); this.providers.tts.cancel(); this.speechToken++;
    this.machine.transition('PAUSED'); eventLog.add('info', 'कक्षा रोकियो।');
  }
  async resume(): Promise<void> {
    if (this.machine.status !== 'PAUSED') return;
    const shift = this.pausedAt ? performance.now() - this.pausedAt : 0;
    this.startedAtTimeline += shift; this.machine.transition(this.resumeStatus === 'INTERRUPT' ? 'INTERRUPT' : 'TEACHING');
    if (this.timeline && this.activePlan) {
      const segment = this.activePlan.segments[this.segmentIndex]; if (segment) this.runTimeline(this.timeline, new Map(), segment, true);
    }
  }
  async next(): Promise<void> {
    if (!this.activePlan) return;
    if (this.segmentIndex + 1 < this.activePlan.segments.length) { this.machine.transition('NEXT_TOPIC'); await this.startSegment(this.segmentIndex + 1); return; }
    await this.advanceTopic();
  }
  async goToTopic(index: number): Promise<void> { await this.start(index); }
  async repeat(): Promise<void> { if (this.activePlan) await this.startSegment(this.segmentIndex); }
  stop(): void {
    this.stopTimers(); this.providers.tts.cancel(); this.speechToken++; this.stage.featureComment(null);
    if (this.machine.status !== 'ENDED') { try { this.machine.transition('ENDED'); } catch { this.machine.transition('IDLE'); } }
    this.stage.showMessage('कक्षा रोकियो। फेरि सुरु गर्न सक्नुहुन्छ। ' + DEMO_LABEL, 'info');
  }
  async skip(): Promise<void> { await this.next(); }
  private async finishSegment(): Promise<void> {
    if (this.finishing || !this.activePlan || this.machine.status === 'ENDED' || this.machine.status === 'PAUSED') return;
    this.finishing = true; this.stopTimelineTimers();
    try {
      if (this.decisions.length && this.machine.status === 'TEACHING') await this.playAnswers();
      if (this.isStatus('ENDED') || this.isStatus('PAUSED')) return;
      this.machine.transition('RECAP'); this.currentProgress = 1; this.stage.showMessage('मुख्य बुँदा पुनरावलोकन गर्नुहोस्। ' + DEMO_LABEL, 'success');
      window.setTimeout(() => { if (this.machine.status === 'RECAP') void this.next(); }, 2200);
    } finally { this.finishing = false; }
  }
  private isStatus(status: ClassStatus): boolean { return this.machine.status === status; }
  private finishing = false;
  private async playAnswers(): Promise<void> {
    const maxMs = Math.max(0, this.currentTotalMs * getSettings().answerBudgetRatio - this.commentBudgetUsed);
    const start = performance.now(); this.interrupting = true; this.machine.transition('INTERRUPT');
    const queued = this.decisions.splice(0, 3);
    for (const { decision, comment } of queued) {
      if (decision.decision === 'answer_at_segment_end' || decision.decision === 'answer_now' || decision.decision === 'clarify_with_board') {
        const reply = decision.reply || 'राम्रो प्रश्न। मुख्य बुँदा पाठका नोटमा समेटिएको छ; आधिकारिक स्रोतबाट थप पुष्टि गर्नुहोस्।';
        this.stage.featureComment({ comment, reply, phase: 'reply' });
        this.stage.applyAction({ t: 0, type: 'emotion', name: decision.tone || 'encouraging', intensity: 0.8 });
        this.stage.applyAction({ t: 0, type: 'gesture', name: 'open_palm' });
        this.stage.applyAction({ t: 0, type: 'camera', shot: 'medium', ease: 'smooth' });
        const prepared = await this.providers.tts.prepare(reply, getSettings().lang, { pace: 1, emotion: decision.tone || 'warm' });
        try { await this.providers.tts.play(prepared); } catch (error) { eventLog.add('warn', 'टिप्पणीको आवाज असफल भयो।', error); }
        await this.providers.commentSource.reply(comment.id, reply);
        if (performance.now() - start > maxMs && maxMs > 0) break;
      }
    }
    this.commentBudgetUsed += performance.now() - start; this.stage.featureComment(null); this.interrupting = false;
    if (this.machine.status === 'INTERRUPT') { this.machine.transition('RESUMING'); this.stage.showMessage('अब पाठमा फर्कौं…', 'success'); await new Promise(resolve => window.setTimeout(resolve, 800)); this.machine.transition('TEACHING'); }
  }
  private async advanceTopic(): Promise<void> {
    if (this.topicIndex + 1 >= this.courseTopics.length) {
      this.machine.transition('ENDED'); this.stage.showMessage('आजको कक्षा समाप्त भयो। धन्यवाद! ' + DEMO_LABEL, 'success'); this.stopTimers(); return;
    }
    const nextIndex = this.topicIndex + 1;
    this.machine.transition('NEXT_TOPIC');
    this.stage.showMessage(`अर्को विषय: ${this.courseTopics[nextIndex].title}`, 'info');
    await new Promise(resolve => window.setTimeout(resolve, 700));
    await this.start(nextIndex);
  }
  private stopTimelineTimers(): void { if (this.frameTimer) window.clearTimeout(this.frameTimer); this.frameTimer = undefined; }
  private stopTimers(): void {
    this.stopTimelineTimers(); this.actionTimers.forEach(id => window.clearTimeout(id)); this.actionTimers = [];
    if (this.commentTimer) window.clearInterval(this.commentTimer); if (this.batchTimer) window.clearInterval(this.batchTimer);
    if (this.watchdog) window.clearTimeout(this.watchdog); this.commentTimer = undefined; this.batchTimer = undefined; this.watchdog = undefined;
  }
  scrubTo(progress: number): void {
    if (!this.timeline || !this.activePlan || !['TEACHING','PAUSED'].includes(this.machine.status)) return;
    const target = Math.max(0, Math.min(1, progress)) * this.timeline.totalMs;
    this.stopTimelineTimers(); this.providers.tts.cancel(); this.speechToken++;
    this.startedAtTimeline = performance.now() - target;
    for (const action of this.timeline.actions) if ((action.t ?? 0) < target && action.type !== 'speak' && action.type !== 'question') this.stage.applyAction(action);
    const segment = this.activePlan.segments[this.segmentIndex];
    if (segment && this.machine.status === 'TEACHING') this.runTimeline(this.timeline, new Map(), segment, true);
  }
  dispose(): void { this.stopTimers(); this.providers.tts.cancel(); }
}
function topicToPlanSafe(topic: CourseTopic): LessonPlan {
  return { id: topic.id, title: topic.title, lang: topic.lang, objectives: topic.objectives, keyTerms: topic.keyTerms, segments: topic.segments, durationMin: topic.durationMin, disclaimer: DEMO_LABEL };
}
function ActionTimelineSchemaSafe(timeline: ActionTimeline, fallback: ActionTimeline): ActionTimeline {
  const parsed = ActionTimelineSchema.safeParse(timeline);
  if (!parsed.success) { eventLog.add('warn', 'Invalid timeline schema; safe fallback selected.', parsed.error.message); return fallback; }
  return parsed.data;
}