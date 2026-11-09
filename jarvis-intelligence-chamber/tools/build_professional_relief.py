#!/usr/bin/env python3
"""Render the existing georeferenced NOAA elevation grid as an engraved atlas.
Relief and contours follow elevation data; paper grain is decorative only.
"""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageFilter
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'assets/nautical/terrain/mediterranean-elevation-2min.png'
elevation=np.asarray(Image.open(source),dtype=np.float32)-12000
height=np.maximum(elevation,0)
# Work at native grid resolution: avoid inventing finer terrain by upscaling first.
dy,dx=np.gradient(height,2250,2500)
normal=np.dstack((-dx*4,-dy*4,np.ones_like(height)))
normal/=np.linalg.norm(normal,axis=2)[:,:,None]
sun=np.array([-.60,-.62,.50]);sun/=np.linalg.norm(sun)
shade=np.clip(.66+np.sum(normal*sun,axis=2)*.60,.47,1.22)
stops=np.array([0,150,400,900,1600,2500,4000])
palette=np.array([[209,178,121],[201,168,108],[192,160,98],[191,159,105],[202,173,122],[222,197,151],[241,223,186]])
rgb=np.stack([np.interp(height,stops,palette[:,c]) for c in range(3)],axis=2)
# Tight elevation bands give a restrained engraved contour treatment.
contours=np.exp(-((np.mod(height,180)-90)/15)**2)*np.clip(height/600,0,1)
lat=np.degrees(2*np.arctan(np.exp(np.radians(66.48233060009922-(np.arange(1105)+.5)/30)))-np.pi/2)[:,None]
green=np.clip((lat-36)/5,0,1)*np.exp(-((height-550)/650)**2)*.55
rgb=rgb*(1-green[:,:,None])+np.array([130,139,79])[None,None,:]*green[:,:,None]
rgb*=shade[:,:,None]*(1-contours[:,:,None]*.13)
rgb=np.uint8(np.clip(rgb,0,255))
img=Image.fromarray(rgb).resize((1800,1105),Image.Resampling.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1,percent=145,threshold=2))
# Deterministic nongeographic paper grain; it does not alter heights/coastlines.
rng=np.random.default_rng(1577)
paper=np.asarray(img,dtype=np.float32)
paper+=rng.normal(0,2.6,(1105,1800,1))
target=ROOT/'assets/nautical/terrain/professional-relief.png'
Image.fromarray(np.uint8(np.clip(paper,0,255))).save(target,optimize=True)
# Bathymetry supplies subtle physical structure to the dark sea.
depth=np.maximum(-elevation,0)
ocean_stops=np.array([0,150,600,1800,3500,6500])
ocean_palette=np.array([[24,73,77],[16,66,74],[11,58,68],[6,46,58],[5,36,47],[4,29,41]])
ocean=np.stack([np.interp(depth,ocean_stops,ocean_palette[:,c]) for c in range(3)],axis=2)
oy,ox=np.gradient(depth,2250,2500)
light=np.clip(1+(-ox-oy)*.3,.88,1.14)
ocean=ocean*light[:,:,None]+rng.normal(0,1.5,(1105,1800,1))
Image.fromarray(np.uint8(np.clip(ocean,0,255))).save(target.with_name('professional-ocean.png'),optimize=True)
print(json.dumps({'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'extent':'existing 1800x1105 Mercator nautical chart','asset':target.name,'bytes':target.stat().st_size}))
