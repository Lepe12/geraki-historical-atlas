import numpy as np, math, sys, os
from PIL import Image, ImageFilter
from scipy import ndimage as nd
def load(z,x,y):
    p=f'raw/{z}/{x}/{y}.jpeg'
    return np.asarray(Image.open(p).convert('RGB')).astype(np.float32)/255 if os.path.exists(p) else None
def mosaic(z,x0,x1,y0,y1):
    H=(y1-y0+1)*256;W=(x1-x0+1)*256;A=np.zeros((H,W,3),np.float32)
    for x in range(x0,x1+1):
        for y in range(y0,y1+1):
            t=load(z,x,y)
            if t is not None:A[(y-y0)*256:(y-y0+1)*256,(x-x0)*256:(x-x0+1)*256]=t
    return A
def ramp(v,stops):
    v=np.clip(v,0,1);xs=[s[0] for s in stops];out=np.zeros(v.shape+(3,),np.float32)
    for c in range(3):out[...,c]=np.interp(v,xs,[s[1][c] for s in stops])
    return out/255
LAND=[(0,(46,34,23)),(.35,(100,76,50)),(.6,(156,124,86)),(.85,(202,174,130)),(1,(226,204,164))]
SEA=[(0,(16,36,33)),(.5,(28,56,50)),(.8,(42,78,68)),(1,(66,104,90))]
def stylize(A,z,x0=0,y0=0):
    r,g,b=A[...,0],A[...,1],A[...,2]
    L0=0.3*r+0.59*g+0.11*b
    sea=((b>r*1.08)&(b>g*0.98))|((L0<0.13)&(b>=r*0.95))
    sea=nd.binary_opening(sea,iterations=1)
    lab,n=nd.label(~sea);sz=nd.sum(np.ones_like(L0),lab,range(1,n+1))
    small=np.isin(lab,np.where(sz<(6 if z==7 else 14))[0]+1);sea=sea|small
    sea0=sea.copy()
    try:
        import mask as MK;H,W=sea.shape;inside=MK.bbox_mask(z,x0,y0,W,H);lm=MK.land_mask(z,x0,y0,W,H)
        sea=np.where(inside,~lm,sea)
    except Exception as e:print('mask',e)
    L=0.3*r+0.59*g+0.11*b
    s=2.0 if z==7 else 3.0
    base=nd.gaussian_filter(L,s*4);hp=L-base
    tone=np.clip((base-0.12)/0.5,0,1)*0.5+0.22+nd.gaussian_filter(hp,0.6)*2.2
    w=(~sea0).astype(np.float32);num=nd.gaussian_filter(tone*w,6);den=nd.gaussian_filter(w,6)+1e-4
    tone=np.where(sea0,np.clip(num/den,0.3,0.8),tone)
    land=ramp(tone,LAND)
    # bathymetry from blue brightness
    bb=nd.gaussian_filter(b,1.0);bt=np.clip((bb-0.12)/0.55,0,1);bt=np.where(sea0,bt,0.82)
    seac=ramp(bt*0.9+0.05,SEA)
    # coast: soft dark rim on land, light rim on sea
    d_land=nd.distance_transform_edt(~sea);d_sea=nd.distance_transform_edt(sea)
    rim=np.exp(-d_land/ (1.2 if z==7 else 1.8))
    land=land*(1-0.55*rim[...,None])
    glow=np.exp(-d_sea/(3 if z==7 else 5))
    seac=seac+np.array([0.10,0.12,0.09])*glow[...,None]*0.8
    out=np.where(sea[...,None],seac,land)
    # paper grain
    rng=np.random.default_rng(1);n=nd.gaussian_filter(rng.standard_normal(L.shape),0.7)*0.018
    out=np.clip(out+n[...,None],0,1)
    return out
if __name__=='__main__':
    z=int(sys.argv[1]);x0,x1,y0,y1=map(int,sys.argv[2:6])
    A=mosaic(z,x0,x1,y0,y1);O=stylize(A,z,x0,y0)
    Image.fromarray((O*255).astype(np.uint8)).save(sys.argv[6],quality=88)
