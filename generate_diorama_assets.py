from PIL import Image, ImageDraw, ImageFilter
import math, random, os

W,H=512,320
OUT="_site/icons"
os.makedirs(OUT,exist_ok=True)

def iso(x,y,z=0,origin=(256,250),sx=3.2,sy=1.8,sz=3.0):
    ox,oy=origin
    return (ox+(x-y)*sx, oy-(x+y)*sy-z*sz)

def poly(draw,pts,fill,outline=None,width=1):
    draw.polygon(pts,fill=fill)
    if outline:
        draw.line(pts+[pts[0]],fill=outline,width=width,joint="curve")

def render(kind,seed):
    random.seed(seed)
    im=Image.new("RGBA",(W,H),(0,0,0,0))
    sh=Image.new("RGBA",(W,H),(0,0,0,0))
    sd=ImageDraw.Draw(sh)
    dr=ImageDraw.Draw(im)

    dr.ellipse([88,210,430,296],fill=(118,102,62,34))
    for _ in range(100):
        x=random.randint(100,418); y=random.randint(220,284); r=random.choice((1,1,2))
        dr.ellipse([x-r,y-r,x+r,y+r],fill=random.choice(((99,111,65,52),(138,111,64,42),(82,98,58,38))))

    def house(cx,cy,w=15,d=12,h=10,roof_h=5,stone=(201,176,124),roof=(160,77,46)):
        x0,y0=cx-w/2,cy-d/2; x1,y1=cx+w/2,cy+d/2
        A=iso(x0,y0); B=iso(x1,y0); C=iso(x1,y1); D=iso(x0,y1)
        At=iso(x0,y0,h); Bt=iso(x1,y0,h); Ct=iso(x1,y1,h); Dt=iso(x0,y1,h)
        sd.polygon([(p[0]+10,p[1]+10) for p in (A,B,C,D)],fill=(31,23,15,58))
        out=(83,62,43,255)
        poly(dr,[D,C,Ct,Dt],tuple(max(0,c-25) for c in stone)+(255,),out,2)
        poly(dr,[B,C,Ct,Bt],tuple(max(0,c-10) for c in stone)+(255,),out,2)
        poly(dr,[A,B,Bt,At],stone+(255,),out,2)
        r1,r2,r3,r4=At,Bt,Ct,Dt
        rg1=iso((x0+x1)/2,y0,h+roof_h); rg2=iso((x0+x1)/2,y1,h+roof_h)
        poly(dr,[r1,r4,rg2,rg1],roof+(255,),out,2)
        poly(dr,[r2,r3,rg2,rg1],tuple(max(0,c-18) for c in roof)+(255,),out,2)
        for t in (.22,.45,.68,.88):
            p1=(r1[0]*(1-t)+rg1[0]*t,r1[1]*(1-t)+rg1[1]*t)
            p2=(r4[0]*(1-t)+rg2[0]*t,r4[1]*(1-t)+rg2[1]*t)
            dr.line([p1,p2],fill=(101,55,39,150),width=1)
        dx=(At[0]+Bt[0])/2; base=(A[1]+B[1])/2
        dr.rectangle([dx-4,base-16,dx+4,base],fill=(82,57,40,255),outline=out,width=1)
        for f in (.27,.73):
            px=At[0]*(1-f)+Bt[0]*f; py=At[1]*(1-f)+Bt[1]*f+10
            dr.rectangle([px-2,py-3,px+2,py+3],fill=(65,80,76,255))
        for _ in range(16):
            xx=random.uniform(x0,x1); p=iso(xx,y0,random.uniform(1,h-1))
            dr.point(p,fill=(111,91,66,120))

    def tree(cx,cy,s=1):
        base=iso(cx,cy); top=iso(cx,cy,10*s)
        sd.ellipse([base[0]-12*s+8,base[1]-4*s+8,base[0]+12*s+8,base[1]+6*s+8],fill=(31,23,15,43))
        dr.line([base,top],fill=(96,67,40,255),width=max(2,int(3*s)))
        for ox,oy,r,col in ((-7,-1,8,(91,105,59,255)),(4,-3,9,(111,120,66,255)),(0,-8,8,(78,96,54,255))):
            x=top[0]+ox*s; y=top[1]+oy*s
            dr.ellipse([x-r*s,y-r*s,x+r*s,y+r*s],fill=col,outline=(66,77,45,230),width=1)

    layouts={
      "village":[(-18,4,13,10,9),(4,-6,14,11,10),(20,10,12,9,8)],
      "coastal":[(-20,5,13,10,9),(2,-6,14,11,10),(18,8,12,9,8)],
      "town":[(-24,8,14,11,10),(-6,-6,16,12,11),(14,7,14,10,10),(28,-8,12,9,9),(0,18,13,10,9)],
      "city":[(-32,10,16,12,11),(-14,-6,16,12,12),(6,8,15,11,11),(24,-7,16,12,13),(34,13,13,10,10),(0,24,14,11,10),(-26,-18,13,10,9)],
      "port":[(-24,8,15,11,10),(-5,-6,16,12,11),(15,8,14,11,10),(28,-8,13,10,9),(3,22,13,10,9)]
    }

    if kind!="fortress":
        for x,y,w,d,h in layouts[kind]:
            house(x,y,w,d,h,max(4,int(h*.45)))
        for x,y,s in ((-38,12,1),(34,18,1.1),(-28,-20,.9),(24,25,.8)):
            tree(x,y,s)
        if kind in ("port","coastal"):
            dr.arc([95,242,430,292],5,175,fill=(69,124,137,185),width=4)
            p1=iso(38,19); p2=(p1[0]+48,p1[1]+10)
            dr.line([p1,p2],fill=(101,75,48,255),width=5)
            bx,by=p2
            dr.polygon([(bx,by),(bx+20,by-4),(bx+28,by+2),(bx+9,by+7)],fill=(113,75,44,255),outline=(70,48,32,255))
            dr.line([(bx+15,by-2),(bx+15,by-30)],fill=(70,55,42,255),width=2)
            dr.polygon([(bx+15,by-30),(bx+15,by-5),(bx+33,by-12)],fill=(222,207,170,235),outline=(90,70,49,255))
    else:
        def block(cx,cy,w,d,h,stone=(181,154,106)):
            x0,y0=cx-w/2,cy-d/2; x1,y1=cx+w/2,cy+d/2
            A=iso(x0,y0);B=iso(x1,y0);C=iso(x1,y1);D=iso(x0,y1)
            At=iso(x0,y0,h);Bt=iso(x1,y0,h);Ct=iso(x1,y1,h);Dt=iso(x0,y1,h)
            sd.polygon([(p[0]+10,p[1]+10) for p in (A,B,C,D)],fill=(31,23,15,54))
            out=(76,58,42,255)
            poly(dr,[A,B,Bt,At],stone+(255,),out,2)
            poly(dr,[B,C,Ct,Bt],tuple(max(0,c-18) for c in stone)+(255,),out,2)
            poly(dr,[D,C,Ct,Dt],tuple(max(0,c-28) for c in stone)+(255,),out,2)
            poly(dr,[At,Bt,Ct,Dt],tuple(min(255,c+12) for c in stone)+(255,),out,2)
        block(0,0,48,34,11)
        for x,y in ((-20,-13),(20,-13),(-20,13),(20,13)): block(x,y,13,13,22)
        block(0,0,18,18,26,(193,164,113))
        for x,y,s in ((-36,22,.9),(36,18,.9),(-34,-22,.8)): tree(x,y,s)

    sh=sh.filter(ImageFilter.GaussianBlur(5))
    im=Image.alpha_composite(sh,im).resize((320,200),Image.Resampling.LANCZOS)
    im.save(f"{OUT}/diorama-{kind}.webp","WEBP",quality=82,method=6)

for i,k in enumerate(("village","coastal","town","city","port","fortress"),1):
    render(k,i*17)
print("Generated diorama settlement assets")
