#!/usr/bin/env python3
"""Resample the NOAA ETOPO1 two-arcminute CSV to the existing Mercator grid.
Download query and source provenance: assets/nautical/terrain/mediterranean-elevation-2min.json.
Usage: python tools/resample_professional_elevation.py etopo.csv
Requires NumPy and Pillow. Does not change the original 3D terrain data.
"""
import sys,math
from pathlib import Path
import numpy as np
from PIL import Image
rows=np.loadtxt(sys.argv[1],delimiter=',',skiprows=2)
lats,lons=np.unique(rows[:,0]),np.unique(rows[:,1])
z=rows[:,2].reshape(len(lats),len(lons))
W,H,K,LON0,MY1=1800,1105,30.,-20.,66.48233060009922
lon=LON0+(np.arange(W)+.5)/K
lat=np.degrees(2*np.arctan(np.exp(np.radians(MY1-(np.arange(H)+.5)/K)))-math.pi/2)
fi=np.interp(lat,lats,np.arange(len(lats)));fj=np.interp(lon,lons,np.arange(len(lons)))
i0=np.floor(fi).astype(int).clip(0,len(lats)-2);j0=np.floor(fj).astype(int).clip(0,len(lons)-2)
ti=(fi-i0)[:,None];tj=(fj-j0)[None,:]
g=(z[i0][:,j0]*(1-ti)*(1-tj)+z[i0][:,j0+1]*(1-ti)*tj+z[i0+1][:,j0]*ti*(1-tj)+z[i0+1][:,j0+1]*ti*tj)
target=Path(__file__).resolve().parents[1]/'assets/nautical/terrain/mediterranean-elevation-2min.png'
Image.fromarray(np.uint16(np.round(g)+12000)).save(target,optimize=True)
print(target)
