import { DEMO_LABEL, type Course, type CourseTopic } from '../data/demo/course';
import { loadCourse, saveCourse, resetCourse } from '../data/course-store';
import { createProviders } from '../providers';
import { DEFAULT_SETTINGS, getSettings, saveSettings, type AppSettings } from '../providers/settings';
import { eventLog } from '../utils/log';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] ?? c));
const selected = (a: unknown,b: unknown) => a===b?'selected':'';

export function mountSettings(root: HTMLElement): void {
  let course = loadCourse(); let activeTopicId = course.topics[0]?.id ?? '';
  const settings = getSettings();
  root.innerHTML = `
    <div class="settings-shell">
      <header class="app-topbar settings-topbar"><a class="brand" href="?"><span class="brand-mark">ज</span><span><strong>जीवित कक्षा</strong><small>Studio settings</small></span></a><div class="topbar-actions"><span class="safe-note">लोकल स्टोरेज · demo data</span><button class="btn secondary" data-back>← स्टुडियोमा फर्कनुहोस्</button></div></header>
      <main class="settings-main">
        <div class="settings-heading"><div><p class="eyebrow">CONTROL ROOM / CONFIGURATION</p><h1>कक्षा सेटिङ</h1><p>सामग्री, API प्रदायक, TTS र प्रसारण विकल्प व्यवस्थापन गर्नुहोस्।</p></div><span class="demo-pill">DEMO · पुष्टि आवश्यक</span></div>
        <div class="settings-grid">
          <aside class="settings-nav"><a href="#content" class="active">१. पाठ्यक्रम सामग्री</a><a href="#providers">२. API प्रदायक</a><a href="#audio">३. आवाज र क्यामेरा</a><a href="#data">४. आयात / निर्यात</a><a href="#about">५. सीमितता</a></aside>
          <div class="settings-content">
            <section class="settings-card" id="content"><div class="section-heading"><div><span class="section-kicker">COURSE EDITOR</span><h2>पाठ्यक्रम → विषय → खण्ड</h2></div><span class="muted">${course.topics.length} विषय</span></div>
              <div class="editor-columns"><div class="topic-tree"><label for="topic-selector">विषय छान्नुहोस्</label><select id="topic-selector" size="6">${course.topics.map(t=>`<option value="${esc(t.id)}" ${selected(t.id,activeTopicId)}>${esc(t.title)}</option>`).join('')}</select><button class="btn secondary full" id="new-topic">＋ नयाँ विषय</button></div>
                <form id="topic-form" class="topic-form"><div class="field-grid"><label>विषय शीर्षक<input name="title" required /></label><label>लक्षित अवधि (मिनेट)<input name="durationMin" type="number" min="1" max="180" required /></label><label>कठिनाइ<select name="difficulty"><option value="beginner">आधारभूत</option><option value="intermediate">मध्यम</option><option value="advanced">उन्नत</option></select></label><label>भाषा<select name="lang"><option value="ne">नेपाली</option><option value="en">English</option></select></label></div>
                  <label>सिकाइ उद्देश्य (प्रति लाइन एउटा)<textarea name="objectives" rows="3"></textarea></label><label>मुख्य शब्द (अल्पविरामले छुट्याउनुहोस्)<input name="keyTerms" /></label><label>स्रोत / कानुनी सन्दर्भ (प्रति लाइन एउटा)<textarea name="references" rows="2"></textarea></label><label>नोट तथा सामग्री<textarea name="notes" rows="6" placeholder="आफ्नो नोट वा markdown-जस्तो plain text राख्नुहोस्"></textarea></label>
                  <div class="editor-actions"><button class="btn primary" type="submit">परिवर्तन सुरक्षित गर्नुहोस्</button><button class="btn secondary" id="generate-plan" type="button">✦ AI बाट तयार</button><button class="btn secondary" id="regenerate-segment" type="button">खण्ड timeline फेरि बनाउनुहोस्</button><button class="btn secondary" id="preview-topic" type="button">▶ 3D Preview</button></div>
                </form></div>
              <div class="advanced-editor"><label for="timeline-json">Advanced: active topic को timeline JSON</label><textarea id="timeline-json" rows="7" spellcheck="false"></textarea><div class="inline-actions"><button class="btn secondary" id="save-timeline">JSON लागू गर्नुहोस्</button><span class="muted">Invalid JSON भए हालको timeline जोगाइन्छ।</span></div></div>
            </section>
            <section class="settings-card" id="providers"><div class="section-heading"><div><span class="section-kicker">ADAPTER SETTINGS</span><h2>API प्रदायक</h2></div><span class="muted">कुञ्जी build मा समावेश हुँदैन</span></div>
              <form id="settings-form"><div class="field-grid"><label>API Base URL<input name="apiBaseUrl" value="${esc(settings.apiBaseUrl)}" placeholder="http://localhost:8787" /></label><label>Auth header<input name="authHeader" value="${esc(settings.authHeader)}" placeholder="Authorization" /></label><label class="span-two">Auth value / Bearer token<input name="authValue" type="password" autocomplete="off" value="${esc(settings.authValue)}" placeholder="खाली राख्दा authentication बन्द हुन्छ" /></label>
                <label>Planner<select name="planner"><option value="mock" ${selected(settings.providers.planner,'mock')}>Mock / offline</option><option value="http" ${selected(settings.providers.planner,'http')}>HTTP endpoint</option></select></label><label>Director<select name="director"><option value="mock" ${selected(settings.providers.director,'mock')}>Demo timeline</option><option value="http" ${selected(settings.providers.director,'http')}>HTTP endpoint</option></select></label><label>TTS<select name="tts"><option value="browser" ${selected(settings.providers.tts,'browser')}>Browser speechSynthesis</option><option value="mock" ${selected(settings.providers.tts,'mock')}>Mock / silent timing</option><option value="http" ${selected(settings.providers.tts,'http')}>HTTP audio endpoint</option></select></label><label>Comment responder<select name="responder"><option value="mock" ${selected(settings.providers.responder,'mock')}>Local rules</option><option value="http" ${selected(settings.providers.responder,'http')}>HTTP endpoint</option></select></label><label>Comment source<select name="commentSource"><option value="mock" ${selected(settings.providers.commentSource,'mock')}>Mock feed</option><option value="http" ${selected(settings.providers.commentSource,'http')}>HTTP polling</option></select></label>
                ${Object.entries(settings.paths).map(([key,value])=>`<label>${({plan:'Planner path',direct:'Director path',tts:'TTS path',respond:'Respond path',comments:'Comments path',reply:'Reply path'} as Record<string,string>)[key]}<input name="path_${key}" value="${esc(value)}" /></label>`).join('')}
              </div><div class="inline-actions"><button class="btn primary" type="submit">API सेटिङ सुरक्षित गर्नुहोस्</button><button class="btn secondary" id="test-connection" type="button">Mock / endpoint जाँच</button><span id="connection-result" class="muted" aria-live="polite"></span></div></form>
            </section>
            <section class="settings-card" id="audio"><div class="section-heading"><div><span class="section-kicker">BROADCAST</span><h2>आवाज र प्रसारण</h2></div></div>
              <form id="audio-form"><div class="field-grid"><label>भाषा<select name="lang"><option value="ne" ${selected(settings.lang,'ne')}>नेपाली</option><option value="en" ${selected(settings.lang,'en')}>English</option></select></label><label>Teaching style<select name="style"><option value="formal" ${selected(settings.style,'formal')}>औपचारिक</option><option value="friendly" ${selected(settings.style,'friendly')}>मैत्रीपूर्ण</option><option value="exam-oriented" ${selected(settings.style,'exam-oriented')}>परीक्षामुखी</option></select></label><label>Browser voice<select name="voiceURI" id="voice-picker"><option value="">Auto (नेपाली / हिन्दी प्राथमिकता)</option></select><small id="voice-help">उपलब्ध आवाज जाँच्दै…</small></label><label>Teaching speed <output id="pace-value">${settings.pace.toFixed(2)}×</output><input name="pace" type="range" min="0.6" max="1.4" step="0.05" value="${settings.pace}" /></label><label>Output volume <output id="volume-value">${Math.round(settings.volume*100)}%</output><input name="volume" type="range" min="0" max="1" step="0.05" value="${settings.volume}" /></label><label>Quality preset<select name="quality"><option value="low" ${selected(settings.quality,'low')}>Low · performance</option><option value="medium" ${selected(settings.quality,'medium')}>Medium · default</option><option value="high" ${selected(settings.quality,'high')}>High · broadcast</option></select></label><label>Stream resolution<select name="resolution"><option value="1280x720" ${selected(settings.resolution,'1280x720')}>1280 × 720</option><option value="1920x1080" ${selected(settings.resolution,'1920x1080')}>1920 × 1080</option><option value="2560x1440" ${selected(settings.resolution,'2560x1440')}>2560 × 1440</option></select></label><label>Comment poll interval (ms)<input name="commentIntervalMs" type="number" min="1000" max="30000" step="500" value="${settings.commentIntervalMs}" /></label><label>Comment time budget (%)<input name="answerBudgetRatio" type="number" min="0" max="0.6" step="0.05" value="${settings.answerBudgetRatio}" /></label><label class="check-field"><input name="mockComments" type="checkbox" ${settings.mockComments?'checked':''} /> Demo टिप्पणी फिड सक्रिय गर्नुहोस्</label><label class="check-field"><input name="autoStartBroadcast" type="checkbox" ${settings.autoStartBroadcast?'checked':''} /> Broadcast खोल्दा automatic start (URL flag चाहिन्छ)</label></div><div class="inline-actions"><button class="btn primary" type="submit">आवाज / प्रसारण सेटिङ सुरक्षित गर्नुहोस्</button><span class="muted">Browser speech synthesis stream capture मा स्वतः मिसिँदैन; docs/TTS.md हेर्नुहोस्।</span></div></form>
            </section>
            <section class="settings-card" id="data"><div class="section-heading"><div><span class="section-kicker">PORTABILITY</span><h2>आयात / निर्यात</h2></div></div><p class="body-copy">सम्पूर्ण पाठ्यक्रमलाई JSON का रूपमा सुरक्षित गर्न वा अर्को ब्राउजरमा सार्न सक्नुहुन्छ। सेटिङ र token स्थानीय ब्राउजरको storage मा मात्र राखिन्छन्।</p><div class="inline-actions"><button class="btn primary" id="export-course">पाठ्यक्रम JSON निर्यात</button><label class="btn secondary file-button">JSON आयात<input type="file" id="import-course" accept="application/json,.json" /></label><button class="btn danger" id="reset-course">Demo पाठ्यक्रम पुनर्स्थापना</button></div><textarea id="course-json" rows="8" spellcheck="false" aria-label="Course JSON"></textarea><div class="inline-actions"><button class="btn secondary" id="apply-course-json">JSON बाट पाठ्यक्रम लागू गर्नुहोस्</button><span id="course-result" class="muted"></span></div>
            </section>
            <section class="settings-card" id="about"><div class="section-heading"><div><span class="section-kicker">KNOWN LIMITATIONS</span><h2>हालको prototype को अवस्था</h2></div></div><ul class="limitations"><li>डेमो कानुनी/संवैधानिक सामग्री प्रमाणित स्रोत होइन। प्रत्येक तथ्य आधिकारिक पाठ्यक्रम र कानुनी स्रोतसँग पुष्टि गर्नुहोस्।</li><li>Procedural humanoid, gestures र expressions काम गर्छन्; पूर्ण VRM facial-expression/viseme retargeting आवश्यकताअनुसार विस्तार गर्नुपर्छ।</li><li>Browser speechSynthesis ले सबै ब्राउजरमा Nepali voice वा MediaStream routing दिँदैन। Live capture का लागि HTTP TTS endpoint प्रयोग गर्नुहोस्।</li><li>HTTP adapter ले timeout, सीमित retry र mock fallback प्रयोग गर्छ। Production backend मा authentication, CORS र rate limits छुट्टै मिलाउनुहोस्।</li></ul><p class="demo-disclaimer">${DEMO_LABEL}</p></section>
          </div>
        </div>
      </main>
    </div>`;

  const form = root.querySelector<HTMLFormElement>('#topic-form')!;
  const selector = root.querySelector<HTMLSelectElement>('#topic-selector')!;
  const timelineArea = root.querySelector<HTMLTextAreaElement>('#timeline-json')!;
  const courseJson = root.querySelector<HTMLTextAreaElement>('#course-json')!;
  const toast = (message: string, tone: 'success'|'error'='success') => { const element=document.createElement('div'); element.className=`toast ${tone}`; element.textContent=message; root.append(element); window.setTimeout(()=>element.remove(),4200); };
  const activeTopic = () => course.topics.find(topic=>topic.id===activeTopicId)!;
  const saveActiveTopicFromForm = () => {
    const topic=activeTopic(); if(!topic)return;
    const fd=new FormData(form);
    topic.title=String(fd.get('title')||topic.title); topic.durationMin=Number(fd.get('durationMin')||topic.durationMin);
    topic.difficulty=String(fd.get('difficulty')||topic.difficulty) as CourseTopic['difficulty']; topic.lang=String(fd.get('lang')||topic.lang) as CourseTopic['lang'];
    topic.objectives=String(fd.get('objectives')||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    topic.keyTerms=String(fd.get('keyTerms')||'').split(',').map(s=>s.trim()).filter(Boolean);
    topic.references=String(fd.get('references')||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean); topic.notes=String(fd.get('notes')||'');
    const first=topic.segments[0]; if(first){ first.title=topic.title; first.notes=topic.notes; first.durationMin=topic.durationMin; }
    saveCourse(course); courseJson.value=JSON.stringify(course,null,2); renderTopicList();
  };
  const loadTopicToForm = () => {
    const topic=activeTopic(); if(!topic)return;
    (form.elements.namedItem('title') as HTMLInputElement).value=topic.title;
    (form.elements.namedItem('durationMin') as HTMLInputElement).value=String(topic.durationMin);
    (form.elements.namedItem('difficulty') as HTMLSelectElement).value=topic.difficulty;
    (form.elements.namedItem('lang') as HTMLSelectElement).value=topic.lang;
    (form.elements.namedItem('objectives') as HTMLTextAreaElement).value=topic.objectives.join('\n');
    (form.elements.namedItem('keyTerms') as HTMLInputElement).value=topic.keyTerms.join(', ');
    (form.elements.namedItem('references') as HTMLTextAreaElement).value=topic.references.join('\n');
    (form.elements.namedItem('notes') as HTMLTextAreaElement).value=topic.notes;
    timelineArea.value=JSON.stringify(topic.segments[0]?.timeline??{},null,2); courseJson.value=JSON.stringify(course,null,2);
  };
  const renderTopicList = () => { selector.innerHTML=course.topics.map(t=>`<option value="${esc(t.id)}" ${selected(t.id,activeTopicId)}>${esc(t.title)}</option>`).join(''); };
  const goHome = () => { const home=new URL(location.href); if(home.pathname.endsWith('/settings')) home.pathname=home.pathname.slice(0,-8)||'/'; home.search=''; home.hash=''; location.href=home.toString(); };
  root.querySelectorAll<HTMLAnchorElement>('a[href="?"]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();goHome();}));
  root.querySelector('[data-back]')?.addEventListener('click',goHome);
  selector.addEventListener('change',()=>{ saveActiveTopicFromForm(); activeTopicId=selector.value; loadTopicToForm(); });
  form.addEventListener('submit',event=>{event.preventDefault();try{saveActiveTopicFromForm();toast('विषय सुरक्षित भयो।');}catch(e){toast(`सेभ असफल: ${String(e)}`,'error');}});
  root.querySelector('#new-topic')?.addEventListener('click',()=>{
    saveActiveTopicFromForm(); const id=`topic-${Date.now()}`; const topic:CourseTopic={id,title:'नयाँ विषय',objectives:[],keyTerms:[],notes:'डेमो सामग्री — आधिकारिक स्रोतबाट पुष्टि गर्नुहोस्।',references:[],durationMin:5,difficulty:'beginner',lang:'ne',segments:[{id:`${id}-seg-01`,title:'नयाँ विषय',text:'परिभाषा, व्याख्या, उदाहरण र पुनरावलोकन।',durationMin:5,notes:''}]};
    course.topics.push(topic);activeTopicId=id;renderTopicList();loadTopicToForm();saveCourse(course);toast('नयाँ विषय थपियो।');
  });
  root.querySelector('#save-timeline')?.addEventListener('click',()=>{try{const parsed=JSON.parse(timelineArea.value);const topic=activeTopic();if(!topic.segments[0])throw new Error('पहिलो खण्ड उपलब्ध छैन');topic.segments[0].timeline=parsed;saveCourse(course);courseJson.value=JSON.stringify(course,null,2);toast('Timeline JSON लागू गरियो।');}catch(e){toast(`JSON मान्य छैन: ${String(e)}`,'error');}});
  root.querySelector('#generate-plan')?.addEventListener('click',async()=>{
    try{saveActiveTopicFromForm();const topic=activeTopic();const config=getSettings();const {planner}=createProviders();const plan=await planner.plan({topic:topic.title,notes:topic.notes,objectives:topic.objectives,durationMin:topic.durationMin,style:config.style,lang:config.lang});
      topic.keyTerms=plan.keyTerms;topic.objectives=plan.objectives;topic.segments=plan.segments;saveCourse(course);loadTopicToForm();toast('Planner ले lesson plan फर्कायो। Demo output भए पुष्टि गर्नुहोस्।');
    }catch(e){toast(`Planner असफल: ${String(e)}`,'error');}
  });
  root.querySelector('#regenerate-segment')?.addEventListener('click',async()=>{
    try{saveActiveTopicFromForm();const topic=activeTopic();const seg=topic.segments[0];if(!seg)throw new Error('खण्ड भेटिएन');const {director}=createProviders();const plan={id:topic.id,title:topic.title,lang:topic.lang,objectives:topic.objectives,keyTerms:topic.keyTerms,segments:topic.segments,durationMin:topic.durationMin};seg.timeline=await director.direct(seg,plan);timelineArea.value=JSON.stringify(seg.timeline,null,2);saveCourse(course);toast('Timeline फेरि तयार भयो।');
    }catch(e){toast(`Timeline तयार भएन: ${String(e)}`,'error');}
  });
  root.querySelector('#preview-topic')?.addEventListener('click',()=>{saveActiveTopicFromForm();const home=new URL(location.href);home.pathname=home.pathname.endsWith('/settings')?home.pathname.slice(0,-8)||'/':home.pathname;home.search=`?preview=${encodeURIComponent(activeTopicId)}`;location.href=home.toString();});

  const settingsForm=root.querySelector<HTMLFormElement>('#settings-form')!;
  settingsForm.addEventListener('submit',event=>{event.preventDefault();const fd=new FormData(settingsForm);const current=getSettings();
    const next:AppSettings={...current,apiBaseUrl:String(fd.get('apiBaseUrl')||''),authHeader:String(fd.get('authHeader')||'Authorization'),authValue:String(fd.get('authValue')||''),providers:{planner:fd.get('planner') as AppSettings['providers']['planner'],director:fd.get('director') as AppSettings['providers']['director'],tts:fd.get('tts') as AppSettings['providers']['tts'],responder:fd.get('responder') as AppSettings['providers']['responder'],commentSource:fd.get('commentSource') as AppSettings['providers']['commentSource']},paths:{plan:String(fd.get('path_plan')||'/plan'),direct:String(fd.get('path_direct')||'/direct'),tts:String(fd.get('path_tts')||'/tts'),respond:String(fd.get('path_respond')||'/respond'),comments:String(fd.get('path_comments')||'/comments'),reply:String(fd.get('path_reply')||'/comments/reply')}};
    saveSettings(next);toast('API settings स्थानीय रूपमा सुरक्षित भयो।');
  });
  root.querySelector('#test-connection')?.addEventListener('click',async()=>{const res=root.querySelector<HTMLElement>('#connection-result')!;const base=(settingsForm.elements.namedItem('apiBaseUrl') as HTMLInputElement).value.replace(/\/$/,'');res.textContent='जाँच हुँदैछ…';try{const response=await fetch(`${base}/health`,{signal:AbortSignal.timeout(3500)});res.textContent=response.ok?'✓ endpoint reachable':'HTTP '+response.status;}catch{res.textContent='Endpoint भेटिएन; mock mode ले offline काम गर्छ।';}});
  const audioForm=root.querySelector<HTMLFormElement>('#audio-form')!;
  const updateRange=(name:string,id:string,suffix:string,multiplier=1)=>{const input=audioForm.elements.namedItem(name) as HTMLInputElement;const output=root.querySelector<HTMLOutputElement>(id)!;input.addEventListener('input',()=>output.value=(Number(input.value)*multiplier).toFixed(multiplier===1?0:2)+suffix);};
  updateRange('pace','#pace-value','×');updateRange('volume','#volume-value','%',100);
  const voicePicker=root.querySelector<HTMLSelectElement>('#voice-picker')!;const voiceHelp=root.querySelector<HTMLElement>('#voice-help')!;
  const refreshVoices=()=>{if(!('speechSynthesis'in window)){voiceHelp.textContent='Browser TTS उपलब्ध छैन।';return;}const voices=window.speechSynthesis.getVoices();voicePicker.innerHTML='<option value="">Auto (नेपाली / हिन्दी प्राथमिकता)</option>'+voices.map(v=>`<option value="${esc(v.voiceURI)}" ${selected(v.voiceURI,settings.voiceURI)}>${esc(v.name)} · ${esc(v.lang)}</option>`).join('');const ne=voices.some(v=>/ne[-_]NP/i.test(v.lang));voiceHelp.textContent=ne?'नेपाली voice उपलब्ध छ।':voices.some(v=>/hi[-_]IN/i.test(v.lang))?'नेपाली voice छैन; हिन्दी voice सम्भवतः प्रयोग हुनेछ।':'नेपाली voice भेटिएन। HTTP TTS सिफारिस गरिन्छ।';};
  if('speechSynthesis'in window){window.speechSynthesis.onvoiceschanged=refreshVoices;refreshVoices();}
  audioForm.addEventListener('submit',event=>{event.preventDefault();const fd=new FormData(audioForm);const current=getSettings();const next={...current,lang:fd.get('lang') as AppSettings['lang'],style:fd.get('style') as AppSettings['style'],voiceURI:String(fd.get('voiceURI')||''),pace:Number(fd.get('pace')),volume:Number(fd.get('volume')),quality:fd.get('quality') as AppSettings['quality'],resolution:fd.get('resolution') as AppSettings['resolution'],commentIntervalMs:Number(fd.get('commentIntervalMs')),answerBudgetRatio:Number(fd.get('answerBudgetRatio')),mockComments:fd.has('mockComments'),autoStartBroadcast:fd.has('autoStartBroadcast')};saveSettings(next);toast('आवाज र प्रसारण सेटिङ सुरक्षित भयो।');});

  root.querySelector('#export-course')?.addEventListener('click',()=>downloadJson(course,`${course.id||'live-teacher-course'}.json`));
  root.querySelector<HTMLInputElement>('#import-course')?.addEventListener('change',async event=>{const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;try{const parsed=JSON.parse(await file.text()) as Course;if(!Array.isArray(parsed.topics)||!parsed.topics.length)throw new Error('topics array आवश्यक छ');course=parsed;activeTopicId=course.topics[0].id;saveCourse(course);renderTopicList();loadTopicToForm();courseJson.value=JSON.stringify(course,null,2);toast('JSON पाठ्यक्रम आयात भयो।');}catch(e){toast(`आयात असफल: ${String(e)}`,'error');}});
  root.querySelector('#apply-course-json')?.addEventListener('click',()=>{try{const parsed=JSON.parse(courseJson.value) as Course;if(!Array.isArray(parsed.topics)||!parsed.topics.length)throw new Error('topics array आवश्यक छ');course=parsed;activeTopicId=course.topics[0].id;saveCourse(course);renderTopicList();loadTopicToForm();toast('पाठ्यक्रम JSON लागू भयो।');}catch(e){root.querySelector('#course-result')!.textContent=String(e);toast(`JSON लागू भएन: ${String(e)}`,'error');}});
  root.querySelector('#reset-course')?.addEventListener('click',()=>{course=resetCourse();activeTopicId=course.topics[0].id;renderTopicList();loadTopicToForm();toast('Demo पाठ्यक्रम पुनर्स्थापित भयो।');});
  loadTopicToForm();
}
function downloadJson(value: unknown, filename: string): void { const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}