// Public-side voice link. Only explicit user questions are sent; no history is fetched here.
(()=>{
 'use strict';const P=window.N7VoiceProtocol;if(!P)return;
 let popup=null,nonce='',connected=false,pending=null;
 const status=(state,message)=>{document.dispatchEvent(new CustomEvent('n7:voice-state',{detail:{state,message}}));};
 const post=data=>{if(popup&&!popup.closed)popup.postMessage({schema:P.SCHEMA,nonce,...data},P.BOT);};
 function cancel(){if(pending)post({type:'cancel',id:pending.id});}
 function disconnect(){post({type:'disconnect'});connected=false;nonce='';if(pending){clearTimeout(pending.timer);pending.reject(Error('Η σύνδεση με το N7 έκλεισε.'));pending=null;}status('disconnected','Η σύνδεση με το N7 έκλεισε.');}
 function connect(){
  if(popup&&!popup.closed&&nonce){popup.focus();status(connected?'connected':'connecting',connected?'Συνδεδεμένο με το N7.':'Συνδέσου στο παράθυρο N7 και πάτησε «Σύνδεση φωνής».');return;}
  nonce=crypto.randomUUID().replaceAll('-','');connected=false;
  const payload={schema:P.SCHEMA,nonce,origin:location.origin};
  popup=window.open(P.BOT+'/#n7voice='+encodeURIComponent(JSON.stringify(payload)),'n7voice-'+nonce,'popup,width=1100,height=850');
  if(!popup){nonce='';status('disconnected','Το παράθυρο μπλοκαρίστηκε. Επίτρεψε το άνοιγμα του N7.');return;}
  status('connecting','Συνδέσου στο παράθυρο N7, διάλεξε συνομιλία/έργο και πάτησε «Σύνδεση φωνής».');
 }
 function ask(text,options={}){
  if(!connected||!popup||popup.closed){connected=false;return Promise.reject(Error('Πάτησε πρώτα «Σύνδεση με N7».'));}
  if(pending)return Promise.reject(Error('Το N7 απαντά ήδη. Περίμενε ή πάτησε διακοπή.'));
  if(typeof text!=='string'||!text.trim()||text.length>6000)return Promise.reject(Error('Η ερώτηση πρέπει να έχει έως 6.000 χαρακτήρες.'));
  const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{post({type:'cancel',id});pending=null;reject(Error('Η απάντηση καθυστέρησε. Δες τη συνομιλία στο N7 πριν ξαναστείλεις.'));},180000);pending={id,resolve,reject,timer};post({type:'question',id,text,context:options.includeMap===false?null:window.N7AtlasContext?.read()||null});});
 }
 window.addEventListener('message',event=>{
  if(event.origin!==P.BOT||event.source!==popup||!P.envelope(event.data,nonce))return;const data=event.data;
  if(data.type==='ready'){connected=true;status('connected','Συνδεδεμένο με την επιλεγμένη συνομιλία N7.');return;}
  if(data.type==='disconnected'||data.type==='auth_required'){connected=false;status(data.type,'Άνοιξε το παράθυρο N7 και σύνδεσε ξανά τη φωνή.');}
  if(!pending||data.id!==pending.id||!['answer','error','queued'].includes(data.type))return;
  const task=pending;pending=null;clearTimeout(task.timer);
  if(data.type==='error'){task.reject(Error(typeof data.message==='string'?data.message.slice(0,250):'Η απάντηση δεν ολοκληρώθηκε.'));return;}
  if(data.type==='answer'&&(typeof data.text!=='string'||data.text.length>50000)){task.reject(Error('Μη έγκυρη απάντηση N7.'));return;}
  task.resolve({text:data.text||'',queued:data.type==='queued',cancelled:data.cancelled===true});
 });
 setInterval(()=>{if(popup&&popup.closed&&nonce)disconnect();},1000);
 window.addEventListener('pagehide',disconnect);
 window.N7VoiceLink={connect,disconnect,cancel,ask,isConnected:()=>connected&&!!popup&&!popup.closed};
})();
