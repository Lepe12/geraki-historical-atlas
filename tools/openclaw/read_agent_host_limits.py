#!/usr/bin/env python3
"""Read only N7-agent private resource-limit snapshot through existing FTPS credentials."""
import ftplib
import json
import os
import socket
import ssl
import urllib.request

DOMAIN = 'n7-agent.piratecartography.com'
TARGET = '/' + DOMAIN
TLS = 'linux3087.grserver.gr'
FILE = '.n7-agent-state/host-limits.json'


def connect():
    host=os.environ['PCT_FTPS_HOST']
    port=int(os.getenv('PCT_FTPS_PORT','21'))
    ips=lambda x: {r[4][0] for r in socket.getaddrinfo(x,port,type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):
        raise RuntimeError('UNEXPECTED_FTPS_HOST')
    ftp=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
    ftp.connect(host,port)
    ftp.host=TLS
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    return ftp


def main():
    url='https://' + DOMAIN + '/health'
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'N7-private-technical-diagnostics/1'}),timeout=20) as response:
        if response.status != 200:
            raise RuntimeError('AGENT_HEALTH_STATUS_NOT_200')
        health=json.loads(response.read(5000))
    if health.get('service') != 'n7-agent-passenger-openclaw-supervisor':
        raise RuntimeError('UNEXPECTED_HEALTH_SERVICE')
    if health.get('gatewayLaunchState') != 'disabled_after_host_sigkill':
        raise RuntimeError('UNEXPECTED_GATEWAY_AUTOSTART_STATUS')
    print('N7_AGENT_PASSENGER_LIVE=true')
    print('N7_AGENT_GATEWAY_AUTOSTART_DISABLED=true')

    ftp=connect()
    try:
        ftp.cwd(TARGET)
        content=[]
        ftp.retrbinary('RETR ' + FILE,content.append)
        data=b''.join(content)
        if len(data) > 16000:
            raise RuntimeError('DIAGNOSTIC_FILE_UNEXPECTEDLY_LARGE')
        metrics=json.loads(data)
        if metrics.get('schemaVersion')!=1:
            raise RuntimeError('UNKNOWN_DIAGNOSTIC_SCHEMA')
        for key in ('sourceAvailable','memory','processLimits'):
            if not isinstance(metrics.get(key),dict):
                raise RuntimeError('INCOMPLETE_METRICS')
        # No secrets, PIDs, file paths, usernames, or arbitrary text are returned.
        print('N7_RESOURCE_TIMESTAMP=' + metrics['capturedAt'])
        print('N7_RESOURCE_SOURCES=' + json.dumps(metrics['sourceAvailable'],sort_keys=True))
        print('N7_RESOURCE_MEMORY_MB=' + json.dumps(metrics['memory'],sort_keys=True))
        print('N7_RESOURCE_PROCESSES=' + json.dumps(metrics['processLimits'],sort_keys=True))
        print('N7_RESOURCE_DIAGNOSTIC_READBACK=PASS')
    finally:
        try: ftp.quit()
        except ftplib.all_errors: ftp.close()


if __name__=='__main__':main()
