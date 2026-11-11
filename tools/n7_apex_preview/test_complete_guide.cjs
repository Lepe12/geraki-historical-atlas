const {chromium}=require('playwright-core'),{PNG}=require('pngjs'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const url=process.env.N7_VISUAL_URL||'http://127.0.0.1:4176/n7-apex-step5/',out=process.env.N7_GUIDE_OUT||'/tmp/n7-complete-guide';fs.mkdirSync(out,{recursive:true});
const hostSelector='[aria-label="N7 guide artwork-tile humanoid"]';
const result={url,scope:'unmocked rendering; separate local-only API lifecycle fixture',checks:[],limitations:['No owner-supplied assembly audio; silent timeline.','Browser voice/microphone have a separate lifecycle suite; manual mood buttons are visual previews.','Webcam is optional and not enabled.']};
function diff(a,b,region){let n=0,max=0;for(let y=region?.y??0;y<(region?.bottom??a.height);y++)for(let x=region?.x??0;x<(region?.right??a.width);x++){const i=(y*a.width+x)*4;let d=0;for(let c=0;c<3;c++){let v=Math.abs(a.data[i+c]-b.data[i+c]);max=Math.max(max,v);d+=v;}n+=d>9;}return {pixels:n,max};}
function metrics(png){let n=0,cyan=0,minX=png.width,maxX=-1,sumX=0;for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){const i=(y*png.width+x)*4,r=png.data[i],g=png.data[i+1],b=png.data[i+2];if(r+g+b>45){n++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);sumX+=x;}if(b>80&&g>70&&b>r*1.2)cyan++;}return {visible:n,cyan,width:maxX-minX+1,centroid:sumX/n};}
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',...(process.env.N7_BROWSER_PROXY?{proxy:{server:process.env.N7_BROWSER_PROXY}}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&m.text().includes('WebGLProgram'))errors.push(m.text());});
  await p.goto(url,{waitUntil:'networkidle'});const h=p.locator(hostSelector);await p.waitForFunction(s=>document.querySelector(s)?.dataset.engine==='three-shared-scene',hostSelector);
  const pose=async(name)=>{const png=await h.evaluate(h=>[...h.querySelectorAll('canvas')].find(c=>c.style.display!=='none').toDataURL());fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(png.split(',')[1],'base64'));return PNG.sync.read(Buffer.from(png.split(',')[1],'base64'));};
  const progress=async n=>p.waitForFunction(({s,n})=>Number(document.querySelector(s)?.dataset.assemblyProgress)>=n,{s:hostSelector,n});
  const center=async()=>{const r=await h.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height*.5);await p.waitForFunction(s=>{const h=document.querySelector(s);return Number(h.dataset.currentTurn)===0&&Number(h.dataset.headTarget)===0&&Number(h.dataset.currentPitch)===0&&Number(h.dataset.headPitchTarget)===0;},hostSelector);await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  assert.equal(await p.getByRole('button',{name:'Technical details',exact:true}).getAttribute('aria-expanded'),'false');
  assert(Number(await h.getAttribute('data-assembly-progress'))<1,'Opening did not build the figure');
  console.log('Automatic assembly started');
  await progress(.25);const a25=metrics(await pose('assembly-25'));
  await progress(.60);const a60=metrics(await pose('assembly-60'));
  assert(a25.visible>350&&a25.cyan>150,'Early source transport missing');assert(a60.visible>a25.visible,'Assembly did not grow');
  assert(a60.width>a25.width*1.45&&a60.centroid>a25.centroid+35,'No left-to-right construction');
  await progress(1);await p.getByText('ASSEMBLY · COMPLETE',{exact:true}).waitFor();
  await p.waitForFunction(()=>Number(document.querySelector('[aria-label="N7 completion shockwave"]').dataset.progress)>=0);
  await p.screenshot({path:path.join(out,'completion-wave-start.png')});
  await p.waitForTimeout(750);const mid=Number(await p.getByLabel('N7 completion shockwave',{exact:true}).getAttribute('data-progress'));assert(mid>0&&mid<1,'Shockwave is not followable');
  await p.screenshot({path:path.join(out,'completion-wave-mid.png')});await p.waitForTimeout(2100);
  assert.equal(await p.getByLabel('N7 completion shockwave',{exact:true}).isVisible(),false,'Wave did not finish');
  const scene=PNG.sync.read(await p.screenshot());const fb=await p.locator('.n7-guide-figure').boundingBox();const corner=(Math.round(fb.y+2)*scene.width+Math.round(fb.x+2))*4;assert(scene.data[corner]+scene.data[corner+1]+scene.data[corner+2]>15,'Opaque black artwork rectangle hides backdrop');
  result.checks.push({step:4,automaticBuild:true,...{a25,a60}},{step:7,durationMs:2500,oneWave:true});
  // Replay during a completed-state wave and cancel: no overlapping/later wave.
  await p.getByRole('button',{name:'Replay Assembly',exact:true}).click();await p.waitForTimeout(200);assert(Number(await h.getAttribute('data-assembly-progress'))<.2);
  assert.equal(await p.getByLabel('N7 completion shockwave',{exact:true}).isVisible(),false);
  await progress(1);await p.waitForTimeout(300);await p.getByRole('button',{name:'Skip',exact:true}).click();await p.waitForTimeout(2800);
  assert.equal(await p.getByLabel('N7 completion shockwave',{exact:true}).isVisible(),false,'Skip left a delayed wave');
  // Reference, body-anchored breathing, and neutral restoration.
  await p.getByRole('button',{name:'Technical details',exact:true}).click();await p.getByLabel('Breathing',{exact:true}).uncheck();await center();
  await p.waitForFunction(s=>document.querySelector(s).dataset.referenceVisible==='true',hostSelector);
  const reference=await pose('neutral');await p.getByLabel('Breathing',{exact:true}).check();await center();const b0=await pose('breath-0');await p.waitForTimeout(1800);const b1=await pose('breath-1');
  const head=diff(b0,b1,{x:60,y:0,right:260,bottom:205}),chest=diff(b0,b1,{x:70,y:245,right:250,bottom:430});
  assert(head.max<=2,'Breathing moved the head');assert(chest.pixels>80,'Breathing is not visible in body pixels');
  await p.getByLabel('Breathing',{exact:true}).uncheck();await center();const restored=await pose('breath-off');assert.equal(diff(reference,restored).max,0,'Breathing accumulated displacement');
  result.checks.push({step:8,head,chest,neutralRestored:true});
  await p.getByRole('button',{name:'Original',exact:true}).click();await p.getByRole('img',{name:'Approved N7 idle reference'}).waitFor();
  await p.getByRole('button',{name:'Compare',exact:true}).click();await p.getByText('REFERENCE 38% + PARTICLE RECONSTRUCTION',{exact:true}).waitFor();
  assert.equal(await p.getByRole('img',{name:'Approved N7 idle reference'}).evaluate(i=>i.style.opacity),'0.38');
  await p.screenshot({path:path.join(out,'compare.png')});await p.getByRole('button',{name:'Particles',exact:true}).click();
  assert.equal(await p.getByRole('img',{name:'Approved N7 idle reference'}).count(),0);

  // A face-outward bloom changes color first at the face, then distant body.
  await p.getByRole('button',{name:'Listening',exact:true}).click();await center();await p.waitForTimeout(180);const early=await pose('listening-early');
  await p.waitForTimeout(1050);const settled=await pose('listening-settled');
  const earlyOuter=diff(reference,early,{x:50,y:360,right:270,bottom:470}),lateOuter=diff(reference,settled,{x:50,y:360,right:270,bottom:470});
  assert(lateOuter.pixels>earlyOuter.pixels+50,'Mood did not bloom outward');
  for(const mood of ['Thinking','Speaking','Idle']){await p.getByRole('button',{name:mood,exact:true}).click();await p.waitForTimeout(60);}
  await center();await p.waitForTimeout(1150);assert.equal(diff(reference,await pose('rapid-mood-return')).max,0,'Old moods remain queued');
  result.checks.push({step:3,earlyOuter,lateOuter,latestStateNoQueue:true});
  // Details occupy their own column; they must not cover figure/buttons.
  const figure=await p.locator('.n7-guide-figure').boundingBox(),panel=await p.getByRole('complementary',{name:'Technical details'}).boundingBox();assert(figure.x+figure.width<=panel.x+1,'Technical panel covers figure');
  await p.getByRole('button',{name:'Effects On',exact:true}).click();await center();await p.mouse.move(1300,150);await p.waitForTimeout(250);
  assert.equal(Number(await h.getAttribute('data-current-turn')),0);assert.equal(Number(await h.getAttribute('data-breath')),0);assert.equal(diff(reference,await pose('effects-off')).max,0);
  assert.equal(await p.getByLabel('N7 completion shockwave',{exact:true}).isVisible(),false);
  const bg=p.getByLabel('N7 Step 6 living backdrop',{exact:true});assert.equal(await bg.getAttribute('data-effects'),'off');
  result.checks.push({step:2,effectsOffExact:true,detailsDoNotCoverFigure:true},{step:6,baseUnchanged:true});
  await p.getByRole('button',{name:'Effects Off',exact:true}).click();await p.getByRole('button',{name:'Technical details',exact:true}).click();
  // Reopening constructs again. Exiting never destroys the workspace component.
  await p.getByRole('button',{name:'Exit',exact:true}).click();await p.getByRole('button',{name:'HUMANOID',exact:true}).click();await p.waitForFunction(sel=>{const v=Number(document.querySelector(sel)?.dataset.assemblyProgress);return Number.isFinite(v)&&v<.95;},hostSelector,{timeout:8000});await p.getByText('ASSEMBLY · BUILDING',{exact:true}).waitFor({state:'visible'});
  await p.getByRole('dialog',{name:'N7 Humanoid preview'}).getByRole('button',{name:'Συνομιλία',exact:true}).click();await p.getByRole('dialog',{name:'N7 Humanoid preview'}).getByRole('button',{name:'Έναρξη συζήτησης',exact:true}).waitFor();assert.equal(await p.getByRole('dialog',{name:'N7 Humanoid preview'}).isVisible(),true);assert.equal(await p.getByLabel('N7 workspace',{exact:true}).count(),0);
  result.checks.push({step:9,reopensWithBuild:true,workspaceAvailableBeforeBuild:true});
  const small=await b.newPage({viewport:{width:390,height:844}});await small.goto(url,{waitUntil:'networkidle'});await small.getByRole('button',{name:'Technical details',exact:true}).click();const sf=await small.locator('.n7-guide-figure').boundingBox(),sd=await small.getByRole('complementary',{name:'Technical details'}).boundingBox();assert(sf.y+sf.height<=sd.y+1,'Mobile diagnostics overlap figure');await small.screenshot({path:path.join(out,'mobile-details.png')});await small.close();
  const r=await b.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});await r.goto(url,{waitUntil:'networkidle'});await r.waitForFunction(s=>document.querySelector(s)?.dataset.referenceVisible==='true',hostSelector);await r.mouse.move(1300,100);await r.waitForTimeout(350);const attrs=await r.locator(hostSelector).evaluate(h=>({...h.dataset}));assert.equal(Number(attrs.currentTurn),0);assert.equal(Number(attrs.breath),0);assert.equal(Number(attrs.shock),-1);
  await r.emulateMedia({reducedMotion:'no-preference'});await r.waitForTimeout(500);assert.equal(Number(await r.locator(hostSelector).getAttribute('data-assembly-progress')),1,'Preference change resumed an old assembly');
  await r.emulateMedia({reducedMotion:'reduce'});await r.getByRole('button',{name:'Speaking',exact:true}).click();await r.waitForTimeout(200);
  const staticMood=await r.locator(hostSelector).evaluate(h=>[...h.querySelectorAll('canvas')].find(c=>c.style.display!=='none').toDataURL());await r.waitForTimeout(350);
  assert.equal(await r.locator(hostSelector).evaluate(h=>[...h.querySelectorAll('canvas')].find(c=>c.style.display!=='none').toDataURL()),staticMood,'Reduced motion left speaking pulses active');await r.close();
  result.checks.push({accessibility:'reduced-motion and mobile layout passed'});
  // Local-only API fixture verifies app lifecycle, not an actual model response.
  if(new URL(url).hostname==='127.0.0.1'){
    const q=await b.newPage({viewport:{width:1440,height:900}});let messages=[],release,fail=false,requests=0,queued=false,queuePolls=0;
    await q.route('**/api/**',async route=>{const req=route.request(),pathname=new URL(req.url()).pathname;let data={};
      if(pathname==='/api/status')data={authenticated:true};else if(pathname==='/api/tasks')data={tasks:[]};
      else if(pathname==='/api/conversations'&&req.method()==='POST')data={id:'guide-fixture'};
      else if(pathname==='/api/conversations')data={conversations:[{id:'guide-fixture',title:'Guide fixture'}]};
      else if(pathname==='/api/n7/job/guide-queued'){queuePolls++;messages.push({role:'assistant',content:'Queued fixture reply.'});data={status:'done',job_id:'guide-queued'};}
      else if(pathname.endsWith('/chat')){requests++;if(queued){await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({pending:true,job_id:'guide-queued'})});return;}const prompt=req.postDataJSON().message;await new Promise(resolve=>release=resolve);if(fail){await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'fixture-error'})});return;}messages.push({role:'user',content:prompt},{role:'assistant',content:'Fixture reply, not a real AI response.'});data={conversation:{messages}};}
      else data={conversation:{messages}};
      await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    await q.goto(url,{waitUntil:'networkidle'});await q.getByRole('dialog',{name:'N7 Humanoid preview'}).getByRole('button',{name:'Exit',exact:true}).click();await q.locator('[aria-controls="n7-workspace"]').click();await q.getByLabel('Νέο μήνυμα',{exact:true}).fill('fixture input');await q.getByRole('button',{name:'Αποστολή',exact:true}).click();
    while(!release)await q.waitForTimeout(20);await q.getByRole('button',{name:'HUMANOID',exact:true}).click();await q.getByText('MOOD · THINKING · LIVE N7 REQUEST',{exact:true}).waitFor();await q.getByRole('button',{name:'Exit',exact:true}).click();assert.equal(requests,1);release();
    await q.getByText('Fixture reply, not a real AI response.',{exact:true}).waitFor();await q.getByRole('button',{name:'HUMANOID',exact:true}).click();await q.getByRole('dialog',{name:'N7 Humanoid preview'}).getByRole('button',{name:'Exit',exact:true}).click();await q.getByText('Fixture reply, not a real AI response.',{exact:true}).waitFor();
    fail=true;release=null;await q.getByLabel('Νέο μήνυμα',{exact:true}).fill('fixture failure');await q.getByRole('button',{name:'Αποστολή',exact:true}).click();while(!release)await q.waitForTimeout(20);await q.getByRole('button',{name:'HUMANOID',exact:true}).click();await q.getByText('MOOD · THINKING · LIVE N7 REQUEST',{exact:true}).waitFor();release();await q.getByText('MOOD · IDLE',{exact:true}).waitFor();
    await q.getByRole('dialog',{name:'N7 Humanoid preview'}).getByRole('button',{name:'Exit',exact:true}).click();queued=true;fail=false;
    await q.getByLabel('Νέο μήνυμα',{exact:true}).fill('queued fixture');await q.getByRole('button',{name:'Αποστολή',exact:true}).click();
    await q.getByText('Αναμονή απάντησης N7. Μπορείς να συνεχίσεις τη συνομιλία.',{exact:true}).waitFor();
    await q.getByRole('button',{name:'HUMANOID',exact:true}).click();await q.getByText('MOOD · THINKING · LIVE N7 REQUEST',{exact:true}).waitFor();
    await q.waitForTimeout(700);assert.equal(queuePolls,0,'Queue status was not using the existing interval');
    await q.getByText('MOOD · IDLE',{exact:true}).waitFor({timeout:15000});assert.equal(queuePolls,1);
    await q.getByRole('dialog',{name:'N7 Humanoid preview'}).getByRole('button',{name:'Exit',exact:true}).click();await q.getByText('Queued fixture reply.',{exact:true}).waitFor();
    result.checks.push({integration:'local API fixture only',pendingRequestSurvivesExit:true,conversationPreserved:true,errorClearsThinking:true,fakeSpeakingRemoved:true,queuedRequestTrackedUntilDone:true});await q.close();
  }
  assert.deepEqual(errors,[]);result.browserErrors=errors;fs.writeFileSync(path.join(out,'guide-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
