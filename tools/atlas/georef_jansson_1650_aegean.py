import json,math,numpy as np
from PIL import Image
from scipy.interpolate import LinearNDInterpolator
from scipy.ndimage import map_coordinates
src=open('warp.py').read();G=eval(src[src.index('G=[')+2:src.index(']\nsrc=')+1])
LON0,K,MY1=-20,30,66.48233060009922
M=lambda la: math.degrees(math.log(math.tan(math.pi/4+math.radians(la)/2)))
P=lambda la,lo: ((lo-LON0)*K,(MY1-M(la))*K)
m=json.load(open('jansson_warp.json'))
s=np.array([[g[3],g[4]] for g in G],float);d=np.array([P(g[1],g[2]) for g in G])
A=np.c_[s,np.ones(len(s))];coef,*_=np.linalg.lstsq(A,d,rcond=None)
F=np.array([(640,240),(3200,240),(5760,240),(640,1300),(5760,1300),(640,2400),(3200,2400),(5760,2400)],float)
interp=LinearNDInterpolator(np.r_[d,np.c_[F,np.ones(len(F))]@coef],np.r_[s,F])
FS=3.13783;X0,Y0=10880,2730
x0,y0=P(41.2,19.5);x1,y1=P(34.6,30.0);SC=10
W=int((x1-x0)*SC);H=int((y1-y0)*SC);XX,YY=np.meshgrid(np.linspace(x0,x1,W),np.linspace(y0,y1,H))
uv=interp(np.c_[XX.ravel(),YY.ravel()]).reshape(H,W,2)*FS-np.array([X0,Y0])
im=np.asarray(Image.open('aeg_full.jpg').convert('RGB')).astype(np.float32)
ok=(~np.isnan(uv[...,0]))&(uv[...,0]>=0)&(uv[...,1]>=0)&(uv[...,0]<im.shape[1]-1)&(uv[...,1]<im.shape[0]-1)
out=np.zeros((H,W,3),np.uint8)
for c in range(3):out[...,c]=np.clip(map_coordinates(im[...,c],[np.nan_to_num(uv[...,1]),np.nan_to_num(uv[...,0])],order=1),0,255)
print(W,H,ok.mean())
Image.fromarray(out).save('jansson_aegean.jpg',quality=80)
json.dump({'x':x0,'y':y0,'w':x1-x0,'h':y1-y0},open('jansson_aegean.json','w'))
