import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-devanagari/600.css';
import '@fontsource/noto-sans-devanagari/700.css';
import './styles.css';
import type { Action, Comment } from './contracts';
import { loadCourse } from './data/course-store';
import { DEMO_LABEL } from './data/demo/course';
import { LiveClassOrchestrator, type PublicClassState, type DirectorStage, type FeaturedComment } from './orchestrator';
import { StudioStage } from './stage/scene';
import { mountSettings } from './ui/settings';
import { controlLayout, renderLogs, renderState } from './ui/control';
import { eventLog } from './utils/log';
import { getSettings } from './providers/settings';

declare global {
  interface Window {
    __liveClass?: {
      start: (topic?: number | string) => Promise<void>;
      pause: () => Promise<void>;
      next: () => Promise<void>;
      pushComment: (comment: unknown) => void;
      getState: () => PublicClassState | undefined;
      stop: () => void;
    };
    __liveAudioStream?: MediaStream;
  }
}

class FallbackStage implements DirectorStage {
  private note: HTMLElement;
  constructor(host: HTMLElement, error: unknown) { host.innerHTML = `<div class="webgl-error"><strong>३D stage सुरु हुन सकेन</strong><p>यस ब्राउजरमा WebGL उपलब्ध छैन वा renderer आरम्भ हुन असफल भयो। कक्षा नियन्त्रण र timeline भने जारी रहन्छ।</p><pre>${escapeHtml(String(error))}</pre><div data-fallback-note></div></div>`; this.note=host.querySelector('[data-fallback-note]') as HTMLElement; }
  applyAction(_action: Action): void {} setLessonTitle(_title: string): void {} setWord(_index: number, _word: string): void {} setProgress(_progress: number, _totalMs: number): void {} setStatus(_status: PublicClassState['status']): void {} featureComment(_value: FeaturedComment|null): void {} showMessage(message: string): void { if(this.note)this.note.textContent=message; } setQuality(_quality: 'low'|'medium'|'high'): void {} dispose(): void {}
}

const app = document.querySelector<HTMLElement>('#app')!;
if (!app) throw new Error('Missing #app host element');
const url = new URL(window.location.href);
const queryMode = url.searchParams.get('mode');
const pathname = url.pathname.replace(/\/+$/, '');
const settingsMode = queryMode === 'settings' || pathname.endsWith('/settings');

