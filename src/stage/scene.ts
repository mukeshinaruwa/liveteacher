import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Action } from '../contracts';
import { eventLog } from '../utils/log';
import type { DirectorStage, FeaturedComment } from '../orchestrator';
import type { ClassStatus } from '../orchestrator/state-machine';
import { getSettings } from '../providers/settings';

type CameraShot = 'wide' | 'medium' | 'close-up' | 'board-focus' | 'over-shoulder';
type Emotion = 'neutral' | 'warm' | 'serious' | 'curious' | 'encouraging' | 'surprised';
type Gesture = 'point_board' | 'open_palm' | 'count_fingers' | 'emphasize' | 'thinking' | 'nod' | 'shake_head' | 'welcome' | 'thumbs_up' | 'walk_to_board' | 'write_on_board' | 'idle';
interface BoardLine { id: string; text: string; highlighted?: boolean; color?: string; strike?: boolean; underline?: boolean }

export class StudioStage implements DirectorStage {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private teacher = new THREE.Group(); private head = new THREE.Group(); private torso?: THREE.Mesh;
  private leftArm?: THREE.Group; private rightArm?: THREE.Group; private leftForearm?: THREE.Group; private rightForearm?: THREE.Group;
  private leftEye?: THREE.Mesh; private rightEye?: THREE.Mesh; private mouth?: THREE.Mesh; private pupils: THREE.Mesh[] = [];
  private baseCamera = new THREE.Vector3(0, 2.15, 7.2); private baseLook = new THREE.Vector3(0, 1.65, 0);
  private targetCamera = this.baseCamera.clone(); private targetLook = this.baseLook.clone();
  private boardCanvas: HTMLCanvasElement; private boardContext: CanvasRenderingContext2D; private boardTexture: THREE.CanvasTexture;
  private boardLines: BoardLine[] = []; private boardTitle = 'आजको पाठ'; private overlay: HTMLElement;
  private progressEl: HTMLElement; private progressText: HTMLElement; private messageEl: HTMLElement; private emotion: Emotion = 'warm'; private gesture: Gesture = 'idle';
  private gestureUntil = 0; private targetLeftArm = new THREE.Euler(); private targetRightArm = new THREE.Euler(); private targetHead = new THREE.Euler(); private teacherTargetX = -0.82; private typingTimers = new Map<string, number>(); private blinkAt = 0; private blinkAmount = 0; private words = ''; private talking = false; private lastSpeechPulse = 0;
  private quality: 'low'|'medium'|'high' = getSettings().quality; private raf = 0; private disposed = false; private modelMixer?: THREE.AnimationMixer; private modelUrl?: string;
  private avatarModel?: THREE.Object3D; private commentTicker: HTMLElement; private statusElement: HTMLElement; private status: ClassStatus = 'IDLE';

