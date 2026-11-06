function pdf(pages){
 const objs=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*2} 0 R`).join(' ')}] >>`];
 for(const text of pages){const page=objs.length+1,stream=page+1,font=3+pages.length*2;
 objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`);
 const body=text?`BT /F1 12 Tf 20 200 Td (${text}) Tj ET`:'';objs.push(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
 }objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 let out='%PDF-1.4\n',offsets=[0];objs.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${o}\nendobj\n`});const pos=Buffer.byteLength(out);
 out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF`;
 return Buffer.from(out);
}

module.exports={pdf};
