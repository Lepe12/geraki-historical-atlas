// The unchanged renderer expects viewport coordinates. Adapt only this embedded preview canvas.
(() => {
 const canvas=document.getElementById('universe');if(!canvas)return;
 const add=canvas.addEventListener.bind(canvas),remove=canvas.removeEventListener.bind(canvas),wrappers=new WeakMap();
 canvas.addEventListener=function(type,listener,options){
  if(!type.startsWith('pointer')||!listener)return add(type,listener,options);
  let types=wrappers.get(listener);if(!types){types=new Map();wrappers.set(listener,types);}
  if(!types.has(type))types.set(type,event=>{const box=canvas.getBoundingClientRect();const local=new Proxy(event,{get(target,key){if(key==='clientX')return target.clientX-box.left;if(key==='clientY')return target.clientY-box.top;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});if(typeof listener==='function')listener.call(canvas,local);else listener.handleEvent(local);});
  return add(type,types.get(type),options);
 };
 canvas.removeEventListener=function(type,listener,options){return remove(type,wrappers.get(listener)?.get(type)||listener,options);};
})();
