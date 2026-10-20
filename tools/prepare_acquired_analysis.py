"""Derive readable text from already acquired PDFs without replacing source bytes."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from section_extraction import build_findings

def corrected_bibliography(source, pdf_sha256, repository=None):
    """Apply documented metadata only to the identical acquired PDF bytes."""
    repository=Path(repository or Path(__file__).resolve().parents[1]).resolve()
    index=repository/'data/source_bibliographic_corrections.json'
    if not index.is_file():return source,None
    matches=[]
    for name in json.loads(index.read_text()).get('records',[]):
        record=(repository/name).resolve()
        if not record.is_relative_to(repository) or not record.is_file():raise ValueError('INVALID_BIBLIOGRAPHIC_CORRECTION_RECORD')
        raw=record.read_bytes();value=json.loads(raw)
        if value.get('pdf_sha256')!=pdf_sha256:continue
        work=value.get('actual_work') or {}
        if not work.get('title') or not work.get('author') or not work.get('year'):raise ValueError('INCOMPLETE_BIBLIOGRAPHIC_CORRECTION')
        matches.append((name,hashlib.sha256(raw).hexdigest(),work))
    if len(matches)>1:raise ValueError('CONFLICTING_BIBLIOGRAPHIC_CORRECTIONS_REQUIRE_REVIEW')
    if not matches:return source,None
    name,sha,work=matches[0]
    corrected={**source,'title':work['title'],'creator':[work['author']],'date':[str(work['year'])]}
    receipt={'basis':'DOCUMENTED_METADATA_FOR_IDENTICAL_PDF_SHA256_NOT_HISTORICAL_VERIFICATION',
             'record':name,'record_sha256':sha,'pdf_sha256':pdf_sha256,
             'previous':{k:source.get(k) for k in ('title','creator','date')},'corrected_work':work,
             'original_acquisition_report_modified':False}
    corrected['bibliographic_correction']=receipt
    return corrected,receipt


def prepare(parent, destination, request):
    parent=Path(parent).resolve();destination=Path(destination).resolve()
    if not destination.is_relative_to(parent):raise ValueError('DERIVED_TEXT_MUST_REMAIN_IN_PARENT_RUN')
    destination.mkdir(parents=True,exist_ok=False)
    receipts=[]
    version=subprocess.check_output(['pdftotext','-v'],stderr=subprocess.STDOUT,text=True).splitlines()[0]
    for lane in sorted(parent.iterdir()):
        report=lane/'library_acquisition/acquisition_report.json'
        if not report.is_file():continue
        target=destination/lane.name;library=target/'library_acquisition';library.mkdir(parents=True)
        records=[]
        for source in json.loads(report.read_text()).get('results',[]):
            if source.get('status')!='TEXT_ACQUIRED':continue
            declared=list(dict.fromkeys([*source.get('files',[]),*(source.get('web_acquisition') or {}).get('files',[])]))
            def existing(name):
                path=(lane/name).resolve()
                return path if path.is_relative_to(lane.resolve()) and path.is_file() else None
            texts=[p for f in declared if str(f).endswith('.txt') and (p:=existing(f))]
            pdfs=[p for f in declared if str(f).endswith('.pdf') and (p:=existing(f))]
            url=source.get('acquired_source_url') or source.get('url');handled=set()
            for pdf in pdfs:
                original=str(pdf.relative_to(parent))
                with pdf.open('rb') as stream:raw_sha=hashlib.file_digest(stream,'sha256').hexdigest()
                stem=hashlib.sha256((raw_sha+'\0'+str(url)).encode()).hexdigest()[:24]
                text_file=library/(stem+'.txt')
                receipt={'lane':lane.name,'source_url':url,'original_pdf':original,'original_pdf_sha256':raw_sha,
                         'extractor_version':version,'network_request_performed':False}
                corrected,correction=corrected_bibliography(source,raw_sha)
                if correction:receipt['bibliographic_correction']=correction
                try:
                    subprocess.run(['pdftotext','-enc','UTF-8',str(pdf),str(text_file)],check=True,capture_output=True,timeout=30)
                    content=text_file.read_text(encoding='utf-8',errors='replace')
                    if len(content.strip())<40:
                        text_file.unlink();receipt['status']='NO_USABLE_PDF_TEXT_RETAIN_EXISTING_OCR';receipts.append(receipt);continue
                    pages=[];offset=0;chunks=content.split('\f')
                    if chunks and not chunks[-1].strip():chunks=chunks[:-1]
                    for i,page in enumerate(chunks):
                        pages.append({'scan_index_0_based':i,'printed_page':None,'start_char':offset,'end_char':offset+len(page),
                                      'start_line':content.count('\n',0,offset)+1,'end_line':content.count('\n',0,offset+len(page))+1})
                        offset+=len(page)+1
                    files=[str(text_file.relative_to(target))]
                    web={'source_url':url,'source_type':'PDF_TEXT','files':files,'pages':pages,
                         'pdf_file':original,'pdf_reference_base':'PARENT_RESEARCH_RUN','text_order':'POPPLER_READING_ORDER',
                         'extraction_provenance':'DERIVED_FROM_EXISTING_PDF_BYTES_NOT_NEW_DOWNLOAD',
                         'source_pdf_sha256':raw_sha,'text_sha256':hashlib.sha256(content.encode()).hexdigest(),'extractor_version':version}
                    records.append({**corrected,'files':files,'web_acquisition':web})
                    handled.add(pdf.with_suffix('.txt'))
                    receipt.update(status='READING_ORDER_DERIVED',derived_text_path=str(text_file.relative_to(parent)),
                                   derived_text_sha256=web['text_sha256'])
                except (ValueError,OSError,subprocess.SubprocessError) as error:
                    text_file.unlink(missing_ok=True)
                    receipt.update(status='DERIVATION_FAILED_RETAIN_EXISTING_TEXT',error_type=type(error).__name__)
                receipts.append(receipt)
            remaining=[p for p in texts if p not in handled]
            if remaining:
                files=[]
                for text in remaining:
                    copied=library/text.name;shutil.copyfile(text,copied);files.append(str(copied.relative_to(target)))
                records.append({**source,'files':files,'original_source_files':[str(p.relative_to(parent)) for f in declared if (p:=existing(f))],
                                'analysis_text_method':'EXISTING_ACQUIRED_TEXT_RETAINED_NO_NEW_OCR'})
        (library/'acquisition_report.json').write_text(json.dumps({'results':records},ensure_ascii=False,indent=2)+'\n')
        manifest=target/'run_manifest';manifest.mkdir()
        (manifest/'manifest.json').write_text(json.dumps({'normalized_request':request},ensure_ascii=False)+'\n')
        structured=target/'structured_output';structured.mkdir()
        findings=build_findings(target,request)
        (structured/'extracted_findings.json').write_text(json.dumps(findings,ensure_ascii=False,indent=2)+'\n')
    receipt={'schema':'nabou-derived-reading-order-v1','method':'REREAD_EXISTING_SOURCE_BYTES_NOT_NEW_DISCOVERY',
             'network_requests_performed':False,'original_lane_outputs_modified':False,'documents':receipts}
    (destination/'derivation_receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
    return receipt
