import json,re,numpy as np
from PIL import Image,ImageDraw
D=json.load(open('/home/claude/geraki-historical-atlas/jarvis-intelligence-chamber/data/coast-detail.json'))
MY1=66.48233060009922
def rings():
    out=[];cur=None;x=y=0
    for cmd,args in re.findall(r'([MlLz])([^MlLz]*)',D['d']):
        nums=[float(v) for v in args.replace(',',' ').split()]
        if cmd=='M':x,y=nums[0],nums[1];cur=[(x,y)];out.append(cur)
        elif cmd=='l':
            for i in range(0,len(nums),2):x+=nums[i];y+=nums[i+1];cur.append((x,y))
        elif cmd=='L':
            for i in range(0,len(nums),2):x,y=nums[i],nums[i+1];cur.append((x,y))
    return out
R=rings()
def land_mask(z,x0,y0,W,H):
    s=256*2**z
    img=Image.new('L',(W,H),0);d=ImageDraw.Draw(img)
    for r in R:
        pts=[((cx/30+160)/360*s-x0*256,(0.5-(MY1-cy/30)/360)*s-y0*256) for cx,cy in r]
        if len(pts)>2:d.polygon(pts,fill=255)
    return np.asarray(img)>127
def bbox_mask(z,x0,y0,W,H):
    import math
    s=256*2**z;b=D['bbox']
    X0=(b[0]+180)/360*s-x0*256;X1=(b[2]+180)/360*s-x0*256
    def Y(lat):r=math.radians(lat);return (1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*s-y0*256
    m=np.zeros((H,W),bool);m[max(0,int(Y(b[3]))):max(0,int(Y(b[1]))),max(0,int(X0)):max(0,int(X1))]=True;return m
