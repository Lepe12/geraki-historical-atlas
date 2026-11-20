# Re-route the Belavilas sea lanes (data/belavilas.json "stops") through the chart's sea.
# landmask.png comes from tools/atlas/chart_land_mask.cjs (rasterises #landP of the 2D chart).
import json,math,heapq,sys
import numpy as np
from PIL import Image
from scipy import ndimage
SC=1
im=np.array(Image.open('landmask.png').convert('L').resize((1800,1105)))>127
land=im
dist=ndimage.distance_transform_edt(~land)  # distance to land for sea pixels
my1=66.48233060009922;k=30;lon0=-20
M=lambda la: math.degrees(math.log(math.tan(math.pi/4+math.radians(la)/2)))
Mi=lambda m: math.degrees(2*math.atan(math.exp(math.radians(m)))-math.pi/2)
def toxy(la,lo):return ((lo-lon0)*k,(my1-M(la))*k)
def toll(x,y):return (Mi(my1-y/k),x/k+lon0)
H,W=land.shape
cost=np.where(land,80.0,1.0+np.where(dist<3,2.0,0.0))
def snap(x,y):
    xi,yi=int(round(x)),int(round(y))
    if not land[yi,xi]:return xi,yi
    best=None
    for r in range(1,25):
        for dy in range(-r,r+1):
            for dx in range(-r,r+1):
                X,Y=xi+dx,yi+dy
                if 0<=X<W and 0<=Y<H and not land[Y,X]:
                    d=dx*dx+dy*dy
                    if best is None or d<best[0]:best=(d,X,Y)
        if best:return best[1],best[2]
    return xi,yi
def astar(a,b):
    (ax,ay),(bx,by)=a,b
    x0,x1=max(0,min(ax,bx)-60),min(W-1,max(ax,bx)+60);y0,y1=max(0,min(ay,by)-60),min(H-1,max(ay,by)+60)
    st=(ax,ay);g={st:0};prev={};pq=[(0,st)]
    N=[(1,0,1),(-1,0,1),(0,1,1),(0,-1,1),(1,1,1.414),(1,-1,1.414),(-1,1,1.414),(-1,-1,1.414)]
    while pq:
        f,cur=heapq.heappop(pq)
        if cur==(bx,by):break
        cx,cy=cur;gc=g[cur]
        for dx,dy,w in N:
            X,Y=cx+dx,cy+dy
            if not(x0<=X<=x1 and y0<=Y<=y1):continue
            ng=gc+w*cost[Y,X]
            if ng<g.get((X,Y),1e18):
                g[(X,Y)]=ng;prev[(X,Y)]=cur;heapq.heappush(pq,(ng+math.hypot(bx-X,by-Y),(X,Y)))
    path=[(bx,by)];c=(bx,by)
    while c!=st:c=prev[c];path.append(c)
    return path[::-1]
def rdp(pts,eps):
    if len(pts)<3:return pts
    a,b=np.array(pts[0],float),np.array(pts[-1],float);d=b-a;n=np.hypot(*d) or 1
    dists=[abs(d[0]*(a[1]-p[1])-d[1]*(a[0]-p[0]))/n for p in pts[1:-1]]
    i=int(np.argmax(dists))+1
    if dists[i-1]>eps:return rdp(pts[:i+1],eps)[:-1]+rdp(pts[i:],eps)
    return [pts[0],pts[-1]]
def segland(p,q,clr=0):
    n=int(max(abs(q[0]-p[0]),abs(q[1]-p[1])))*2+1
    for t in range(n+1):
        X=int(round(p[0]+(q[0]-p[0])*t/n));Y=int(round(p[1]+(q[1]-p[1])*t/n))
        if land[Y,X] or (clr and dist[Y,X]<clr and t not in (0,n)):return True
    return False
def taut(pts):
    out=[pts[0]];i=0
    while i<len(pts)-1:
        j=len(pts)-1
        while j>i+1 and segland(pts[i],pts[j],1.6):j-=1
        out.append(pts[j]);i=j
    return out
def rdp_safe(pts,eps):
    out=rdp(pts,eps)
    # ensure simplified segments do not cross land; refine where they do
    res=[out[0]]
    for a,b in zip(out,out[1:]):
        if segland(a,b):
            i,j=pts.index(a),pts.index(b);sub=pts[i:j+1]
            res+=rdp_safe(sub,eps/2)[1:] if eps>0.3 and len(sub)>2 else sub[1:]
        else:res.append(b)
    return res
p=sys.argv[1] if len(sys.argv)>1 else 'jarvis-intelligence-chamber/data/belavilas.json'
d=json.load(open(p))
for r in d['routes']:
    r.setdefault('stops',r['lines'])
    new=[]
    for ln in r['stops']:
        nodes=[snap(*toxy(la,lo)) for la,lo in ln]
        simp=[nodes[0]]
        for a,b in zip(nodes,nodes[1:]):
            if a==b:continue
            simp+=taut(astar(a,b))[1:]
        crossings=sum(segland(a,b) for a,b in zip(simp,simp[1:]))
        new.append([[round(v,3) for v in toll(x,y)] for x,y in simp])
        print(r['id'],len(ln),'->',len(simp),'land segs',crossings)
    r['lines']=new
json.dump(d,open(p,'w'),ensure_ascii=False,indent=1)