if (settingsMode) {
  mountSettings(app);
} else {
  const course = loadCourse();
  const selectedPreview = url.searchParams.get('preview');
  const requestedLesson = url.searchParams.get('lesson') ?? selectedPreview;
  const foundInitialIndex = course.topics.findIndex(topic => topic.id === requestedLesson);
  const initialIndex = Math.max(0, foundInitialIndex);
  const broadcast = queryMode === 'broadcast' || pathname.endsWith('/broadcast');
  const settings = getSettings();
  if (broadcast) {
    document.body.classList.add('broadcast-body'); app.className = 'app-broadcast';
    app.innerHTML = '<main class="broadcast-host" id="stage-host" aria-label="Live teaching broadcast stage"></main>';
  } else {
    app.innerHTML = controlLayout(course.title, course.topics, course.topics[initialIndex]?.id ?? course.topics[0]?.id ?? '');
  }
  const stageHost = app.querySelector<HTMLElement>('#stage-host');
  if (!stageHost) throw new Error('Missing 3D stage host');
  let stage: StudioStage | FallbackStage;
  try {
    stage = new StudioStage(stageHost, broadcast);
  } catch (error) {
    stage = new FallbackStage(stageHost, error);
    eventLog.add('error', '3D renderer उपलब्ध भएन; सुरक्षित control fallback प्रयोग हुँदैछ।', error);
  }
  stage.setQuality((url.searchParams.get('quality') as 'low'|'medium'|'high') || settings.quality);
  const orchestrator = new LiveClassOrchestrator(stage, state => {
    if (broadcast) return;
    renderState(app, state, course.topics);
    const scrub = app.querySelector<HTMLInputElement>('[data-scrub]');
    if (scrub && document.activeElement !== scrub) scrub.value = String(Math.round(state.progress * 1000));
    updateTimeline(); updateCommentQueue();
    const quality = app.querySelector<HTMLElement>('[data-quality]');
    if (quality) quality.textContent = `QUALITY · ${getSettings().quality.toUpperCase()}`;
  });
  void orchestrator.loadCourse(course.title, course.topics);
  const currentState = () => orchestrator.state;
  window.__liveClass = {
    start: async (topic?: number|string) => {
      const index = typeof topic === 'string' ? Math.max(0, course.topics.findIndex(t => t.id === topic)) : typeof topic === 'number' ? topic : (requestedLesson ? initialIndex : orchestrator.state.topicIndex);
      await orchestrator.start(index);
    },
    pause: async () => { if (orchestrator.state.status === 'PAUSED') await orchestrator.resume(); else await orchestrator.pause(); },
    next: async () => { await orchestrator.next(); },
    pushComment: (comment: unknown) => { orchestrator.pushComment(comment); updateCommentQueue(); },
    getState: () => currentState(),
    stop: () => orchestrator.stop(),
  };

  function updateTimeline(): void {
    if (broadcast) return;
    const timeline = orchestrator.activeTimeline; const chipHost = app.querySelector<HTMLElement>('[data-action-chips]');
    if (!chipHost) return;
    if (!timeline) { chipHost.innerHTML = '<span class="empty-chip">पाठ सुरु गरेपछि timeline देखिन्छ</span>'; return; }
    const shown = timeline.actions.slice(0, 12);
    chipHost.innerHTML = shown.map(action => `<span class="action-chip" title="${escapeHtml(JSON.stringify(action))}">${Math.round((action.t ?? 0)/100)/10}s · ${action.type}${action.type==='gesture'?':' + action.name:action.type==='camera'?':' + action.shot:''}</span>`).join('') + (timeline.actions.length>shown.length?`<span class="empty-chip">+${timeline.actions.length-shown.length} actions</span>`:'');
    const state=orchestrator.state;const seconds=Math.floor(state.progress*state.totalMs/1000);const total=Math.floor(state.totalMs/1000);
    const time=app.querySelector<HTMLElement>('[data-timeline-time]');if(time)time.textContent=`${formatTime(seconds)} / ${formatTime(total)}`;
  }
  function updateCommentQueue(): void {
    if (broadcast) return;
    const host=app.querySelector<HTMLElement>('[data-comment-queue]');if(!host)return;
    const queued=orchestrator.parkedComments;
    if(!queued.length){host.innerHTML='<div class="queue-empty">अहिलेसम्म पार्क गरिएको टिप्पणी छैन।<small>Demo feed वा manual injection प्रयोग गर्नुहोस्।</small></div>';return;}
    host.innerHTML=queued.slice(0,7).map(comment=>`<article class="queue-item"><div class="queue-item-head"><strong>${escapeHtml(comment.author)}</strong><small>${comment.platform==='youtube'?'YT':'FB'} · ${new Date(comment.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div><p>${escapeHtml(comment.text)}</p><span class="queue-tag">उत्तरका लागि queued</span></article>`).join('');
  }
  function notify(message:string,tone:'success'|'error'='success'):void{const host=app.querySelector<HTMLElement>('.app-toast-area');if(!host)return;const e=document.createElement('div');e.className=`toast ${tone}`;e.textContent=message;host.append(e);window.setTimeout(()=>e.remove(),4000);}
  if (!broadcast) {
    const topicSelect=app.querySelector<HTMLSelectElement>('#topic-select');
    topicSelect?.addEventListener('change',()=>{const index=course.topics.findIndex(topic=>topic.id===topicSelect.value);void orchestrator.goToTopic(Math.max(0,index));});
    app.querySelectorAll<HTMLElement>('[data-topic-id]').forEach(row=>row.addEventListener('click',()=>{const index=course.topics.findIndex(topic=>topic.id===row.dataset.topicId);void orchestrator.goToTopic(index);}));
    app.querySelectorAll<HTMLElement>('[data-action]').forEach(element=>element.addEventListener('click',()=>{
      const action=element.dataset.action;
      if(action==='start'){if(orchestrator.state.status==='PAUSED')void orchestrator.resume();else void orchestrator.start(orchestrator.state.topicIndex);}
      else if(action==='pause'){if(orchestrator.state.status==='PAUSED')void orchestrator.resume();else void orchestrator.pause();}
      else if(action==='next')void orchestrator.next();
      else if(action==='skip')void orchestrator.skip();
      else if(action==='repeat')void orchestrator.repeat();
      else if(action==='stop')orchestrator.stop();
      else if(action==='settings'){url.search='?mode=settings';window.location.href=url.toString();}
      else if(action==='fullscreen'){const target=app.querySelector<HTMLElement>('.stage-frame');if(target?.requestFullscreen)void target.requestFullscreen();}
      else if(action==='clear-log'){const log=app.querySelector<HTMLElement>('[data-event-log]');if(log)log.innerHTML='<span class="muted">Log view cleared (runtime events continue).</span>';}
    }));
    app.querySelector<HTMLInputElement>('[data-scrub]')?.addEventListener('change',event=>orchestrator.scrubTo(Number((event.target as HTMLInputElement).value)/1000));
    const commentForm=app.querySelector<HTMLFormElement>('[data-comment-form]');
    commentForm?.addEventListener('submit',event=>{event.preventDefault();const data=new FormData(commentForm);const raw:Comment={id:`manual-${Date.now()}-${Math.random().toString(16).slice(2,7)}`,author:String(data.get('author')||'दर्शक'),text:String(data.get('text')||''),ts:Date.now(),platform:String(data.get('platform')||'youtube') as Comment['platform']};orchestrator.pushComment(raw);(commentForm.elements.namedItem('text') as HTMLInputElement).value='';updateCommentQueue();notify('टिप्पणी कक्षा queue मा थपियो।');});
    renderLogs(app,eventLog.all());
    eventLog.subscribe(rows=>renderLogs(app,rows));
    stage.showMessage(`${DEMO_LABEL} · कक्षा सुरु गर्न दायाँको बटन थिच्नुहोस्।`,'warn');
  } else {
    const autostart=url.searchParams.get('autostart')==='1';
    stage.showMessage(autostart?'प्रसारण स्वतः सुरु हुँदैछ…':`प्रसारण सुरु गर्न window.__liveClass.start() वा ?autostart=1 प्रयोग गर्नुहोस्। ${DEMO_LABEL}`,'info');
    if(autostart){void orchestrator.start(initialIndex).catch(error=>{eventLog.add('error','Broadcast autostart failed; stage remains alive.',error);stage.showMessage('कक्षा सुरु गर्न नसकिए पनि stage चलिरहन्छ। '+DEMO_LABEL,'warn');});}
  }

  window.addEventListener('message',event=>{
    // Small capture-pipeline bridge. Keep messages command-only; arbitrary code is never evaluated.
    const data=event.data as {target?:string;type?:string;command?:string;action?:string;topic?:string|number;comment?:unknown};
    if(!data || (data.target!=='liveClass' && data.type!=='liveClass'))return;
    const command=data.command??data.action;
    if(command==='start')void window.__liveClass?.start(data.topic);
    else if(command==='pause')void window.__liveClass?.pause();
    else if(command==='next')void window.__liveClass?.next();
    else if(command==='stop')window.__liveClass?.stop();
    else if(command==='pushComment' && data.comment)window.__liveClass?.pushComment(data.comment);
  });
  window.addEventListener('beforeunload',()=>{orchestrator.dispose();stage.dispose();});
}
function formatTime(seconds:number):string{return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;}
function escapeHtml(value:string):string{return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));}