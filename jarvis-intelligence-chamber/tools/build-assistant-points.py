"""Build assets/assistant/athena-hope-points.bin from the public-domain SMK scan (see assets/assistant/README.md).
Usage: python3 tools/build-assistant-points.py athena_hope.stl assets/assistant/athena-hope-points.bin   (needs numpy)"""
import numpy as np
rng=np.random.default_rng(7)
import sys
# binary STL: 80-byte header, uint32 count, then 50 bytes per triangle (normal, 3 vertices, attribute)
raw=open(sys.argv[1],'rb').read(); n=int(np.frombuffer(raw[80:84],'<u4')[0])
rec=np.frombuffer(raw[84:84+50*n],dtype=np.dtype([('n','<f4',3),('v','<f4',(3,3)),('a','<u2')]))
V=rec['v'].astype(np.float64)
T=np.stack([V[...,0],V[...,2],-V[...,1]],-1)
T=T[T[...,1].min(1)>=16.5]
a,b,c=T[:,0],T[:,1],T[:,2]
n=np.cross(b-a,c-a); area=np.linalg.norm(n,axis=1)*.5; nn=n/np.maximum(area[:,None]*2,1e-12)
# center
cx=(T[...,0].min()+T[...,0].max())/2; cz=np.average(T[...,2].mean(1),weights=area); y0=16.5
H=T[...,1].max()-y0; s=2.0/H
def norm(p): return np.stack([(p[:,0]-cx)*s,(p[:,1]-y0)*s-1.0,(p[:,2]-cz)*s],1)
# surface points
NS=26000
idx=rng.choice(len(T),NS,p=area/area.sum())
u=rng.random(NS);v=rng.random(NS);f=u+v>1;u[f]=1-u[f];v[f]=1-v[f]
P=a[idx]+(b[idx]-a[idx])*u[:,None]+(c[idx]-a[idx])*v[:,None]; N=nn[idx]
# contour lines
step=1.15; sp=0.42
LP=[];LN=[]
ymin=T[...,1].min(1); ymax=T[...,1].max(1)
for h in np.arange(y0+0.5,T[...,1].max(),step):
  m=(ymin<h)&(ymax>h); tr=T[m]; tn=nn[m]
  d=tr[...,1]-h
  segs=[]
  pts=[]
  for (i,j) in ((0,1),(1,2),(2,0)):
    di,dj=d[:,i],d[:,j]; cr=(di*dj)<0
    t=np.where(cr,di/np.where(cr,di-dj,1),0)
    pts.append((tr[:,i]+(tr[:,j]-tr[:,i])*t[:,None],cr))
  P3=np.stack([p for p,_ in pts],1); C3=np.stack([c for _,c in pts],1)
  ok=C3.sum(1)==2
  P3=P3[ok];C3=C3[ok];tn2=tn[ok]
  # pick the two crossing points
  order=np.argsort(~C3,axis=1,kind='stable')[:,:2]
  p0=P3[np.arange(len(P3)),order[:,0]]; p1=P3[np.arange(len(P3)),order[:,1]]
  L=np.linalg.norm(p1-p0,axis=1); cum=np.cumsum(L); tot=cum[-1] if len(cum) else 0
  k=int(tot/sp)
  if k<1: continue
  q=(np.arange(k)+rng.random())*sp
  si=np.searchsorted(cum,q); si=np.minimum(si,len(L)-1)
  st=(q-(cum[si]-L[si]))/np.maximum(L[si],1e-9)
  LP.append(p0[si]+(p1[si]-p0[si])*st[:,None]); LN.append(tn2[si])
LP=np.concatenate(LP);LN=np.concatenate(LN)
print('surface',NS,'lines',len(LP))
pos=np.concatenate([norm(LP),norm(P)]); nor=np.concatenate([LN,N]); nor=np.stack([nor[:,0],nor[:,1],nor[:,2]],1)
kind=np.concatenate([np.zeros(len(LP)),np.ones(NS)]).astype(np.uint8)
perm=rng.permutation(len(pos)); pos,nor,kind=pos[perm],nor[perm],kind[perm]
N=len(pos)
nor=nor/np.maximum(np.linalg.norm(nor,axis=1,keepdims=True),1e-9)
out=np.uint32(N).tobytes()+np.round(np.clip(pos,-1,1)*32767).astype('<i2').tobytes()+np.round(nor*127).astype('i1').tobytes()+kind.astype('u1').tobytes()
open(sys.argv[2],'wb').write(out); print(N,len(out))
