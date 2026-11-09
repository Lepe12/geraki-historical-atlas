// N7_EDITOR_DIFF_V1 — exact, bounded text comparison; never executes source text.
(function(root){
 'use strict';
 const INPUT='\nN7_EDIT_INPUT\n';
 function input(message){
  if(typeof message!=='string')return null;const at=message.indexOf(INPUT);if(at<0)return null;
  try{const value=JSON.parse(message.slice(at+INPUT.length));return value.schema==='n7-editor-v1'&&typeof value.source==='string'&&value.source.length<=10000?value:null;}catch{return null;}
 }
 function output(message){
  if(typeof message!=='string')return null;
  const start='⟦N7_EDIT⟧',end='⟦/N7_EDIT⟧';
  if(message.split(start).length!==2||message.split(end).length!==2)return null;
  const a=message.indexOf(start),b=message.indexOf(end);if(b<=a)return null;
  const text=message.slice(a+start.length,b).replace(/^\r?\n/,'').replace(/\r?\n$/,'');if(!text.trim()||text.length>20000)return null;
  const rest=message.slice(0,a)+message.slice(b+end.length);
  return {text,notes:rest.replaceAll('⟦N7_NOTES⟧','').replaceAll('⟦/N7_NOTES⟧','').trim()};
 }
 function compare(before,after){
  if(typeof before!=='string'||typeof after!=='string'||before.length>10000||after.length>20000)throw Error('Comparison length exceeded');
  if(before===after)return {parts:[{kind:'same',text:before}],granularity:'word',changes:0};
  const tokens=s=>s.match(/\s+|[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu)||[];
  let a=tokens(before),b=tokens(after),granularity='word';
  if(a.length*b.length>1000000){a=before.match(/[^\n]*\n|[^\n]+$/g)||[];b=after.match(/[^\n]*\n|[^\n]+$/g)||[];granularity='paragraph';}
  if(a.length*b.length>1000000)return {parts:[{kind:'remove',text:before},{kind:'add',text:after}],granularity:'document',changes:before===after?0:1};
  const width=b.length+1,table=new Uint16Array((a.length+1)*width);
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)table[i*width+j]=a[i]===b[j]?table[(i+1)*width+j+1]+1:Math.max(table[(i+1)*width+j],table[i*width+j+1]);
  const parts=[];let i=0,j=0;
  function push(kind,text){if(!text)return;const last=parts.at(-1);if(last?.kind===kind)last.text+=text;else parts.push({kind,text});}
  while(i<a.length||j<b.length){if(i<a.length&&j<b.length&&a[i]===b[j]){push('same',a[i++]);j++;}else if(j<b.length&&(i===a.length||table[i*width+j+1]>=table[(i+1)*width+j]))push('add',b[j++]);else push('remove',a[i++]);}
  let changes=0,inChange=false;for(const p of parts){if(p.kind==='same'){inChange=false;}else if(!inChange){changes++;inChange=true;}}
  return {parts,granularity,changes};
 }
 const api={input,output,compare,INPUT};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.N7EditorDiff=api;
})(typeof window==='undefined'?globalThis:window);
