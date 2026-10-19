"""Actual image-only PDF -> CPU OCR -> quote offsets. Synthetic test, not research."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont

with tempfile.TemporaryDirectory(prefix='nabou-ocr-check-') as tmp:
    image=Image.new('RGB',(1400,700),'white')
    ImageDraw.Draw(image).text((100,200),'MILO HARBOUR 1674',fill='black',font=ImageFont.load_default(size=64))
    path=Path(tmp)/'image-only.pdf';image.save(path,'PDF',resolution=150)
    value=subprocess.run(['python3',str(Path(__file__).with_name('pdf-evidence.py')),str(path)],capture_output=True,text=True,check=True)
    result=json.loads(value.stdout);page=result['pages'][0]
    assert result['source_sha256']==hashlib.sha256(path.read_bytes()).hexdigest()
    assert page['method']=='TESSERACT_OCR',page
    assert 'MILO HARBOUR 1674' in page['text'].upper(),page
    assert page['words'] and all(w['bbox'][2]>0 for w in page['words'])
    assert result['historically_verified'] is False
    assert result['htr_status']=='UNSUPPORTED_NO_HANDWRITING_MODEL'
    assert hashlib.sha256(page['text'].encode()).hexdigest()==page['text_sha256']
    print(json.dumps({'status':'PASS','test':'REAL_IMAGE_PDF_OCR_NOT_HISTORICAL_RESEARCH',
                      'method':page['method'],'ocr_confidence':page['ocr_confidence'],
                      'bbox_count':len(page['words']),'parser_version':result['parser_version']}))
