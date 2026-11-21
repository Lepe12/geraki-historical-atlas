import json, math, numpy as np
from PIL import Image
from scipy.spatial import Delaunay
from scipy.interpolate import LinearNDInterpolator
from scipy.ndimage import map_coordinates
LON0,K,MY1=-20,30,66.48233060009922
M=lambda la: math.degrees(math.log(math.tan(math.pi/4+math.radians(la)/2)))
P=lambda la,lo: ((lo-LON0)*K,(MY1-M(la))*K)
G=[("Tarifa",36.01,-5.61,690,1672),("Ceuta",35.89,-5.31,742,1710),("Cabo de Gata",36.72,-2.19,1195,1495),("Cabo de la Nao",38.73,0.23,1410,1250),
("Ibiza",38.98,1.43,1530,1225),("Mallorca",39.62,2.98,1650,1140),("Menorca",39.95,4.08,1780,1110),("Rhone",43.33,4.84,1800,555),("Genoa",44.41,8.93,2290,410),
("Cape Corse",43.01,9.40,2343,659),("Bonifacio",41.39,9.16,2322,877),("Capo Caccia",40.56,8.16,2237,958),("Capo Teulada",38.88,8.64,2318,1239),("Capo Carbonara",39.10,9.52,2416,1209),
("Algiers",36.77,3.06,1790,1590),("Cape Bon",37.08,11.04,2583,1432),("Marsala",37.80,12.42,2732,1327),("Cape Passero",36.69,15.14,3040,1456),("Malta",35.90,14.51,2935,1572),
("Pantelleria",36.79,11.99,2770,1536),("Venice",45.43,12.33,2770,320),("Istria",44.76,13.92,2950,425),("Leuca",39.80,18.36,3405,1058),("Otranto",40.15,18.49,3412,1012),
("Akritas",36.72,21.88,3708,1450),("Matapan",36.38,22.48,3800,1518),("Malea",36.44,23.20,3918,1504),("Kythira",36.25,23.0,3869,1537),("Skyli",37.43,23.53,3956,1399),
("Crete W",35.62,23.58,3910,1640),("Crete E",35.31,26.31,4314,1618),("Rhodes",36.45,28.23,4395,1505),("Dardanelles",40.0,26.2,4255,1055),("Constantinople",41.01,28.98,4450,960),
("Antalya",36.88,30.70,4690,1445),("Gelidonya",36.20,30.41,4590,1515),("Anamur",36.02,32.80,4860,1500),("Iskenderun",36.75,36.20,5195,1460),("Latakia",35.52,35.78,5195,1555),
("Andreas",35.70,34.59,5078,1668),("Gata",34.56,33.03,4892,1745),("Arnauti",35.10,32.28,4805,1660),("Greco",34.96,34.08,5030,1697),("Alexandria",31.20,29.90,4610,2190),
("Damietta",31.52,31.84,4770,2185),("El Arish",31.13,33.80,4900,2205),("Jaffa",32.05,34.75,5100,2000),("Tripoli",32.90,13.18,2960,1950),("Misrata",32.37,15.21,3170,2050),("Sidra",30.40,19.00,3330,2210),("Benghazi",32.12,20.07,3590,2015),("Ras al-Hilal",32.92,22.17,3760,1905),("Tobruk",32.08,23.98,3990,2045),("Sollum",31.60,25.15,4150,2120),("Kavo Doro",38.16,24.59,4090,1295)]
src=np.array([[g[3],g[4]] for g in G],float);dst=np.array([P(g[1],g[2]) for g in G])
# global affine image->chart, residuals
A=np.c_[src,np.ones(len(src))];coef,*_=np.linalg.lstsq(A,dst,rcond=None);res=np.hypot(*(A@coef-dst).T)
for g,r in sorted(zip(G,res),key=lambda t:-t[1])[:8]:print('resid',g[0],round(r,1))
# frame corners of the engraved neatline (image px), mapped by the affine for the outer ring
frame=[(640,240),(3200,240),(5760,240),(640,1300),(5760,1300),(640,2400),(3200,2400),(5760,2400)]
F=np.array(frame,float);Fd=np.c_[F,np.ones(len(F))]@coef
allS=np.r_[src,F];allD=np.r_[dst,Fd]
# piecewise affine chart->image
interp=LinearNDInterpolator(allD,allS)
x0,x1,y0,y1=allD[:,0].min(),allD[:,0].max(),allD[:,1].min(),allD[:,1].max()
SC=4;W=int((x1-x0)*SC);H=int((y1-y0)*SC)
xs=np.linspace(x0,x1,W);ys=np.linspace(y0,y1,H);XX,YY=np.meshgrid(xs,ys)
uv=interp(np.c_[XX.ravel(),YY.ravel()]).reshape(H,W,2)
im=np.asarray(Image.open('med.jpg').convert('RGB')).astype(np.float32)
out=np.zeros((H,W,4),np.uint8);valid=~np.isnan(uv[...,0])
for c in range(3):out[...,c]=np.clip(map_coordinates(im[...,c],[np.nan_to_num(uv[...,1]),np.nan_to_num(uv[...,0])],order=1),0,255)
out[...,3]=valid*255
Image.fromarray(out,'RGBA').save('jansson_warp.png')
Image.fromarray(out,'RGBA').convert('RGB').save('jansson_warp_prev.jpg',quality=70)
json.dump({'x':x0,'y':y0,'w':x1-x0,'h':y1-y0,'W':W,'H':H,'gcps':[dict(name=g[0],lat=g[1],lon=g[2],px=g[3],py=g[4]) for g in G]},open('jansson_warp.json','w'),indent=1)
print(W,H,x0,y0,x1,y1)
