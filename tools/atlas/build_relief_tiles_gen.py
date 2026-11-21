import numpy as np,os,math,sys
from PIL import Image
import style
def tx(lon,z):return (lon+180)/360*2**z
def ty(lat,z):r=math.radians(lat);return (1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*2**z
L0,L1,B0,B1=-20,40,28.4,55.2
for z in map(int,sys.argv[1:]):
    X0,X1=int(tx(L0,z)),int(tx(L1,z));Y0,Y1=int(ty(B1,z)),int(ty(B0,z))
    B=8;M=1
    for bx in range(X0,X1+1,B):
        for by in range(Y0,Y1+1,B):
            x0,x1=max(X0,bx-M),min(X1,bx+B-1+M);y0,y1=max(Y0,by-M),min(Y1,by+B-1+M)
            A=style.mosaic(z,x0,x1,y0,y1);O=(style.stylize(A,z,x0,y0)*255).astype(np.uint8)
            for x in range(bx,min(bx+B,X1+1)):
                for y in range(by,min(by+B,Y1+1)):
                    t=O[(y-y0)*256:(y-y0+1)*256,(x-x0)*256:(x-x0+1)*256]
                    os.makedirs(f'out/{z}/{x}',exist_ok=True);Image.fromarray(t).save(f'out/{z}/{x}/{y}.webp',quality=78,method=4)
    print('z',z,'done')
