"use client";
import {useCallback,useEffect,useRef,useState} from "react";

type RecognitionResult={isFinal:boolean;0:{transcript:string}};
type Recognition={lang:string;continuous:boolean;interimResults:boolean;onstart:(()=>void)|null;onend:(()=>void)|null;onerror:((e:{error:string})=>void)|null;onresult:((e:{results:ArrayLike<RecognitionResult>})=>void)|null;start:()=>void;abort:()=>void};
type VoiceWindow=typeof window&{SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
export default function useN7Voice(onTranscript:(text:string)=>void){
  const [supported,setSupported]=useState({input:false,output:false}),[enabled,setEnabled]=useState(false);
  const [phase,setPhase]=useState<"listening"|"speaking"|null>(null),[status,setStatus]=useState("");
  const [voices,setVoices]=useState<SpeechSynthesisVoice[]>([]),[voiceURI,setVoiceURI]=useState("");
  const current=useRef({onTranscript,enabled,voiceURI});current.current={onTranscript,enabled,voiceURI};
  const recognition=useRef<Recognition|null>(null),generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null),utterance=useRef<SpeechSynthesisUtterance|null>(null);
  const stop=useCallback(()=>{
    generation.current++;if(timer.current)clearTimeout(timer.current);timer.current=null;
    const r=recognition.current;recognition.current=null;if(r){r.onstart=r.onend=r.onerror=r.onresult=null;r.abort();}
    if(utterance.current){utterance.current=null;window.speechSynthesis?.cancel();}
    setPhase(null);
  },[]);
  const suspend=useCallback(()=>{current.current.enabled=false;setEnabled(false);stop();setStatus("Ο ήχος και το μικρόφωνο σταμάτησαν.");},[stop]);
  useEffect(()=>{
    const w=window as VoiceWindow;
    setSupported({input:!!(w.SpeechRecognition||w.webkitSpeechRecognition),output:!!(w.speechSynthesis&&w.SpeechSynthesisUtterance)});
    const refresh=()=>setVoices(window.speechSynthesis?.getVoices()||[]);refresh();
    window.speechSynthesis?.addEventListener("voiceschanged",refresh);
    const hidden=()=>{if(document.hidden)suspend();};document.addEventListener("visibilitychange",hidden);window.addEventListener("pagehide",suspend);
    return()=>{stop();window.speechSynthesis?.removeEventListener("voiceschanged",refresh);document.removeEventListener("visibilitychange",hidden);window.removeEventListener("pagehide",suspend);};
  },[stop,suspend]);
  const speak=useCallback((text:string,explicit=false)=>{
    if(!explicit&&!current.current.enabled)return;
    stop();if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){setStatus("Ο browser δεν υποστηρίζει εκφώνηση. Η απάντηση παραμένει στο κείμενο.");return;}
    const clean=text.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,"$1").replace(/[`*_#]/g,"").trim();if(!clean)return;
    const chunks=clean.match(/[\s\S]{1,200}(?:\s|$)|[\s\S]{1,200}/g)||[clean];
    const token=generation.current,available=window.speechSynthesis.getVoices();
    const selected=available.find(v=>v.voiceURI===current.current.voiceURI)||available.find(v=>/^el(?:-|$)/i.test(v.lang));
    let index=0;
    const next=()=>{
      if(token!==generation.current)return;
      if(index>=chunks.length){utterance.current=null;setPhase(null);setStatus("Η εκφώνηση ολοκληρώθηκε.");return;}
      const u=new SpeechSynthesisUtterance(chunks[index++]);utterance.current=u;u.lang=selected?.lang||"el-GR";u.rate=1;if(selected)u.voice=selected;
      timer.current=setTimeout(()=>{if(token===generation.current){stop();setStatus("Η αναπαραγωγή δεν ξεκίνησε. Πάτησε «Ανάγνωση απάντησης» ή έλεγξε τον ήχο της συσκευής.");}},8000);
      u.onstart=()=>{if(token!==generation.current)return;if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{if(token===generation.current){stop();setStatus("Η εκφώνηση σταμάτησε επειδή δεν ολοκληρώθηκε. Πάτησε Ανάγνωση απάντησης για νέα προσπάθεια.");}},60000);setPhase("speaking");setStatus("Το N7 μιλά.");};
      u.onend=()=>{if(token!==generation.current)return;if(timer.current)clearTimeout(timer.current);timer.current=null;next();};
      u.onerror=()=>{if(token!==generation.current)return;stop();setStatus("Η εκφώνηση διακόπηκε. Η απάντηση είναι διαθέσιμη ως κείμενο.");};
      window.speechSynthesis.speak(u);
    };
    setStatus(selected?"Προετοιμασία φωνής…":"Χρήση της προεπιλεγμένης φωνής της συσκευής. Δεν βρέθηκε ελληνική φωνή.");next();
  },[stop]);
  const listen=useCallback(()=>{
    stop();const w=window as VoiceWindow,Ctor=w.SpeechRecognition||w.webkitSpeechRecognition;
    if(!Ctor){setStatus("Το μικρόφωνο δεν υποστηρίζεται από αυτόν τον browser. Δοκίμασε Chrome ή Edge, ή γράψε το μήνυμα.");return;}
    if(window.speechSynthesis){current.current.enabled=true;setEnabled(true);}
    const r=new Ctor(),token=generation.current;recognition.current=r;r.lang="el-GR";r.continuous=false;r.interimResults=true;
    r.onstart=()=>{if(token===generation.current){setPhase("listening");setStatus("Σε ακούω. Μίλησε και έλεγξε το κείμενο πριν το στείλεις.");}};
    r.onresult=e=>{if(token!==generation.current)return;const text=Array.from(e.results).map(x=>x[0].transcript).join(" ").trim();current.current.onTranscript(text);};
    r.onend=()=>{if(token===generation.current){recognition.current=null;setPhase(null);setStatus("Έλεγξε το μήνυμα και πάτησε Αποστολή.");}};
    r.onerror=e=>{if(token!==generation.current)return;stop();setStatus(({"not-allowed":"Επίτρεψε το μικρόφωνο από τις ρυθμίσεις του browser για αυτό το site.","audio-capture":"Δεν βρέθηκε διαθέσιμο μικρόφωνο.","network":"Η υπηρεσία αναγνώρισης του browser δεν συνδέθηκε. Μπορείς να γράψεις το μήνυμα.","no-speech":"Δεν ακούστηκε ομιλία. Πάτησε ξανά Μικρόφωνο.","language-not-supported":"Η αναγνώριση ελληνικών δεν είναι διαθέσιμη σε αυτόν τον browser."} as Record<string,string>)[e.error]||"Η αναγνώριση σταμάτησε. Μπορείς να συνεχίσεις με κείμενο.");};
    setStatus("Αναμονή άδειας μικροφώνου…");try{r.start();}catch{stop();setStatus("Το μικρόφωνο δεν ξεκίνησε. Έλεγξε την άδεια του browser.");}
  },[stop]);
  const toggle=()=>{const next=!current.current.enabled;current.current.enabled=next;setEnabled(next);if(!next)stop();setStatus(next?"Οι νέες απαντήσεις θα εκφωνούνται. Μπορείς να διακόψεις οποιαδήποτε στιγμή.":"Η αυτόματη εκφώνηση έκλεισε.");};
  return {supported,enabled,phase,status,voices,voiceURI,setVoiceURI,stop,suspend,listen,speak,toggle};
}
