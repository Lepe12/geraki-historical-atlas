import io,os,unittest,urllib.error
from unittest import mock
from connectors import repository_connectors as rc

def http_error(code,retry_after=None):
    headers={"Retry-After":retry_after} if retry_after else {}
    return urllib.error.HTTPError("https://pares.example/x",code,"x",headers,io.BytesIO(b""))

class ParesBackoffTest(unittest.TestCase):
    def setUp(self):
        rc._PARES_STATE.update(last=0.0,waited=0.0)
        self.slept=[];self.now=[1000.0]
    def sleep(self,s):self.slept.append(s);self.now[0]+=s
    def clock(self):return self.now[0]
    def run_get(self,outcomes,**env):
        calls=[]
        def fetch(url,headers,timeout):
            calls.append(headers["User-Agent"]);o=outcomes.pop(0)
            if isinstance(o,Exception):raise o
            return o
        with mock.patch.dict(os.environ,{k:str(v) for k,v in env.items()}):
            return rc._pares_get("u",sleep=self.sleep,clock=self.clock,fetch=fetch),calls

    def test_retry_after_honoured_then_success(self):
        body,calls=self.run_get([http_error(429,"7"),b"ok"],PCT_PARES_MIN_DELAY_S=0)
        self.assertEqual(body,b"ok");self.assertEqual(self.slept,[7.0])
        self.assertIn("Mozilla/5.0",calls[0])

    def test_exponential_backoff_with_jitter(self):
        err=http_error(503)
        self.assertEqual(rc._pares_backoff_delay(0,err,base=4,cap=45,rand=lambda:0.5),4)
        self.assertEqual(rc._pares_backoff_delay(2,err,base=4,cap=45,rand=lambda:0.5),16)
        self.assertEqual(rc._pares_backoff_delay(5,err,base=4,cap=45,rand=lambda:0.9),45)

    def test_gives_up_after_retries_and_budget(self):
        with self.assertRaises(urllib.error.HTTPError):
            self.run_get([http_error(429,"5")]*5,PCT_PARES_MIN_DELAY_S=0,PCT_PARES_MAX_RETRIES=2)
        self.assertEqual(self.slept,[5.0,5.0])
        rc._PARES_STATE.update(last=0.0,waited=0.0);self.slept=[]
        with self.assertRaises(urllib.error.HTTPError):
            self.run_get([http_error(429,"30")]*5,PCT_PARES_MIN_DELAY_S=0,PCT_PARES_MAX_TOTAL_WAIT_S=40)
        self.assertEqual(self.slept,[30.0])

    def test_min_delay_between_requests(self):
        self.run_get([b"a"],PCT_PARES_MIN_DELAY_S=3)
        self.run_get([b"b"],PCT_PARES_MIN_DELAY_S=3)
        self.assertEqual(self.slept,[3.0])

    def test_final_status_rate_limited(self):
        with mock.patch.object(rc,"_pares_get",side_effect=http_error(429)):
            status,rows,_=rc.audited_dispatch("PARES / Archivo General de Simancas","Nápoles","specialist")
        self.assertEqual(status,"REMOTE_RATE_LIMITED");self.assertEqual(rows,[])

if __name__=="__main__":unittest.main()
