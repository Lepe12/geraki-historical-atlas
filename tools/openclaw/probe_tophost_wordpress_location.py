#!/usr/bin/env python3
"""Read-only short FTPS layout preflight: find where WordPress actually resides."""
import ftplib
import json
import os
import socket
import ssl

EXPECT='linux3087.grserver.gr'
CHECK=(
 '/',
 '/piratecartography-deploy','/piratecartography-gateway','/piratecartography-system',
 '/bot.piratecartography.com','/n7-agent.piratecartography.com',
 '/httpdocs','/public_html','/www',
 '/piratecartography-deploy/httpdocs','/piratecartography-system/httpdocs',
 '/piratecartography-deploy/public_html','/piratecartography-system/public_html',
 '/piratecartography-gateway/httpdocs','/piratecartography-gateway/public_html',
)
WP = {'wp-content','wp-admin','wp-includes','wp-config.php','wp-load.php'}
KNOWN = WP | {'httpdocs','public_html','wordpress','www','wwwroot','public','htdocs','wp','uploads','n7-app','node_modules','.openclaw-staging','index.php','index.html','package.json','app.js'}
def connect():
    host=os.environ['PCT_FTPS_HOST'];port=int(os.getenv('PCT_FTPS_PORT','21'))
    def ips(name): return {x[4][0] for x in socket.getaddrinfo(name,port,type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(EXPECT)): raise RuntimeError('UNEXPECTED_FTPS_HOST')
    f=ftplib.FTP_TLS(timeout=32,context=ssl.create_default_context())
    f.connect(host,port);f.host=EXPECT
    f.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    f.prot_p()
    return f
def listing(f,where):
    try:
        result=list(f.mlsd(where,facts=['type','size']))
    except ftplib.error_perm as e:
        if str(e).startswith('550'): return {'accessible':False}
        return {'accessible':False,'error':'FTP_PERMISSION'}
    names={name for name,_ in result}
    dirs=[name for name,facts in result if facts.get('type')=='dir']
    # Only whitelisted names printed, no secrets or private file content.
    matched=sorted(names & KNOWN)
    if where=='/':
        root_candidate_dirs=sorted(x for x in dirs if (
            x.lower().endswith('.com') or x.lower().startswith('piratecartography')
            or x.lower() in ('httpdocs','public_html','www','domains','htdocs')))
    else:
        root_candidate_dirs=[]
    files=sum(1 for _,facts in result if facts.get('type')=='file')
    total=sum(int(facts['size']) for _,facts in result if facts.get('type')=='file' and facts.get('size','').isdigit())
    return {'accessible':True,'entries':len(result),'dirs':len(dirs),
            'files':files,'immediate_known_bytes':total,'matched_known_entries':matched,
            'wp_root_detected':len(names & WP)>=3,'root_candidate_dirs':root_candidate_dirs}
def main():
    f=connect()
    try:
        for folder in CHECK:
            print('N7_X8_FTPS_LAYOUT '+json.dumps({'folder':folder,**listing(f,folder)},sort_keys=True),flush=True)
        print('N7_X8_FTPS_LAYOUT_READ_ONLY=PASS',flush=True)
    finally:
        try:f.quit()
        except ftplib.all_errors:f.close()
if __name__=='__main__': main()