  constructor(host: HTMLElement, broadcast = false) {
    this.root = host;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'stage-canvas'; this.canvas.setAttribute('aria-label', 'Three-dimensional teaching studio');
    this.root.append(this.canvas);
    this.overlay = document.createElement('div'); this.overlay.className = `stage-overlay${broadcast ? ' broadcast-overlay' : ''}`;
    this.overlay.innerHTML = `<div class="live-bug"><span class="live-dot"></span> LIVE <span class="live-viewers">● १.२ हजार</span></div><div class="stage-title"><small>लोक सेवा आयोग · अधिकृत स्तर</small><strong data-current-title>शासन प्रणाली</strong><span data-current-word>स्वागत छ!</span></div><div class="stage-lower-third"><span class="lower-avatar">शि</span><div><strong>लोक सेवा तयारी · डेमो कक्षा</strong><small>प्रयोगअघि आधिकारिक स्रोतबाट पुष्टि गर्नुहोस्</small></div></div><div class="stage-progress"><i data-progress></i></div><div class="stage-message" data-message></div><div class="featured-comment" data-featured hidden></div><div class="stage-watermark">DEMO · VERIFY BEFORE USE</div>`;
    this.root.append(this.overlay);
    this.progressEl = this.overlay.querySelector('[data-progress]') as HTMLElement;
    this.progressText = this.overlay.querySelector('[data-current-word]') as HTMLElement;
    this.messageEl = this.overlay.querySelector('[data-message]') as HTMLElement;
    this.commentTicker = this.overlay.querySelector('[data-featured]') as HTMLElement;
    this.statusElement = this.overlay.querySelector('.live-bug') as HTMLElement;
    this.boardCanvas = document.createElement('canvas'); this.boardCanvas.width = 1024; this.boardCanvas.height = 540;
    this.boardContext = this.boardCanvas.getContext('2d')!;
    this.boardTexture = new THREE.CanvasTexture(this.boardCanvas); this.boardTexture.colorSpace = THREE.SRGBColorSpace;
    const initial = this.readSize();
    this.camera = new THREE.PerspectiveCamera(37, initial.width / initial.height, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.quality !== 'low', alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.setQuality(this.quality); this.createRoom(); this.createTeacher(); this.drawBoard();
    this.camera.position.copy(this.baseCamera); this.camera.lookAt(this.baseLook);
    window.addEventListener('resize', this.onResize); this.onResize(); this.animate();
  }
  private readSize() { return { width: Math.max(320, this.root.clientWidth || 1280), height: Math.max(180, this.root.clientHeight || 720) }; }
  private mat(color: THREE.ColorRepresentation, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial { return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
  private createRoom(): void {
    this.scene.background = new THREE.Color('#e6edf6'); this.scene.fog = new THREE.Fog('#e6edf6', 11, 25);
    const hemi = new THREE.HemisphereLight('#f1f7ff', '#6e5f58', 2.1); this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#fff3d9', 3.2); key.position.set(-3, 7, 5); key.castShadow = this.quality !== 'low'; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7; this.scene.add(key);
    const fill = new THREE.DirectionalLight('#a9c7ff', 1.1); fill.position.set(5, 4, -2); this.scene.add(fill);
    const rim = new THREE.PointLight('#e4b97d', 0.65, 10); rim.position.set(-3, 3, -2.8); this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), this.mat('#c8d1dd')); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.04; floor.receiveShadow = true; this.scene.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(18, 8), this.mat('#f3f5f8')); wall.position.set(0, 3.2, -3.8); this.scene.add(wall);
    for (let i = 0; i < 5; i++) { const seam = new THREE.Mesh(new THREE.BoxGeometry(0.018, 6, 0.018), this.mat('#dfe5ed', 0.9)); seam.position.set(-5 + i * 2.5, 3.1, -3.73); this.scene.add(seam); }
    const trim = new THREE.Mesh(new THREE.BoxGeometry(18, 0.13, 0.14), this.mat('#b9a18a')); trim.position.set(0, 0.28, -3.63); this.scene.add(trim);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(7.3, 4.4), new THREE.MeshStandardMaterial({ color: '#e8e4dd', roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.005, 0.1); this.scene.add(rug);
    this.createBoard(); this.createPodium(); this.createNepalFlag(); this.createPlants();
  }
  private createBoard(): void {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.08, 0.14), this.mat('#594537', 0.58)); frame.position.set(0, 2.75, -3.25); frame.castShadow = true; this.scene.add(frame);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(5.58, 2.86), new THREE.MeshStandardMaterial({ map: this.boardTexture, roughness: 0.4, metalness: 0.04 })); board.position.set(0, 2.75, -3.165); this.scene.add(board);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(5.78, 0.11, 0.31), this.mat('#795944')); shelf.position.set(0, 1.19, -3.2); this.scene.add(shelf);
    for (let i = 0; i < 3; i++) { const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.65, 8), this.mat(['#4e86ba','#e8b64d','#4b967b'][i])); pen.rotation.z = Math.PI / 2; pen.position.set(-1.7 + i * 0.36, 1.29, -3.12); this.scene.add(pen); }
  }
  private createPodium(): void {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.05, 0.82), this.mat('#8d6249', 0.7)); base.position.set(0.68, 0.6, 0.18); base.castShadow = true; base.receiveShadow = true; this.scene.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.12, 0.92), this.mat('#a97a58', 0.52)); top.position.set(0.68, 1.18, 0.18); top.castShadow = true; this.scene.add(top);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.3, 0.035), this.mat('#193653', 0.42)); badge.position.set(0.68, 0.72, 0.604); this.scene.add(badge);
    const letters = this.textPlane('लोक सेवा', 320, 100, '#ffffff', '#193653', 30); letters.position.set(0.68, 0.72, 0.625); this.scene.add(letters);
  }
  private textPlane(text: string, width: number, height: number, color: string, bg: string, size: number): THREE.Mesh {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = bg; ctx.fillRect(0,0,width,height); ctx.fillStyle = color; ctx.font = `600 ${size}px "Noto Sans Devanagari", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, width / 2, height / 2);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(width / height, 1), new THREE.MeshBasicMaterial({ map: texture, transparent: false }));
  }
  private createNepalFlag(): void {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.2, 8), this.mat('#b5bdc8', 0.35, 0.6)); pole.position.set(-3.85, 1.1, -2.6); this.scene.add(pole);
    const shape = new THREE.Shape(); shape.moveTo(0, 1.1); shape.lineTo(0.82, 0.65); shape.lineTo(0.53, 0.65); shape.lineTo(0.98, 0.15); shape.lineTo(0, 0.15); shape.lineTo(0, 1.1);
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: '#dc253d', side: THREE.DoubleSide, roughness: 0.8 })); flag.position.set(-3.82, 0.82, -2.57); this.scene.add(flag);
    const border = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ShapeGeometry(shape)), new THREE.LineBasicMaterial({ color: '#173f82' })); border.position.copy(flag.position); border.scale.set(1.03,1.03,1.03); this.scene.add(border);
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.075, 5), new THREE.MeshBasicMaterial({ color: '#ffffff' })); star.position.set(-3.55,1.63,-2.54); this.scene.add(star);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), new THREE.MeshBasicMaterial({ color: '#ffffff' })); moon.position.set(-3.58,1.4,-2.54); this.scene.add(moon);
  }
  private createPlants(): void {
    for (const x of [-4.8, 4.7]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.38,0.55,12), this.mat('#9e725d')); pot.position.set(x,0.26,-2.1); this.scene.add(pot);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.04,1.65,8), this.mat('#527a53')); stem.position.set(x,1.25,-2.1); this.scene.add(stem);
      for (let j=0;j<7;j++) { const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.19,10,8), this.mat(j%2?'#548663':'#3e6f57')); leaf.scale.set(0.6,1.8,0.4); leaf.position.set(x+Math.sin(j*2.2)*0.29,0.8+j*0.2,-2.1+Math.cos(j*2.2)*0.12); leaf.rotation.z = Math.sin(j*2.3)*0.6; this.scene.add(leaf); }
    }
  }
  private limb(parent: THREE.Object3D, material: THREE.Material, length: number, radius: number, x: number, y: number, z: number): THREE.Group {
    const pivot = new THREE.Group(); pivot.position.set(x,y,z); parent.add(pivot);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01,length-radius*2), 4, 8), material); mesh.position.y = -length/2; mesh.castShadow = true; pivot.add(mesh); return pivot;
  }
  private createTeacher(): void {
    const skin = this.mat('#c99069',0.72); const suit = this.mat('#233b59',0.74); const shirt = this.mat('#f4f0e7'); const hair = this.mat('#2b2d38'); const dark = this.mat('#222b37',0.45);
    this.teacher.position.set(-0.82,0,0.22); this.scene.add(this.teacher);
    const legs = new THREE.Group(); legs.position.set(0,0.12,0); this.teacher.add(legs);
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.12,0.7,5,8), dark); legL.position.set(-0.18,0.51,0); legs.add(legL);
    const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.12,0.7,5,8), dark); legR.position.set(0.18,0.51,0); legs.add(legR);
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.12,0.45), dark); shoeL.position.set(-0.18,0.12,0.08); this.teacher.add(shoeL);
    const shoeR = shoeL.clone(); shoeR.position.x=0.18; this.teacher.add(shoeR);
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42,0.62,6,12), suit); this.torso.position.set(0,1.37,0); this.torso.castShadow=true; this.teacher.add(this.torso);
    const collar = new THREE.Mesh(new THREE.ConeGeometry(0.2,0.29,4), shirt); collar.position.set(0,1.78,0.1); collar.rotation.y=Math.PI/4; this.teacher.add(collar);
    const tie = new THREE.Mesh(new THREE.ConeGeometry(0.07,0.48,4), this.mat('#c14c4c')); tie.position.set(0,1.46,0.39); tie.rotation.x=Math.PI; this.teacher.add(tie);
    this.leftArm = this.limb(this.teacher,suit,0.76,0.14,-0.39,1.69,0);
    this.rightArm = this.limb(this.teacher,suit,0.76,0.14,0.39,1.69,0);
    this.leftForearm = this.limb(this.leftArm,skin,0.54,0.095,0,-0.63,0.01);
    this.rightForearm = this.limb(this.rightArm,skin,0.54,0.095,0,-0.63,0.01);
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.12,12,8),skin); handL.position.set(0,-0.87,0.01); this.leftArm.add(handL);
    const handR = handL.clone(); this.rightArm.add(handR);
    this.head.position.set(0,2.1,0.03); this.teacher.add(this.head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.35,20,16),skin); face.scale.set(0.92,1.13,0.9); face.castShadow=true; this.head.add(face);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.355,18,10,0,Math.PI*2,0,Math.PI*0.48),hair); cap.scale.set(1.02,0.88,0.98); cap.position.y=0.12; this.head.add(cap);
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.29,14,10),hair); hairBack.scale.set(1.08,1.0,0.7); hairBack.position.set(0,0.08,-0.13); this.head.add(hairBack);
    const eyeWhite = new THREE.MeshStandardMaterial({ color:'#fffdf7', roughness:0.3 });
    this.leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.067,12,10),eyeWhite); this.leftEye.scale.set(1.1,0.72,0.5); this.leftEye.position.set(-0.125,0.025,0.31); this.head.add(this.leftEye);
    this.rightEye = this.leftEye.clone(); this.rightEye.position.x=0.125; this.head.add(this.rightEye);
    for (const x of [-0.125,0.125]) { const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.031,10,8),dark); pupil.position.set(x,0.02,0.352); this.head.add(pupil); this.pupils.push(pupil); }
    const browsMat = this.mat('#4c3b35');
    for (const x of [-0.125,0.125]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.13,0.025,0.035),browsMat); brow.position.set(x,0.12,0.32); brow.rotation.z=x<0?0.07:-0.07; this.head.add(brow); }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07,8,8),skin); nose.scale.set(0.65,0.9,0.8); nose.position.set(0,-0.045,0.33); this.head.add(nose);
    this.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.13,0.025,0.025),dark); this.mouth.position.set(0,-0.17,0.315); this.head.add(this.mouth);
    const ears = new THREE.Mesh(new THREE.SphereGeometry(0.08,10,8),skin); ears.position.set(-0.32,-0.02,0.01); this.head.add(ears); const ear2=ears.clone(); ear2.position.x=0.32; this.head.add(ear2);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.18,0.12,0.04),this.mat('#d8b55b',0.5,0.3)); badge.position.set(-0.24,1.5,0.355); this.teacher.add(badge);
  }
  private drawBoard(): void {
    const ctx = this.boardContext; const w = this.boardCanvas.width, h = this.boardCanvas.height;
    ctx.clearRect(0,0,w,h); ctx.fillStyle='#fcfcf8'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#1b3656'; ctx.fillRect(0,0,w,85);
    ctx.fillStyle='#f6e7bf'; ctx.font='700 34px "Noto Sans Devanagari", sans-serif'; ctx.textBaseline='middle'; ctx.textAlign='left'; ctx.fillText(this.boardTitle,48,43);
    let y=137;
    for (const [index,line] of this.boardLines.entries()) {
      const isLong=line.text.length>42; const fontSize=isLong?27:32;
      if (line.highlighted) { ctx.fillStyle=line.color==='warm'?'#fff0cf':'#e7f3ff'; ctx.fillRect(26,y-29,w-52,46); }
      ctx.fillStyle=line.color==='danger'?'#ac3e40':line.color==='warm'?'#956a1b':line.color==='blue'?'#28638b':'#203249';
      ctx.font=`${line.highlighted?'700':'500'} ${fontSize}px "Noto Sans Devanagari", sans-serif`; ctx.fillText(`${index+1}. ${line.text}`,45,y);
      const measured=ctx.measureText(`${index+1}. ${line.text}`).width;
      if (line.underline) { ctx.strokeStyle='#c08c35'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(44,y+14); ctx.lineTo(Math.min(w-35,44+measured),y+14); ctx.stroke(); }
      if (line.strike) { ctx.strokeStyle='#b64e4e'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(42,y-9); ctx.lineTo(Math.min(w-35,44+measured),y-9); ctx.stroke(); }
      y += isLong?64:76; if(y>h-35) break;
    }
    this.boardTexture.needsUpdate=true;
  }
  applyAction(action: Action): void {
    switch (action.type) {
      case 'camera': this.setCamera(action.shot, action.ease); break;
      case 'emotion': this.setEmotion(action.name, action.intensity); break;
      case 'gesture': this.doGesture(action.name, action.durationMs ?? 1100); break;
      case 'board': this.boardAction(action.op, action.id, action.text, action.color, action.animate); break;
      case 'visual': this.visualAction(action.op, action.diagram, action.data); break;
      case 'speak': this.talking=true; this.lastSpeechPulse=performance.now(); break;
      case 'transition': this.messageEl.textContent=action.text ?? 'अब अर्को बुँदातर्फ जाऔँ…'; break;
      case 'recap': this.boardTitle='मुख्य बुँदा'; this.boardLines=action.points.map((text,i)=>({ id:`recap-${i}`,text })); this.drawBoard(); break;
      case 'question': this.messageEl.textContent=action.text; this.messageEl.classList.add('visible'); window.setTimeout(()=>this.messageEl.classList.remove('visible'),Math.min(action.think_ms,6000)); break;
      case 'pause': break;
    }
  }
  private boardAction(op: 'write'|'append'|'erase'|'highlight'|'underline'|'strike', id: string, text?: string, color?: string, animate?: 'typewriter'|'fade'|'none'): void {
    const index=this.boardLines.findIndex(l=>l.id===id);
    if(op==='write') { if(index>=0) this.boardLines[index]={ id,text:animate==='typewriter'?'':text??'',color }; else this.boardLines.push({id,text:animate==='typewriter'?'':text??'',color}); }
    else if(op==='append') { if(index>=0) this.boardLines[index].text += animate==='typewriter'?'':text??''; else this.boardLines.push({id,text:animate==='typewriter'?'':text??'',color}); }
    else if(op==='erase') this.boardLines = this.boardLines.filter(l=>l.id!==id);
    else if(index>=0 && op==='highlight') { this.boardLines[index].highlighted=true; this.boardLines[index].color=color??'accent'; }
    else if(index>=0 && op==='underline') this.boardLines[index].underline=true;
    else if(index>=0 && op==='strike') this.boardLines[index].strike=true;
    this.drawBoard();
    if ((op==='write'||op==='append') && animate==='typewriter' && text) this.typewrite(id,text,op==='append');
  }
  private typewrite(id:string,text:string,append:boolean):void {
    const previous=this.typingTimers.get(id); if(previous) window.clearInterval(previous);
    const chars=Array.from(text); let index=0; const timer=window.setInterval(()=>{
      const line=this.boardLines.find(item=>item.id===id); if(!line){window.clearInterval(timer);this.typingTimers.delete(id);return;}
      line.text=(append?line.text:'')+chars.slice(0,++index).join(''); this.drawBoard();
      if(index>=chars.length){window.clearInterval(timer);this.typingTimers.delete(id);}
    },Math.max(18,Math.min(36,900/Math.max(1,chars.length)))); this.typingTimers.set(id,timer);
  }
  private visualAction(op: string, diagram?: string, data?: Record<string, unknown>): void {
    if(op==='hide') { this.boardTitle='आजको पाठ'; this.boardLines=[]; }
    else if(op==='show_diagram') {
      this.boardTitle=diagram==='three-tier-govt'?'संघीय संरचना':diagram==='separation-powers'?'शक्ति पृथकीकरण':diagram??'अवधारणा चित्र';
      if(diagram==='three-tier-govt') this.boardLines=[{id:'d1',text:'संघीय तह',highlighted:true},{id:'d2',text:'प्रदेश तह'},{id:'d3',text:'स्थानीय तह'}];
      else if(diagram==='separation-powers') this.boardLines=[{id:'d1',text:'विधायिका ↔ कार्यपालिका'},{id:'d2',text:'न्यायिक पुनरावलोकन'},{id:'d3',text:'नियन्त्रण र सन्तुलन',highlighted:true}];
      else this.boardLines=Object.entries(data??{}).map(([key,value],i)=>({id:`v${i}`,text:`${key}: ${String(value)}`}));
    } else if(op==='show_key_terms') { this.boardTitle='मुख्य शब्द'; this.boardLines=Object.entries(data??{}).map(([key,value],i)=>({id:`k${i}`,text:`${key}: ${String(value)}`})); }
    else if(op==='show_timeline') { this.boardTitle='क्रमबद्ध प्रक्रिया'; this.boardLines=Object.values(data??{}).map((value,i)=>({id:`t${i}`,text:`${i+1}. ${String(value)}`})); }
    else if(op==='show_comparison') { this.boardTitle='तुलना'; this.boardLines=Object.entries(data??{}).map(([k,v],i)=>({id:`c${i}`,text:`${k} — ${String(v)}`})); }
    else if(op==='show_mind_map') { this.boardTitle='अवधारणा नक्सा'; this.boardLines=Object.entries(data??{}).map(([k,v],i)=>({id:`m${i}`,text:`${k} → ${String(v)}`})); }
    else if(op==='show_prop') { this.boardTitle='सम्झनुहोस्'; this.boardLines=[{id:'prop',text:diagram??'मुख्य अवधारणा',highlighted:true}]; }
    this.drawBoard();
  }
  private setEmotion(name: Emotion, intensity=0.7): void {
    this.emotion=name;
    if(!this.mouth) return;
    const mouthScale = name==='surprised'?1.45:name==='serious'?0.8:name==='encouraging'?1.15:1;
    this.mouth.scale.set(mouthScale, name==='surprised'?2.3:1,1);
    if (this.leftEye) this.leftEye.scale.y=name==='curious'?0.92:0.72;
    if (this.rightEye) this.rightEye.scale.y=name==='curious'?0.92:0.72;
    this.head.rotation.z = name==='curious' ? -0.08*intensity : 0;
  }
  private doGesture(name: Gesture, durationMs: number): void {
    this.gesture=name; this.gestureUntil=performance.now()+Math.max(250,durationMs);
    this.targetLeftArm.set(0,0,0); this.targetRightArm.set(0,0,0); this.targetHead.set(0,0,0); this.teacherTargetX=name==='walk_to_board'?-1.45:-0.82;
    switch(name){
      case 'point_board': this.targetRightArm.set(-0.18,0,-1.05); break;
      case 'open_palm': this.targetLeftArm.set(0,0,0.55); this.targetRightArm.set(-0.15,0,-0.55); break;
      case 'count_fingers': this.targetRightArm.set(-0.15,0,-0.75); break;
      case 'emphasize': this.targetRightArm.set(0,0,-0.42); this.targetLeftArm.set(0,0,0.12); break;
      case 'thinking': this.targetLeftArm.set(0,0,0.45); this.targetRightArm.set(0,0,0.52); this.targetHead.set(-0.08,0,0); break;
      case 'nod': this.targetHead.set(0.12,0,0); break;
      case 'shake_head': this.targetHead.set(0,0.22,0); break;
      case 'welcome': this.targetLeftArm.set(0,0,0.72); this.targetRightArm.set(0,0,-0.72); break;
      case 'thumbs_up': this.targetRightArm.set(-0.2,0,-0.9); break;
      case 'walk_to_board': this.targetRightArm.set(0,0,-0.3); break;
      case 'write_on_board': this.targetRightArm.set(0,0,-1.0); break;
      case 'idle': this.gestureUntil=0; break;
    }
  }
  private setCamera(shot: CameraShot, ease: 'smooth'|'cut'='smooth'): void {
    const positions: Record<CameraShot,{p:THREE.Vector3;look:THREE.Vector3}>={
      'wide':{p:new THREE.Vector3(0,2.55,9.7),look:new THREE.Vector3(0,1.7,-0.4)},
      'medium':{p:new THREE.Vector3(0.1,2.2,7.2),look:new THREE.Vector3(-0.15,1.75,-0.15)},
      'close-up':{p:new THREE.Vector3(-0.9,2.45,4.35),look:new THREE.Vector3(-0.75,2.0,0.15)},
      'board-focus':{p:new THREE.Vector3(0.1,2.65,4.2),look:new THREE.Vector3(0,2.7,-3.0)},
      'over-shoulder':{p:new THREE.Vector3(1.3,2.45,5.2),look:new THREE.Vector3(0.2,2.6,-2.9)},
    };
    const target=positions[shot]; this.targetCamera.copy(target.p); this.targetLook.copy(target.look);
    if(ease==='cut'){ this.camera.position.copy(this.targetCamera); this.camera.lookAt(this.targetLook); }
  }
  setWord(index: number, word: string): void { this.words=word; this.progressText.textContent=word; this.talking=true; this.lastSpeechPulse=performance.now(); }
  setLessonTitle(title: string): void { const el=this.overlay.querySelector<HTMLElement>('[data-current-title]'); if(el) el.textContent=title; }
  setProgress(progress: number, totalMs: number): void { this.progressEl.style.width=`${Math.max(0,Math.min(1,progress))*100}%`; this.progressEl.title=`${Math.round(progress*100)}% · ${Math.round(totalMs/1000)}s`; }
  setStatus(status: ClassStatus): void { this.status=status; this.statusElement.classList.toggle('paused',status==='PAUSED'); const statusText=this.statusElement.querySelector('.live-viewers'); if(statusText) statusText.textContent=status==='PAUSED'?'● PAUSED':status==='ENDED'?'● ENDED':'● १.२ हजार'; }
  showMessage(message: string, kind: 'info'|'warn'|'success'='info'): void { this.messageEl.textContent=message; this.messageEl.className=`stage-message visible ${kind}`; window.clearTimeout(this.messageTimer); this.messageTimer=window.setTimeout(()=>this.messageEl.classList.remove('visible'),6500); }
  private messageTimer=0;
  featureComment(value: FeaturedComment|null): void {
    if(!value){ this.commentTicker.hidden=true; this.commentTicker.innerHTML=''; return; }
    this.commentTicker.hidden=false;
    if(value.phase==='incoming') this.commentTicker.innerHTML=`<span class="comment-platform">${value.comment.platform==='facebook'?'f':'▶'}</span><div><small>${escapeHtml(value.comment.author)} ले सोध्नुभयो</small><strong>${escapeHtml(value.comment.text)}</strong></div>`;
    else this.commentTicker.innerHTML=`<span class="comment-platform answer">✓</span><div><small>${escapeHtml(value.comment.author)} · उत्तर</small><strong>${escapeHtml(value.reply??'धन्यवाद!')}</strong></div>`;
  }
  setQuality(quality: 'low'|'medium'|'high'): void { this.quality=quality; if(this.renderer){ this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,quality==='low'?1:quality==='medium'?1.35:1.8)); this.renderer.shadowMap.enabled=quality!=='low'; this.renderer.shadowMap.type=THREE.PCFSoftShadowMap; this.renderer.setSize(this.readSize().width,this.readSize().height,false); } }
  async loadModel(fileOrUrl: File|string): Promise<void> {
    const url=typeof fileOrUrl==='string'?fileOrUrl:URL.createObjectURL(fileOrUrl);
    if(!/\.(glb|gltf|vrm)(?:$|\?)/i.test(typeof fileOrUrl==='string'?url:fileOrUrl.name)) throw new Error('Only .glb, .gltf and .vrm model files are supported.');
    const loader=new GLTFLoader();
    try {
      const gltf=await loader.loadAsync(url); if(this.avatarModel) this.teacher.remove(this.avatarModel);
      this.avatarModel=gltf.scene; this.avatarModel.scale.setScalar(1.75); this.avatarModel.position.set(0,0,0); this.teacher.add(this.avatarModel);
      if(gltf.animations.length){ this.modelMixer=new THREE.AnimationMixer(this.avatarModel); const clip=gltf.animations[0]; this.modelMixer.clipAction(clip).play(); }
      this.modelUrl=url; eventLog.add('success','3D model loaded. Use docs/MODEL_RIGGING.md for rig mapping.');
    } catch(error){ if(typeof fileOrUrl!=='string') URL.revokeObjectURL(url); throw error; }
  }
  private onResize=()=>{ if(this.disposed)return; const {width,height}=this.readSize(); this.camera.aspect=width/height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width,height,false); };
  private animate=()=>{
    if(this.disposed)return; this.raf=requestAnimationFrame(this.animate); const dt=Math.min(this.clock.getDelta(),0.05), now=performance.now();
    this.teacher.position.y=0.015+Math.sin(now/720)*0.02;
    this.torso && (this.torso.scale.y=1+Math.sin(now/900)*0.012);
    if(now>this.blinkAt){ this.blinkAmount=1; this.blinkAt=now+2200+Math.random()*3800; }
    this.blinkAmount=Math.max(0,this.blinkAmount-dt*9);
    if(this.leftEye) this.leftEye.scale.y=0.72*(1-this.blinkAmount*0.94); if(this.rightEye) this.rightEye.scale.y=0.72*(1-this.blinkAmount*0.94);
    if(this.mouth){ const talkingNow=this.talking && now-this.lastSpeechPulse<4500; this.mouth.scale.y=talkingNow?1+Math.abs(Math.sin(now/82))*2:1; if(now-this.lastSpeechPulse>4500)this.talking=false; }
    if(this.gestureUntil && now>this.gestureUntil){ this.gestureUntil=0; this.gesture='idle'; this.targetLeftArm.set(0,0,0); this.targetRightArm.set(0,0,0); this.targetHead.set(0,0,0); this.teacherTargetX=-0.82; }
    const blend=Math.min(1,dt*4.2);
    if(this.leftArm) this.leftArm.rotation.set(this.leftArm.rotation.x+(this.targetLeftArm.x-this.leftArm.rotation.x)*blend,this.leftArm.rotation.y+(this.targetLeftArm.y-this.leftArm.rotation.y)*blend,this.leftArm.rotation.z+(this.targetLeftArm.z-this.leftArm.rotation.z)*blend);
    if(this.rightArm) this.rightArm.rotation.set(this.rightArm.rotation.x+(this.targetRightArm.x-this.rightArm.rotation.x)*blend,this.rightArm.rotation.y+(this.targetRightArm.y-this.rightArm.rotation.y)*blend,this.rightArm.rotation.z+(this.targetRightArm.z-this.rightArm.rotation.z)*blend);
    this.head.rotation.x += (this.targetHead.x-this.head.rotation.x)*blend; this.head.rotation.y += (this.targetHead.y-this.head.rotation.y)*blend;
    this.teacher.position.x += (this.teacherTargetX-this.teacher.position.x)*Math.min(1,dt*1.8);
    this.camera.position.lerp(this.targetCamera,Math.min(1,dt*2.2)); const focus=this.baseLook.clone().lerp(this.targetLook,Math.min(1,dt*2.2)); this.camera.lookAt(focus);
    this.modelMixer?.update(dt); this.renderer.render(this.scene,this.camera);
  };
  dispose(): void { this.disposed=true; cancelAnimationFrame(this.raf); window.removeEventListener('resize',this.onResize); this.typingTimers.forEach(timer=>window.clearInterval(timer)); this.typingTimers.clear(); this.renderer.dispose(); this.boardTexture.dispose(); if(this.modelUrl?.startsWith('blob:'))URL.revokeObjectURL(this.modelUrl); }
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]??char));}