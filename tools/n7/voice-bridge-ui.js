// Authenticated side of the voice link. No cookies, credentials or chat history cross origins.
(()=>{
 'use strict';const P=window.N7VoiceProtocol;if(!P||!window.opener)return;
 const encoded=new URLSearchParams(location.hash.slice(1)).get('n7voice');if(!encoded)return;
 let options;try{if(encoded.length>1000)throw Error();options=JSON.parse(encoded);if(options.schema!==P.SCHEMA||options.origin!==P.ATLAS||!P.nonceOK(options.nonce))throw Error();}catch{return;}
 const opener=window.opener,nonce=options.nonce;let bound=null,inflight=null;const seen=new Set();
 const post=data=>{if(!opener.closed)opener.postMessage({schema:P.SCHEMA,nonce,...data},P.ATLAS);};
 const card=document.createElement('section');card.id='n7-voice-connection';card.style.cssText='padding:12px;margin:12px;border:1px solid #526b7a;border-radius:10px';
 const label=document.createElement('p');label.textContent='Φωνητικός NABOU: επίλεξε συνομιλία και έργο. Οι απαντήσεις στις φωνητικές ερωτήσεις σου θα εμφανίζονται και θα ακούγονται στον άτλαντα.';
 const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Η φωνή δεν έχει συνδεθεί ακόμη.';
 const connect=document.createElement('button');connect.type='button';connect.textContent='Σύνδεση φωνής';
 const disconnect=document.createElement('button');disconnect.type='button';disconnect.textContent='Αποσύνδεση φωνής';
 function revoke(message='Η φωνή αποσυνδέθηκε.'){bound=null;status.textContent=message;post({type:'disconnected'});}
 connect.onclick=async()=>{try{const s=await api('/api/status');if(!s.authenticated){status.textContent='Συνδέσου πρώτα στο N7.';post({type:'auth_required'});return;}if(busy)throw Error('Περίμενε να ολοκληρωθεί η τρέχουσα απάντηση.');if(!active)await create();bound=active;status.textContent='Η φωνή χρησιμοποιεί αυτή τη συνομιλία και τη συνδεδεμένη μνήμη έργου.';post({type:'ready'});}catch(e){status.textContent=e.message;}};
 disconnect.onclick=()=>{if(inflight)document.getElementById('n7-stop-reply')?.click();revoke();};
 card.append(label,status,connect,disconnect);document.getElementById('chat')?.before(card);
 // The Humanoid stage reads this to open the window in the classic view, where this card is.
 window.N7_CLASSIC_START=true;
 history.replaceState(null,'',location.pathname+location.search);
 window.addEventListener('message',async event=>{
  if(event.origin!==P.ATLAS||event.source!==opener||!P.envelope(event.data,nonce))return;const data=event.data;
  if(data.type==='disconnect'){if(inflight)document.getElementById('n7-stop-reply')?.click();revoke();return;}
  if(data.type==='cancel'){if(inflight?.id===data.id)document.getElementById('n7-stop-reply')?.click();return;}
  if(data.type!=='question'||!P.idOK(data.id)||seen.has(data.id))return;
  const fail=message=>post({type:'error',id:data.id,message});
  if(!bound||active!==bound){revoke('Επίλεξε συνομιλία και πάτησε ξανά «Σύνδεση φωνής».');fail('Η επιλεγμένη συνομιλία άλλαξε. Σύνδεσε ξανά τη φωνή.');return;}
  if(inflight||busy){fail('Το N7 απαντά ήδη.');return;}
  if(seen.size>=100){revoke('Η σύνδεση έληξε. Άνοιξε ξανά τον φωνητικό βοηθό.');fail('Η σύνδεση φωνής έληξε.');return;}
  seen.add(data.id);const cid=bound;inflight={id:data.id,cid};
  try{
   const s=await api('/api/status');if(!s.authenticated){post({type:'auth_required'});throw Error('Χρειάζεται σύνδεση στο N7.');}
   if(bound!==cid||active!==cid)throw Error('Η συνομιλία άλλαξε.');
   const message=P.question(data.text,data.context);
   const result=await window.N7VoiceChat.send(cid,message);
   if(bound!==cid||active!==cid){fail('Η συνομιλία άλλαξε. Δες την απάντηση στο N7.');return;}
   if(result.queued)post({type:'queued',id:data.id});else post({type:'answer',id:data.id,text:result.text,cancelled:result.cancelled===true});
  }catch(e){fail(String(e.message||'Η απάντηση δεν ολοκληρώθηκε.').slice(0,250));}finally{inflight=null;}
 });
 setInterval(()=>{if(bound&&(active!==bound||opener.closed))revoke('Η σύνδεση φωνής χρειάζεται νέα επιλογή συνομιλίας.');},1000);
})();
