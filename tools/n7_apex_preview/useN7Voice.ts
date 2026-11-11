"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {createFemaleVoice,FEMALE_VOICE_ID} from "./N7FemaleVoice";

type RecognitionResult={isFinal:boolean;0:{transcript:string}};
type Recognition={lang:string;continuous:boolean;interimResults:boolean;onstart:(()=>void)|null;onend:(()=>void)|null;onerror:((e:{error:string})=>void)|null;onresult:((e:{results:ArrayLike<RecognitionResult>})=>void)|null;start:()=>void;abort:()=>void};
type VoiceWindow=typeof window&{SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
export default function useN7Voice(onTranscript:(text:string)=>void,onTurn?:(text:string)=>void){
  const [supported,setSupported]=useState({input:false,output:false}),[enabled,setEnabled]=useState(false),[conversation,setConversation]=useState(false);
  const [phase,setPhase]=useState<"listening"|"speaking"|null>(null),[status,setStatus]=useState("");
  const [voices,setVoices]=useState<SpeechSynthesisVoice[]>([]),[voiceURI,setVoiceURI]=useState(FEMALE_VOICE_ID);
  const current=useRef({onTranscript,onTurn,enabled,voiceURI});current.current={onTranscript,onTurn,enabled,voiceURI};
  const recognition=useRef<Recognition|null>(null),generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null),utterance=useRef<SpeechSynthesisUtterance|null>(null);
  const female=useRef<ReturnType<typeof createFemaleVoice>|null>(null);
  const active=useRef(false),rearm=useRef<ReturnType<typeof setTimeout>|null>(null),captureRef=useRef<()=>void>(()=>{});
  // Internal cancellation preserves the conversation session while switching devices.
  const stop=useCallback(()=>{
    generation.current++;female.current?.cancel();if(timer.current)clearTimeout(timer.current);timer.current=null;
    if(rearm.current)clearTimeout(rearm.current);rearm.current=null;
    const r=recognition.current;recognition.current=null;if(r){r.onstart=r.onend=r.onerror=r.onresult=null;r.abort();}
    if(utterance.current){utterance.current=null;window.speechSynthesis?.cancel();}
    setPhase(null);
  },[]);
  const failConversation=useCallback((message:string)=>{active.current=false;current.current.enabled=false;setEnabled(false);setConversation(false);stop();setStatus(message);},[stop]);
  const suspend=useCallback(()=>{current.current.enabled=false;setEnabled(false);failConversation("Ο ήχος και το μικρόφωνο σταμάτησαν.");},[failConversation]);
  const arm=useCallback((delay=700)=>{
    if(rearm.current)clearTimeout(rearm.current);
    if(!active.current||document.hidden)return;
    rearm.current=setTimeout(()=>{rearm.current=null;if(active.current&&!document.hidden)captureRef.current();},delay);
  },[]);
  useEffect(()=>{
    const w=window as VoiceWindow;
    setSupported({input:!!(w.SpeechRecognition||w.webkitSpeechRecognition),output:!!(w.AudioContext&&w.Worker||w.speechSynthesis&&w.SpeechSynthesisUtterance)});
    const refresh=()=>setVoices(window.speechSynthesis?.getVoices()||[]);refresh();
    window.speechSynthesis?.addEventListener("voiceschanged",refresh);
    const hidden=()=>{if(document.hidden)suspend();};document.addEventListener("visibilitychange",hidden);window.addEventListener("pagehide",suspend);
    return()=>{active.current=false;current.current.enabled=false;stop();female.current?.dispose();window.speechSynthesis?.removeEventListener("voiceschanged",refresh);document.removeEventListener("visibilitychange",hidden);window.removeEventListener("pagehide",suspend);};
  },[stop,suspend]);
  const speak=useCallback((text:string,explicit=false)=>{
    if(!explicit&&!current.current.enabled)return;
    const useFemale=current.current.voiceURI===FEMALE_VOICE_ID;
    if(useFemale){try{if(!female.current)female.current=createFemaleVoice();void female.current.unlock().catch(()=>{});}catch{failConversation("Δεν είναι διαθέσιμη η ελληνική φωνή εδώ.");return;}}
    stop();if(!useFemale&&(!window.speechSynthesis||!window.SpeechSynthesisUtterance)){failConversation("Ο browser δεν υποστηρίζει εκφώνηση. Η απάντηση παραμένει στο κείμενο.");return;}
    const clean=text.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,"$1").replace(/[`*_#]/g,"").trim();if(!clean){arm();return;}
    const chunks=clean.match(/[\s\S]{1,200}(?:\s|$)|[\s\S]{1,200}/g)||[clean];
    const token=generation.current,available=window.speechSynthesis.getVoices();
    const selected=available.find(v=>v.voiceURI===current.current.voiceURI)||available.find(v=>/^el(?:-|$)/i.test(v.lang));
    let index=0;
    const next=()=>{
      if(token!==generation.current)return;
      if(index>=chunks.length){utterance.current=null;setPhase(null);setStatus(active.current?"Σε λίγο σε ακούω ξανά…":"Η εκφώνηση ολοκληρώθηκε.");arm();return;}
      if(useFemale){
        const text=chunks[index++];female.current!.play(text,{
          start:()=>{if(token===generation.current){setPhase("speaking");setStatus("Το N7 μιλά με την ελληνική γυναικεία φωνή.");}},
          end:()=>{if(token===generation.current)next();},
          error:message=>{if(token===generation.current)failConversation(message);},
          progress:message=>{if(token===generation.current){setPhase(null);setStatus(message);}}
        });return;
      }
      let ended=false;const u=new SpeechSynthesisUtterance(chunks[index++]);utterance.current=u;u.lang=selected?.lang||"el-GR";u.rate=1;if(selected)u.voice=selected;
      timer.current=setTimeout(()=>{if(token===generation.current&&!ended)failConversation("Η αναπαραγωγή δεν ξεκίνησε. Πάτησε «Ανάγνωση απάντησης» ή έλεγξε τον ήχο της συσκευής.");},8000);
      u.onstart=()=>{if(token!==generation.current||ended)return;if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{if(token===generation.current&&!ended)failConversation("Η εκφώνηση δεν ολοκληρώθηκε. Μπορείς να ξεκινήσεις ξανά τη συζήτηση.");},60000);setPhase("speaking");setStatus("Το N7 μιλά.");};
      u.onend=()=>{if(token!==generation.current||ended)return;ended=true;if(timer.current)clearTimeout(timer.current);timer.current=null;next();};
      u.onerror=()=>{if(token===generation.current&&!ended){ended=true;failConversation("Η εκφώνηση διακόπηκε. Η απάντηση είναι διαθέσιμη ως κείμενο.");}};
      try{window.speechSynthesis.speak(u);}catch{failConversation("Η φωνή δεν ξεκίνησε. Έλεγξε τον ήχο της συσκευής.");}
    };
    setStatus(selected?"Προετοιμασία φωνής…":"Χρήση της προεπιλεγμένης φωνής της συσκευής. Δεν βρέθηκε ελληνική φωνή.");next();
  },[stop,arm,failConversation]);
  const capture=useCallback(()=>{
    stop();const w=window as VoiceWindow,Ctor=w.SpeechRecognition||w.webkitSpeechRecognition;
    if(!Ctor){failConversation("Το μικρόφωνο δεν υποστηρίζεται από αυτόν τον browser. Δοκίμασε Chrome ή Edge, ή γράψε το μήνυμα.");return;}
    if(window.speechSynthesis||window.AudioContext){current.current.enabled=true;setEnabled(true);}
    const r=new Ctor(),token=generation.current;let finalText="",finished=false;
    recognition.current=r;r.lang="el-GR";r.continuous=false;r.interimResults=true;
    r.onstart=()=>{if(token===generation.current){setPhase("listening");setStatus(active.current?"Σε ακούω. Όταν ολοκληρώσεις, το μήνυμα στέλνεται αυτόματα.":"Σε ακούω. Μίλησε και έλεγξε το κείμενο πριν το στείλεις.");}};
    r.onresult=e=>{if(token!==generation.current||finished)return;const rows=Array.from(e.results);finalText=rows.filter(x=>x.isFinal).map(x=>x[0].transcript).join(" ").trim();current.current.onTranscript(rows.map(x=>x[0].transcript).join(" ").trim());};
    r.onend=()=>{
      if(token!==generation.current||finished)return;finished=true;recognition.current=null;setPhase(null);
      r.onstart=r.onend=r.onerror=r.onresult=null;
      if(active.current){
        const command=finalText.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[.,!;:·…]/g,"").replace(/\s+/g," ").trim();
        if(["τελος συζητησης","τελος της συζητησης","σταματα τη συζητηση"].includes(command)){current.current.onTranscript("");suspend();return;}
        if(finalText){setStatus("Το N7 ετοιμάζει την απάντηση…");try{current.current.onTurn?.(finalText);}catch{failConversation("Το μήνυμα δεν στάλθηκε. Ξεκίνα ξανά τη συζήτηση.");}}else{setStatus("Περιμένω να μιλήσεις…");arm(1000);}}
      else setStatus("Έλεγξε το μήνυμα και πάτησε Αποστολή.");
    };
    r.onerror=e=>{
      if(token!==generation.current||finished)return;
      if(e.error==="no-speech"&&active.current){setPhase(null);setStatus("Περιμένω να μιλήσεις…");arm(1000);return;}
      failConversation(({"not-allowed":"Επίτρεψε το μικρόφωνο από τις ρυθμίσεις του browser για αυτό το site.","audio-capture":"Δεν βρέθηκε διαθέσιμο μικρόφωνο.","network":"Η υπηρεσία αναγνώρισης του browser δεν συνδέθηκε. Μπορείς να γράψεις το μήνυμα.","no-speech":"Δεν ακούστηκε ομιλία. Πάτησε ξανά Υπαγόρευση.","language-not-supported":"Η αναγνώριση ελληνικών δεν είναι διαθέσιμη σε αυτόν τον browser."} as Record<string,string>)[e.error]||"Η αναγνώριση σταμάτησε. Μπορείς να συνεχίσεις με κείμενο.");
    };
    setStatus("Αναμονή άδειας μικροφώνου…");try{r.start();}catch{failConversation("Το μικρόφωνο δεν ξεκίνησε. Έλεγξε την άδεια του browser.");}
  },[stop,arm,failConversation,suspend]);
  captureRef.current=capture;
  const listen=()=>{active.current=false;setConversation(false);capture();};
  const startConversation=()=>{
    if(current.current.voiceURI===FEMALE_VOICE_ID){try{if(!female.current)female.current=createFemaleVoice();void female.current.unlock().catch(()=>{});}catch{failConversation("Δεν είναι διαθέσιμος ο ήχος στον browser.");return;}}
    if(current.current.voiceURI!==FEMALE_VOICE_ID&&(!window.speechSynthesis||!window.SpeechSynthesisUtterance)){failConversation("Η φωνητική συζήτηση χρειάζεται διαθέσιμη εκφώνηση στον browser.");return;}
    active.current=true;setConversation(true);current.current.enabled=true;setEnabled(true);capture();
  };
  const toggle=()=>{const next=!current.current.enabled;current.current.enabled=next;setEnabled(next);if(!next){active.current=false;setConversation(false);stop();}setStatus(next?"Οι νέες απαντήσεις θα εκφωνούνται. Μπορείς να διακόψεις οποιαδήποτε στιγμή.":"Η αυτόματη εκφώνηση έκλεισε.");};
  return {supported,enabled,conversation,phase,status,voices,voiceURI,setVoiceURI,stop,suspend,listen,startConversation,failConversation,speak,toggle};
}
