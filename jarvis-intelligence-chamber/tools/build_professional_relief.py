#!/usr/bin/env python3
"""Color and shade the EXISTING NOAA ETOPO1 grid; its Mercator extent is unchanged.
This is terrain data visualization, not an AI-generated map or historical borders.
"""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'assets/nautical/terrain/mediterranean-elevation.png'
data=np.asarray(Image.open(source).convert('RGB'),dtype=np.float32)
height=(data[:,:,0]/255)**2*4000
dy,dx=np.gradient(height,4500,5000)
normal=np.dstack((-dx*3,-dy*3,np.ones_like(height)))
normal/=np.linalg.norm(normal,axis=2)[:,:,None]
sun=np.array([-0.55,-0.55,0.63]);sun/=np.linalg.norm(sun)
shade=np.clip(0.55+np.sum(normal*sun,axis=2)*0.65,0.52,1.14)
stops=np.array([0,180,600,1300,2300,4000])
palette=np.array([[181,170,119],[144,150,95],[164,153,105],[182,157,113],[204,182,143],[234,219,184]])
rgb=np.stack([np.interp(height,stops,palette[:,c]) for c in range(3)],axis=2)
rgb=np.uint8(np.clip(rgb*shade[:,:,None],0,255))
target=ROOT/'assets/nautical/terrain/professional-relief.png'
Image.fromarray(rgb).resize((1800,1105),Image.Resampling.LANCZOS).save(target,optimize=True)
print(json.dumps({'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'extent':'existing 1800x1105 Mercator nautical chart','asset':target.name,'bytes':target.stat().st_size}))
