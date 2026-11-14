#!/usr/bin/env python3
"""Prepare a pinned CC0 rigged human, keeping real geometry/skin and useful morphs."""
import argparse,copy,hashlib,io,json,pathlib,struct,urllib.request
from PIL import Image
SOURCE='https://raw.githubusercontent.com/met4citizen/TalkingHead/1563de184c19b310de4b636664d5835e2c74dbba/avatars/mpfb.glb'
SHA='63c645a2a863b9972e9a9c2ed576a1de4c390b8475508e1473e69c87a3ee299c'
def prepare(raw):
 if hashlib.sha256(raw).hexdigest()!=SHA:raise ValueError('Original avatar checksum mismatch')
 magic,version,total=struct.unpack_from('<4sII',raw);assert magic==b'glTF' and version==2 and total==len(raw)
 size,_=struct.unpack_from('<II',raw,12);d=json.loads(raw[20:20+size]);start=20+size;length,kind=struct.unpack_from('<II',raw,start);blob=raw[start+8:start+8+length]
 keep={'eyeBlinkLeft','eyeBlinkRight','jawOpen','mouthSmileLeft','mouthSmileRight','browInnerUp','mouthFunnel','mouthPucker'}
 for i,m in enumerate(d['meshes']):
  names=m.get('extras',{}).get('targetNames',[])
  if not names:continue
  selected=[j for j,n in enumerate(names)if n in keep or n.startswith('viseme_')]
  for p in m['primitives']:
   if 'targets'in p:p['targets']=[p['targets'][j]for j in selected]
  m['extras']['targetNames']=[names[j]for j in selected]
  if 'weights'in m:m['weights']=[m['weights'][j]for j in selected]
  for node in d['nodes']:
   if node.get('mesh')==i and 'weights'in node:node['weights']=[node['weights'][j]for j in selected]
 used=set()
 def refs(obj):
  for m in obj['meshes']:
   for p in m['primitives']:
    yield from p['attributes'].values()
    if 'indices'in p:yield p['indices']
    for t in p.get('targets',[]):yield from t.values()
  for s in obj.get('skins',[]):yield s['inverseBindMatrices']
  for a in obj.get('animations',[]):
   for s in a['samplers']:yield s['input'];yield s['output']
 used.update(refs(d));mapping={old:new for new,old in enumerate(sorted(used))};accessors=[copy.deepcopy(d['accessors'][old])for old in sorted(used)]
 for m in d['meshes']:
  for p in m['primitives']:
   p['attributes']={k:mapping[v]for k,v in p['attributes'].items()}
   if 'indices'in p:p['indices']=mapping[p['indices']]
   for t in p.get('targets',[]):
    for k,v in list(t.items()):t[k]=mapping[v]
 for s in d.get('skins',[]):s['inverseBindMatrices']=mapping[s['inverseBindMatrices']]
 for a in d.get('animations',[]):
  for s in a['samplers']:s['input']=mapping[s['input']];s['output']=mapping[s['output']]
 oldviews=d['bufferViews'];output=bytearray();views=[];viewmap={}
 def append(data,old=None):
  output.extend(b'\0'*((-len(output))%4));index=len(views);v={'buffer':0,'byteOffset':len(output),'byteLength':len(data)}
  if old:
   for k in ['byteStride','target']:
    if k in old:v[k]=old[k]
  views.append(v);output.extend(data);return index
 def view(index):
  if index not in viewmap:
   v=oldviews[index];at=v.get('byteOffset',0);viewmap[index]=append(blob[at:at+v['byteLength']],v)
  return viewmap[index]
 for a in accessors:
  if 'bufferView'in a:a['bufferView']=view(a['bufferView'])
  if 'sparse'in a:
   for k in ['indices','values']:a['sparse'][k]['bufferView']=view(a['sparse'][k]['bufferView'])
 for image in d.get('images',[]):
  v=oldviews[image['bufferView']];at=v.get('byteOffset',0);im=Image.open(io.BytesIO(blob[at:at+v['byteLength']])).convert('RGBA');im.thumbnail((1024,1024),Image.Resampling.LANCZOS);b=io.BytesIO();im.save(b,format='WEBP',quality=90,method=4);image['bufferView']=append(b.getvalue());image['mimeType']='image/webp'
 for texture in d.get('textures',[]):texture.setdefault('extensions',{})['EXT_texture_webp']={'source':texture.pop('source')}
 d['extensionsUsed']=['EXT_texture_webp'];d['extensionsRequired']=['EXT_texture_webp'];d['accessors']=accessors;d['bufferViews']=views;d['buffers']=[{'byteLength':len(output)}]
 d['asset']['copyright']='CC0; MPFB avatar from met4citizen/TalkingHead';d['asset']['extras']={'source':SOURCE,'originalSHA256':SHA,'preparation':'retained real skin/rig and viseme/blink/jaw morphs; texture size capped at 1024'}
 encoded=json.dumps(d,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);output.extend(b'\0'*((-len(output))%4));result=struct.pack('<4sII',b'glTF',2,12+8+len(encoded)+8+len(output))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(output),b'BIN\0')+output
 assert len(result)<20*1024*1024
 return result,{'sourceBytes':len(raw),'bytes':len(result),'bones':len(d['skins'][0]['joints']),'morphs':d['meshes'][0]['extras']['targetNames'],'sha256':hashlib.sha256(result).hexdigest()}
def main():
 a=argparse.ArgumentParser();a.add_argument('--out',required=True);a.add_argument('--source');args=a.parse_args();out=pathlib.Path(args.out);out.mkdir(parents=True,exist_ok=True)
 raw=pathlib.Path(args.source).read_bytes()if args.source else urllib.request.urlopen(SOURCE,timeout=120).read();model,meta=prepare(raw);(out/'n7-mpfb-v1.glb').write_bytes(model);(out/'n7-mpfb-v1.json').write_text(json.dumps(meta,indent=2)+'\n');(out/'N7-3D-NOTICE.txt').write_text('MPFB avatar: CC0, from met4citizen/TalkingHead.\nSource: '+SOURCE+'\nTalkingHead code: MIT. Model prepared for N7; existing geometry and rig preserved.\n');print(json.dumps(meta))
if __name__=='__main__':main()
