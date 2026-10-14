import type { CourseTopic } from '../data/demo/course';
import type { PublicClassState } from '../orchestrator';
import type { LogEntry } from '../utils/log';

const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
export function controlLayout(courseTitle:string,topics:CourseTopic[],selectedTopicId:string):string{
  return `<div class="app-shell">
    <header class="app-topbar"><a class="brand" href="?"><span class="brand-mark">ज</span><span><strong>जीवित कक्षा</strong><small>LIVE TEACHER STUDIO</small></span></a><div class="topbar-center"><span class="connection-dot"></span><span>Offline demo ready</span><span class="topbar-separator">/</span><span>${esc(courseTitle)}</span></div><div class="topbar-actions"><a class="icon-link" href="?mode=broadcast" target="_blank" rel="noreferrer"><span>▣</span> Broadcast view ↗</a><a class="btn secondary small" href="?mode=settings">⚙ सेटिङ</a></div></header>
    <main class="workspace">
      <section class="stage-column"><div class="stage-heading"><div><p class="eyebrow">BROADCAST PREVIEW <span class="tiny-live"></span></p><h1>३D शिक्षण स्टुडियो</h1></div><div class="stage-heading-actions"><span class="quality-label" data-quality>QUALITY · MEDIUM</span><button class="icon-button" data-action="fullscreen" aria-label="Fullscreen">⛶</button></div></div>
        <div class="stage-frame" id="stage-host"></div>
        <div class="stage-info-row"><div class="stage-info"><span class="avatar-mini">शि</span><div><strong data-ui-title>शासन र सुशासनको अवधारणा</strong><small data-ui-course>लोक सेवा आयोग · अधिकृत स्तर</small></div></div><div class="stage-badges"><span class="status-chip" data-ui-status>IDLE</span><span class="status-chip muted-chip">NEPALI · DEMO</span></div></div>
        <section class="timeline-debug panel-card"><div class="panel-heading compact"><div><h3>Timeline debugger</h3><p>कार्रवाईहरूको समय स्क्रब गरेर हेर्नुहोस्</p></div><span data-timeline-time class="time-code">00:00 / 00:00</span></div><input type="range" min="0" max="1000" value="0" class="scrubber" data-scrub aria-label="Timeline scrubber"/><div class="timeline-ticks"><span>START</span><span>MIDPOINT</span><span>END</span></div><div class="action-chips" data-action-chips><span class="empty-chip">पाठ सुरु गरेपछि timeline देखिन्छ</span></div></section>
      </section>
      <aside class="control-column">
        <section class="panel-card lesson-card"><div class="panel-heading"><div><p class="eyebrow">CLASS CONTROL</p><h2>कक्षा नियन्त्रण</h2></div><span class="online-pill"><i></i> READY</span></div>
          <label class="field-label" for="topic-select">हालको पाठ</label><select id="topic-select" class="dark-select">${topics.map(t=>`<option value="${esc(t.id)}" ${t.id===selectedTopicId?'selected':''}>${esc(t.title)}</option>`).join('')}</select>
          <div class="lesson-metadata"><span>◷ <b data-duration>~${topics.find(t=>t.id===selectedTopicId)?.durationMin??8} min</b></span><span>♧ <b>${topics.length} topics</b></span><span>◉ <b data-topic-counter>1 / ${topics.length}</b></span></div>
          <div class="primary-controls"><button class="btn primary start-button" data-action="start"><span>▶</span><span data-start-label>कक्षा सुरु गर्नुहोस्</span></button><button class="btn control-square" data-action="pause" title="Pause / resume">Ⅱ</button><button class="btn control-square" data-action="repeat" title="Repeat segment">↺</button></div>
          <div class="secondary-controls"><button class="btn secondary" data-action="next">अर्को खण्ड <span>→</span></button><button class="btn secondary" data-action="skip">Skip ⤼</button><button class="btn danger ghost-danger" data-action="stop">End class</button></div>
        </section>
        <section class="panel-card agenda-card"><div class="panel-heading"><div><h3>आजको पाठ्यक्रम</h3><p>PSC Officer · शासन प्रणाली</p></div><button class="text-button" data-action="settings">सम्पादन ↗</button></div><div class="topic-list" data-topic-list>${topics.map((t,i)=>`<button class="topic-row ${t.id===selectedTopicId?'active':''}" data-topic-id="${esc(t.id)}"><span class="topic-number">${String(i+1).padStart(2,'0')}</span><span class="topic-row-copy"><strong>${esc(t.title.replace(/^\d+\.\s*/,''))}</strong><small>${t.segments.length} lesson segment${t.segments.length===1?'':'s'}</small></span><span class="topic-state">${t.id===selectedTopicId?'●':'○'}</span></button>`).join('')}</div></section>
        <section class="panel-card comments-card"><div class="panel-heading"><div><h3>Audience comments</h3><p>Viewer engagement · demo/mock stream</p></div><span class="count-pill" data-comment-count>0</span></div><form class="comment-inject" data-comment-form><input name="author" placeholder="नाम" aria-label="Comment author" value="दर्शक"/><input name="text" placeholder="नेपाली टिप्पणी लेख्नुहोस्…" aria-label="Comment text" required maxlength="420"/><select name="platform" aria-label="Platform"><option value="youtube">YT</option><option value="facebook">FB</option></select><button class="btn primary icon-submit" type="submit" title="Inject comment">＋</button></form><div class="comment-queue" data-comment-queue><div class="queue-empty">अहिलेसम्म टिप्पणी छैन।<small>Demo feed वा manual injection प्रयोग गर्नुहोस्।</small></div></div><div class="parked-summary"><span>◷ पछि जवाफ दिने</span><b data-parked-count>0</b></div></section>
        <section class="panel-card log-card"><div class="panel-heading"><div><h3>Event log</h3><p>अन्तिम runtime घटनाहरू</p></div><button class="text-button" data-action="clear-log">Clear</button></div><div class="event-log" data-event-log><span class="muted">कक्षा सुरु भएपछि घटनाहरू देखिन्छन्।</span></div></section>
      </aside>
    </main>
    <footer class="app-footer"><span>◈ Procedural 3D · timeline-driven · provider-agnostic</span><span>${esc('DEMO — प्रयोगअघि आधिकारिक स्रोतबाट पुष्टि गर्नुहोस्')}</span><span>v0.1 · local-first</span></footer>
    <div class="app-toast-area" aria-live="polite"></div>
  </div>`;
}
export function renderState(root:HTMLElement,state:PublicClassState,topics:CourseTopic[]):void{
  const set=(selector:string,value:string)=>{const e=root.querySelector<HTMLElement>(selector);if(e)e.textContent=value;};
  set('[data-ui-status]',state.status);set('[data-ui-title]',state.segmentTitle||state.topicTitle||'शासन प्रणाली');set('[data-topic-counter]',`${state.topicIndex+1} / ${state.totalTopics}`);set('[data-parked-count]',String(state.parkedComments));set('[data-comment-count]',String(state.parkedComments));
  const status=root.querySelector<HTMLElement>('[data-ui-status]');if(status)status.className=`status-chip status-${state.status.toLowerCase()}`;
  const startLabel=root.querySelector<HTMLElement>('[data-start-label]');if(startLabel)startLabel.textContent=state.status==='TEACHING'?'कक्षा चलिरहेको छ':state.status==='PAUSED'?'पुनः सुरु गर्नुहोस्':state.status==='ENDED'?'पुनः सुरु गर्नुहोस्':'कक्षा सुरु गर्नुहोस्';
  const topicSelect=root.querySelector<HTMLSelectElement>('#topic-select');if(topicSelect&&topics[state.topicIndex])topicSelect.value=topics[state.topicIndex].id;
  const duration=root.querySelector<HTMLElement>('[data-duration]');if(duration&&topics[state.topicIndex])duration.textContent=`~${topics[state.topicIndex].durationMin} min`;
  const list=root.querySelector<HTMLElement>('[data-topic-list]');if(list){list.querySelectorAll<HTMLElement>('[data-topic-id]').forEach(row=>{const id=row.dataset.topicId;row.classList.toggle('active',id===topics[state.topicIndex]?.id);const stateEl=row.querySelector('.topic-state');if(stateEl)stateEl.textContent=id===topics[state.topicIndex]?.id?'●':'○';});}
  const scrub=root.querySelector<HTMLInputElement>('[data-scrub]');if(scrub&&state.status!=='TEACHING')scrub.value=String(Math.round(state.progress*1000));
}
export function renderLogs(root:HTMLElement,rows:readonly LogEntry[]):void{
  const log=root.querySelector<HTMLElement>('[data-event-log]');if(!log)return;
  log.innerHTML=rows.slice(-14).reverse().map(row=>`<div class="log-row log-${row.level}"><time>${new Date(row.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time><span>${esc(row.message)}</span></div>`).join('')||'<span class="muted">कुनै घटना छैन।</span>';
}