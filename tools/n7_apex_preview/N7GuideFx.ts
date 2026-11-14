// Assembly burst and living arcs (owner reference: MIRA), drawn on a 2D layer
// above the figure. Coordinates are the figure's 320x480 layout units. The
// WebGL figure itself is not touched, so its pixel checks are unaffected.
export const CORE={x:160,y:297};
type Bolt={points:[number,number][];width:number;life:number};
function jag(x0:number,y0:number,x1:number,y1:number,rough:number,depth:number,out:[number,number][]){
  if(depth===0){out.push([x1,y1]);return;}
  const mx=(x0+x1)/2+(Math.random()-.5)*rough,my=(y0+y1)/2+(Math.random()-.5)*rough;
  jag(x0,y0,mx,my,rough/2,depth-1,out);jag(mx,my,x1,y1,rough/2,depth-1,out);
}
function bolt(x0:number,y0:number,x1:number,y1:number,rough:number,width:number):Bolt{
  const points:[number,number][]=[[x0,y0]];jag(x0,y0,x1,y1,rough,5,points);return {points,width,life:1};
}
export function createFx(canvas:HTMLCanvasElement){
  const ctx=canvas.getContext("2d")!;
  let bolts:Bolt[]=[],lastBurstBolt=0,nextArc=performance.now()+4000,arcUntil=0,arc:Bolt|null=null;
  const draw=(progress:number,idle:boolean,now:number)=>{
    const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const k=canvas.width/320;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
    let active=false;
    // Burst: bright flash at the heart and branching bolts, while the dotted
    // silhouette turns into the lit figure.
    if(progress>=.84&&progress<.99){
      active=true;
      const t=(progress-.84)/.15,flash=Math.exp(-Math.pow((t-.35)/.22,2));
      const g=ctx.createRadialGradient(CORE.x*k,CORE.y*k,0,CORE.x*k,CORE.y*k,150*k);
      g.addColorStop(0,`rgba(235,252,255,${.85*flash})`);g.addColorStop(.25,`rgba(120,225,255,${.45*flash})`);g.addColorStop(1,"rgba(40,120,170,0)");
      ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);
      if(now-lastBurstBolt>70&&t<.85){
        lastBurstBolt=now;
        bolts=Array.from({length:4+Math.floor(Math.random()*3)},()=>{const a=Math.random()*Math.PI*2,r=70+Math.random()*120;return bolt(CORE.x,CORE.y,CORE.x+Math.cos(a)*r,CORE.y+Math.sin(a)*r*.9,34,1.6);});
      }
    }else bolts=[];
    // Living arcs: now and then a short, faint crackle runs along the body.
    if(idle){
      if(!arc&&now>nextArc){
        const side=Math.random()<.5?-1:1,x=160+side*(48+Math.random()*52),y=225+Math.random()*90;
        arc=bolt(x,y,x+side*(10+Math.random()*26),y+18+Math.random()*34,14,1.1);arcUntil=now+260;
      }
      if(arc&&now>arcUntil){arc=null;nextArc=now+5000+Math.random()*6000;}
    }else{arc=null;}
    const stroke=(b:Bolt,alpha:number)=>{
      ctx.beginPath();b.points.forEach(([x,y],i)=>i?ctx.lineTo(x*k,y*k):ctx.moveTo(x*k,y*k));
      ctx.strokeStyle=`rgba(150,232,255,${.55*alpha})`;ctx.lineWidth=b.width*3*k/2;ctx.stroke();
      ctx.strokeStyle=`rgba(245,253,255,${alpha})`;ctx.lineWidth=b.width*k/2;ctx.stroke();
    };
    ctx.lineJoin="round";ctx.lineCap="round";ctx.shadowColor="rgba(120,225,255,.9)";ctx.shadowBlur=8*k/2;
    for(const b of bolts)stroke(b,.9);
    if(arc){active=true;stroke(arc,(.55+.45*Math.random())*.75);}
    ctx.shadowBlur=0;
    canvas.dataset.active=String(active||bolts.length>0);
  };
  return {draw,clear:()=>{bolts=[];arc=null;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);canvas.dataset.active="false";}};
}

