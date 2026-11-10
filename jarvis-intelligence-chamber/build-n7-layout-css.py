# Regenerate n7-layout.css from n7-layout.src.css (adds #n7Shell specificity prefixes over legacy !important rules):
#   python3 jarvis-intelligence-chamber/build-n7-layout-css.py jarvis-intelligence-chamber/n7-layout.src.css jarvis-intelligence-chamber/n7-layout.css
import re,sys
src=open(sys.argv[1],encoding='utf-8').read()
def pre(sel):
    out=[]
    for part in sel.split(','):
        p=part.strip()
        if not p: continue
        if p.startswith('body.n7-layout'): out.append(p.replace('body.n7-layout','body.n7-layout.atlas-ui.atlas-reading',1))
        elif p.startswith('#n7Shell'): out.append('body.n7-layout.atlas-ui '+p)
        elif p.startswith('body'): out.append(p)
        else: out.append('body.n7-layout.atlas-ui #n7Shell '+p)
    return ','.join(out)
def walk(s):
    res='';i=0
    while i<len(s):
        j=s.find('{',i)
        if j<0: res+=s[i:];break
        head=s[i:j]
        # comments
        m=re.match(r'(\s*(?:/\*.*?\*/\s*)*)(.*)$',head,re.S)
        lead,sel=m.group(1),m.group(2)
        # find matching brace
        d=0;k=j
        while True:
            if s[k]=='{':d+=1
            elif s[k]=='}':
                d-=1
                if d==0:break
            k+=1
        body=s[j+1:k]
        if sel.strip().startswith('@media'): res+=lead+sel+'{'+walk(body)+'}'
        elif sel.strip().startswith('@'): res+=lead+sel+'{'+body+'}'
        else: res+=lead+pre(sel)+'{'+body+'}'
        i=k+1
    return res
open(sys.argv[2],'w',encoding='utf-8').write(walk(src))
