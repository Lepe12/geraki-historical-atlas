#!/usr/bin/env python3
"""Reconstruct pinned public Greek voice assets; no models committed to Git."""
import argparse,hashlib,io,json,pathlib,tarfile,urllib.request
ASSET_VERSION='rapunzelina-v1'
FILES={
'model.onnx':'7824cd5c9912e8aab9fce653f7af9d609c4e2e1d6e4c81d823699afa6d1b1537',
'config.json':'24ccc31c1306df4364fd85b56aeb09aba8c185a1fdf7db1367a72d4affe478e4',
'ort-wasm-simd.wasm':'f533b5f21790563d7556c611c3835ac65848ee326da2689aac54ed7d9cc8c6a4',
'ort-wasm.wasm':'ebe7ec327f83aabc07e3b58487522481ccff10941f24182ab0428d0123652ff2',
'ort.wasm.min.js':'90533a3fd7006df7f897c0d63c468996da5c8e430e39964d92ebe586c4996614',
'piper_phonemize.data':'29f1025eb23a5b5c192cd14a6efbce4509402ff265405072ee6f7d1a09b78f8c',
'piper_phonemize.js':'fef0c2fc442d24fdef5c7c7cc37d5da2314407640fe11ab1bfe347c723dff19b',
'piper_phonemize.wasm':'b777cd107a91d2bcc6a1ea46f2c26a662a7407394fe84589198aeaa83dd7a9d6'}
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 a=argparse.ArgumentParser();a.add_argument('--out',required=True);args=a.parse_args();out=pathlib.Path(args.out);out.mkdir(parents=True,exist_ok=True)
 cache=out.parent/'voice-download-cache';cache.mkdir(exist_ok=True)
 def archive(url,name):
  p=cache/name
  if not p.exists():
   with urllib.request.urlopen(url,timeout=120) as r,p.open('wb') as f:
    while b:=r.read(1024*1024):f.write(b)
  return tarfile.open(p)
 def save(name,data):
  if name in FILES and sha(data)!=FILES[name]:raise RuntimeError('VOICE_ASSET_HASH_MISMATCH_'+name)
  (out/name).write_bytes(data)
 with archive('https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-el_GR-rapunzelina-low.tar.bz2','greek.tar.bz2') as t:
  root='vits-piper-el_GR-rapunzelina-low/'
  for target,source in [('model.onnx','el_GR-rapunzelina-low.onnx'),('config.json','el_GR-rapunzelina-low.onnx.json'),('MODEL_CARD.txt','MODEL_CARD')]:save(target,t.extractfile(root+source).read())
 for url,key,names,prefix in [
  ('https://registry.npmjs.org/@diffusionstudio/piper-wasm/-/piper-wasm-1.0.0.tgz','phonemizer.tgz',['piper_phonemize.js','piper_phonemize.data','piper_phonemize.wasm'],'package/build/'),
  ('https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.18.0.tgz','ort.tgz',['ort.wasm.min.js','ort-wasm-simd.wasm','ort-wasm.wasm'],'package/dist/')]:
  with archive(url,key) as t:
   for name in names:save(name,t.extractfile(prefix+name).read())
 notice='''N7 Greek female voice: Piper el_GR-rapunzelina-low (16 kHz, single speaker).\nModel dataset license: CC0; see MODEL_CARD.txt.\nSource model: https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models\nPiper WASM wrapper 1.0.0: MIT, Konstantin Paulus.\nSource/build instructions: https://github.com/diffusion-studio/piper-wasm/tree/69522c832bd52d7c16389e9a8aee568065027689\nPiper phonemizer source: https://github.com/wide-video/piper-phonemize\neSpeak NG component: GPL-3.0; source: https://github.com/rhasspy/espeak-ng\nONNX Runtime Web 1.18.0: MIT, Microsoft Corporation.\nSource: https://github.com/microsoft/onnxruntime/tree/v1.18.0\nVoice inference runs locally in the browser. No user text is sent to a speech provider.\n'''
 save('NOTICE.txt',notice.encode())
 for name,url in [('ESPEAK_COPYING.txt','https://raw.githubusercontent.com/rhasspy/espeak-ng/master/COPYING'),('ONNX_LICENSE.txt','https://raw.githubusercontent.com/microsoft/onnxruntime/v1.18.0/LICENSE')]:
  with urllib.request.urlopen(url,timeout=30) as r:save(name,r.read())
 files={p.name:sha(p.read_bytes()) for p in out.iterdir() if p.is_file() and p.name!='manifest.json'}
 manifest={'product':'N7-GREEK-FEMALE-VOICE','version':ASSET_VERSION,'voice':'el_GR-rapunzelina-low','files':files}
 (out/'manifest.json').write_text(json.dumps(manifest,sort_keys=True,indent=2)+'\n');print('N7_FEMALE_VOICE_ASSETS_READY '+json.dumps({'version':ASSET_VERSION,'files':len(files),'bytes':sum(p.stat().st_size for p in out.iterdir())}))
if __name__=='__main__':main()