// Synthesised assembly sounds; no audio files. A separate AudioContext from
// the voice, created only after the visitor has interacted with the page.
export function createAssemblySound(){
  let ctx:AudioContext|null=null,hum:{stop:()=>void}|null=null;
  const ready=()=>!!ctx&&ctx.state==="running";
  const unlock=()=>{try{if(!ctx)ctx=new AudioContext();void ctx.resume();}catch{}};
  const noise=(seconds:number)=>{const c=ctx!,b=c.createBuffer(1,Math.floor(c.sampleRate*seconds),c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const s=c.createBufferSource();s.buffer=b;return s;};
  const start=()=>{
    if(!ready())return;stopHum();const c=ctx!,t=c.currentTime;
    const out=c.createGain();out.gain.setValueAtTime(0,t);out.gain.linearRampToValueAtTime(.05,t+1.2);out.gain.linearRampToValueAtTime(.09,t+5);out.gain.linearRampToValueAtTime(0,t+5.6);out.connect(c.destination);
    const a=c.createOscillator();a.type="sine";a.frequency.setValueAtTime(55,t);a.frequency.exponentialRampToValueAtTime(130,t+5.2);a.connect(out);
    const b2=c.createOscillator();b2.type="triangle";b2.frequency.setValueAtTime(110.5,t);b2.frequency.exponentialRampToValueAtTime(262,t+5.2);const bg=c.createGain();bg.gain.value=.35;b2.connect(bg).connect(out);
    const n=noise(5.6),f=c.createBiquadFilter();f.type="bandpass";f.Q.value=6;f.frequency.setValueAtTime(900,t);f.frequency.exponentialRampToValueAtTime(5200,t+5.2);const ng=c.createGain();ng.gain.value=.5;n.connect(f).connect(ng).connect(out);
    a.start(t);b2.start(t);n.start(t);a.stop(t+5.7);b2.stop(t+5.7);n.stop(t+5.7);
    hum={stop:()=>{try{out.gain.cancelScheduledValues(c.currentTime);out.gain.setTargetAtTime(0,c.currentTime,.05);a.stop(c.currentTime+.3);b2.stop(c.currentTime+.3);n.stop(c.currentTime+.3);}catch{}}};
  };
  const burst=()=>{
    if(!ready())return;const c=ctx!,t=c.currentTime;
    const n=noise(.9),hp=c.createBiquadFilter();hp.type="highpass";hp.frequency.value=2400;const g=c.createGain();
    g.gain.setValueAtTime(0,t);for(let i=0;i<9;i++){const at=t+i*.075+Math.random()*.03;g.gain.setValueAtTime(.16*Math.random()+.05,at);g.gain.exponentialRampToValueAtTime(.002,at+.05);}
    n.connect(hp).connect(g).connect(c.destination);n.start(t);n.stop(t+.9);
    const o=c.createOscillator();o.type="sine";o.frequency.setValueAtTime(90,t);o.frequency.exponentialRampToValueAtTime(32,t+1.3);const og=c.createGain();og.gain.setValueAtTime(.22,t);og.gain.exponentialRampToValueAtTime(.001,t+1.4);o.connect(og).connect(c.destination);o.start(t);o.stop(t+1.45);
  };
  const chime=()=>{
    if(!ready())return;const c=ctx!,t=c.currentTime;
    for(const [f,d] of [[659.3,2.4],[987.8,2.0],[1318.5,1.6]] as const){const o=c.createOscillator();o.type="sine";o.frequency.value=f;const g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.035,t+.02);g.gain.exponentialRampToValueAtTime(.0008,t+d);o.connect(g).connect(c.destination);o.start(t);o.stop(t+d+.05);}
  };
  const stopHum=()=>{hum?.stop();hum=null;};
  return {unlock,start,burst,chime,stop:stopHum,dispose:()=>{stopHum();void ctx?.close();ctx=null;}};
}
