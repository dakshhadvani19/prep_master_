#!/usr/bin/env python3
"""PrepMaster Science & Pharmacy syllabus recovery. Read-only with respect to GitHub/Supabase."""
from __future__ import annotations
import argparse, csv, hashlib, html, json, re, sys, time, traceback, unicodedata, urllib.parse, zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import RLock
from typing import Any
import requests
from bs4 import BeautifulSoup
import fitz

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
OUT = ROOT / 'Output'
PDF_DIR = OUT / 'Verified_PDFs'
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PrepMasterSciencePharmacySyllabusRecovery/1.0'
TIMEOUT = 14
RETRIES = 2
WORKERS = 5
MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024
MAX_PDF_PAGES = 500
MANIFEST_URLS = [
    'https://raw.githubusercontent.com/dakshhadvani19/prep_master_/main/global-exam-prep/src/data/mockData.js',
    'https://github.com/dakshhadvani19/prep_master_/raw/refs/heads/main/global-exam-prep/src/data/mockData.js',
]

# Source IDs below are from the current PrepMaster mockData.js Science & Pharmacy domain.
MARWADI_PAGES = {
    'b-sc-in-chemistry': 'https://www.marwadiuniversity.ac.in/bsc-in-chemistry-colleges-fees/',
    'b-sc-in-microbiology': 'https://www.marwadiuniversity.ac.in/bsc-microbiology-colleges-in-gujarat/',
    'b-sc-in-agricultural-honors': 'https://www.marwadiuniversity.ac.in/bsc-agriculture-fees/',
    'm-sc-in-chemistry': 'https://www.marwadiuniversity.ac.in/chemistry-m-sc/',
    'm-sc-in-micorbiology': 'https://www.marwadiuniversity.ac.in/microbiology-m-sc/',
    'm-sc-in-pgdmlt': 'https://www.marwadiuniversity.ac.in/pgdmlt/',
    'b-pharm': 'https://www.marwadiuniversity.ac.in/b-pharmacy-colleges-fees/',
    'm-pharm-pharmaceutics': 'https://www.marwadiuniversity.ac.in/mpharm-pharmaceutics/',
    'm-pharm-pharmaceutical-quality-assurence': 'https://www.marwadiuniversity.ac.in/mpharm-pharmaceutical-quality-assurance/',
    'm-pharm-regulatory-affairs': 'https://www.marwadiuniversity.ac.in/mpharm-regulatory-affairs/',
}
MARWADI_HOSTS = {'marwadiuniversity.ac.in', 'www.marwadiuniversity.ac.in'}
# Tier 2 focuses on Gujarat institutions and the state agricultural universities;
# they provide comparable references, not a claim of Marwadi equivalence.
GUJARAT_TIER_HOSTS = {
    'gujaratuniversity.ac.in', 'www.gujaratuniversity.ac.in', 'unigug.ac.in', 'www.unigug.ac.in',
    'saurashtrauniversity.ac.in', 'www.saurashtrauniversity.ac.in', 'saurashtrauniversity.edu', 'www.saurashtrauniversity.edu',
    'gtu.ac.in', 'www.gtu.ac.in', 'gsp.gtu.ac.in', 'old26.gtu.ac.in',
    'aau.in', 'www.aau.in', 'jau.in', 'www.jau.in', 'nau.in', 'www.nau.in',
    'sdau.edu.in', 'www.sdau.edu.in', 'sdau.ac.in', 'www.sdau.ac.in',
}
# Tier 3 uses other official universities, national regulators, and research/education bodies.
OTHER_TIER_HOSTS = {
    'pci.gov.in', 'www.pci.gov.in', 'pci.nic.in', 'www.pci.nic.in',
    'icar.org.in', 'www.icar.org.in', 'icar.gov.in', 'www.icar.gov.in',
    'du.ac.in', 'www.du.ac.in', 'academicaffairs.du.ac.in',
    'ignou.ac.in', 'www.ignou.ac.in', 'bhu.ac.in', 'www.bhu.ac.in',
    'spuvvn.edu', 'www.spuvvn.edu', 'spuvvn.ac.in', 'www.spuvvn.ac.in',
    'charusat.ac.in', 'www.charusat.ac.in', 'nirmauni.ac.in', 'www.nirmauni.ac.in',
    'niperahm.ac.in', 'www.niperahm.ac.in', 'unipune.ac.in', 'www.unipune.ac.in',
    'mu.ac.in', 'www.mu.ac.in', 'jmi.ac.in', 'www.jmi.ac.in',
}
ALL_OFFICIAL_HOSTS = MARWADI_HOSTS | GUJARAT_TIER_HOSTS | OTHER_TIER_HOSTS

SOURCE_CATALOG = [
    {'tier':'1','institution':'Marwadi University','role':'Official subject/curriculum source; preferred','url':'https://www.marwadiuniversity.ac.in/bsc-in-chemistry-colleges-fees/'},
    {'tier':'1','institution':'Marwadi University','role':'Official subject/curriculum source; preferred','url':'https://www.marwadiuniversity.ac.in/bsc-microbiology-colleges-in-gujarat/'},
    {'tier':'1','institution':'Marwadi University','role':'Official subject/curriculum source; preferred','url':'https://www.marwadiuniversity.ac.in/bsc-agriculture-fees/'},
    {'tier':'1','institution':'Marwadi University','role':'Official subject/curriculum source; preferred','url':'https://www.marwadiuniversity.ac.in/chemistry-m-sc/'},
    {'tier':'1','institution':'Marwadi University','role':'Official subject/curriculum source; preferred','url':'https://www.marwadiuniversity.ac.in/microbiology-m-sc/'},
    {'tier':'1','institution':'Marwadi University','role':'Official subject/curriculum source; preferred','url':'https://www.marwadiuniversity.ac.in/pgdmlt/'},
    {'tier':'1','institution':'Marwadi University','role':'Official subject/curriculum source; preferred','url':'https://www.marwadiuniversity.ac.in/b-pharmacy-colleges-fees/'},
    {'tier':'1','institution':'Marwadi University','role':'Official subject/curriculum source; preferred','url':'https://www.marwadiuniversity.ac.in/mpharm-pharmaceutics/'},
    {'tier':'1','institution':'Marwadi University','role':'Official subject/curriculum source; preferred','url':'https://www.marwadiuniversity.ac.in/mpharm-pharmaceutical-quality-assurance/'},
    {'tier':'1','institution':'Marwadi University','role':'Official subject/curriculum source; preferred','url':'https://www.marwadiuniversity.ac.in/mpharm-regulatory-affairs/'},
    {'tier':'2','institution':'Gujarat University','role':'Official syllabus portal; comparable fallback, not Marwadi syllabus','url':'https://www.gujaratuniversity.ac.in/Syllabus'},
    {'tier':'2','institution':'Saurashtra University','role':'Official syllabus portal; comparable fallback, not Marwadi syllabus','url':'https://saurashtrauniversity.ac.in/university/administrative-sections/academic-section/page/syllabus-2019-20/'},
    {'tier':'2','institution':'Gujarat Technological University — School of Pharmacy','role':'Official pharmacy programme/syllabus discovery; comparable fallback','url':'https://www.gsp.gtu.ac.in/b-pharm/'},
    {'tier':'2','institution':'Anand Agricultural University','role':'Official agricultural sciences source; comparable fallback','url':'https://aau.in/'},
    {'tier':'2','institution':'Junagadh Agricultural University','role':'Official agricultural sciences source; comparable fallback','url':'https://jau.in/'},
    {'tier':'2','institution':'Navsari Agricultural University','role':'Official agricultural sciences source; comparable fallback','url':'https://nau.in/'},
    {'tier':'2','institution':'Sardarkrushinagar Dantiwada Agricultural University','role':'Official agricultural sciences source; comparable fallback','url':'https://www.sdau.edu.in/'},
    {'tier':'3','institution':'Pharmacy Council of India','role':'National regulator; official syllabus/regulations, including current B.Pharm curriculum','url':'https://www.pci.gov.in/en/syllabus-bachelor-of-pharmacy-b-pharm-2026-as-per-nep-2020/'},
    {'tier':'3','institution':'Pharmacy Council of India','role':'Official course-wise regulations and M.Pharm syllabus discovery','url':'https://www.pci.gov.in/en/course-wise-regulations/'},
    {'tier':'3','institution':'Indian Council of Agricultural Research','role':'National agricultural education/research source; comparable reference','url':'https://icar.org.in/'},
    {'tier':'3','institution':'University of Delhi','role':'Official university syllabus source; comparable reference','url':'https://www.du.ac.in/'} ,
    {'tier':'3','institution':'IGNOU','role':'Official university/programme material; comparable reference','url':'https://www.ignou.ac.in/'},
    {'tier':'3','institution':'Banaras Hindu University','role':'Official university syllabus source; comparable reference','url':'https://www.bhu.ac.in/'},
    {'tier':'3','institution':'Sardar Patel University','role':'Official university syllabus source; comparable reference','url':'https://www.spuvvn.edu/'},
    {'tier':'3','institution':'CHARUSAT','role':'Official university syllabus source; comparable reference','url':'https://charusat.ac.in/'},
    {'tier':'3','institution':'Nirma University','role':'Official pharmacy/science programme source; comparable reference','url':'https://nirmauni.ac.in/'},
    {'tier':'3','institution':'NIPER Ahmedabad','role':'Official pharmaceutical education/research source; comparable reference','url':'https://niperahm.ac.in/'},
]

LOCK = RLock()
REQUEST_LOG: list[dict] = []
VALIDATION_LOG: list[dict] = []
NETWORK_LOG: list[dict] = []
FETCH_CACHE: dict[str, tuple[Any,str,str,bytes,str]] = {}
PDF_CONTENT_MARKERS = ('course contents','course content','unit i','unit 1','unit 2','module 1','topics','course outline','syllabus','outline of the course','course structure')
PDF_DETAIL_MARKERS = ('course outcomes','learning outcomes','course objectives','reference books','text books','textbook','credits','teaching scheme','contact hours','evaluation','assessment','readings','prescribed readings','unit wise')
STOPWORDS = {'a','an','and','or','the','of','for','in','to','with','by','on','from','at','course','subject','syllabus'}
GENERIC_TITLES = {'', 'course', 'subject', 'open elective', 'program elective', 'programme elective', 'department elective', 'elective'}


def log(msg: str) -> None:
    line = f'[{time.strftime("%H:%M:%S")}] {msg}'
    print(line, flush=True)
    try:
        OUT.mkdir(parents=True, exist_ok=True)
        with (OUT/'run_log.txt').open('a', encoding='utf-8') as f: f.write(line+'\n')
    except Exception: pass


def norm(value: Any) -> str:
    s = unicodedata.normalize('NFKD', str(value or '')).casefold()
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def words(value: Any) -> set[str]:
    return {x for x in norm(value).split() if x not in STOPWORDS and len(x)>1}


def is_generic_title(title: str) -> bool:
    return norm(title) in GENERIC_TITLES or len(words(title)) == 0


def write_csv(path: Path, rows: list[dict], headers: list[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if headers is None: headers = list(dict.fromkeys(k for r in rows for k in r.keys()))
    with path.open('w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=headers, extrasaction='ignore'); w.writeheader()
        for r in rows: w.writerow({k:r.get(k,'') for k in headers})


def fetch(url: str, label: str, allowed_hosts: set[str] | None = None, timeout: int = TIMEOUT, max_bytes: int = MAX_DOWNLOAD_BYTES):
    url = urllib.parse.urldefrag(url.strip())[0]
    if allowed_hosts is not None and not host_allowed(url, allowed_hosts):
        res=(0,url,'',b'','URL host rejected by source-tier allowlist')
        with LOCK: REQUEST_LOG.append(request_row(label,url,*res))
        return res
    with LOCK:
        if url in FETCH_CACHE: return FETCH_CACHE[url]
    last=(0,url,'',b'','No response')
    for attempt in range(RETRIES+1):
        try:
            with requests.get(url, headers={'User-Agent':USER_AGENT,'Accept':'application/pdf,text/html,application/json,*/*;q=0.8'}, timeout=timeout, stream=True, allow_redirects=True) as r:
                data=bytearray()
                for part in r.iter_content(128*1024):
                    if part:
                        data.extend(part)
                        if len(data)>max_bytes: raise ValueError(f'Response exceeds {max_bytes} bytes')
                st, final, ctype, body = r.status_code, r.url, r.headers.get('Content-Type',''), bytes(data)
                err=''
                if allowed_hosts is not None and not host_allowed(final, allowed_hosts):
                    st='REJECTED_REDIRECT_HOST'; err='Redirect left the official source allowlist'; body=b''
                last=(st,final,ctype,body,err)
                break
        except Exception as e:
            last=(0,url,'',b'',f'{type(e).__name__}: {e}')
            if attempt<RETRIES: time.sleep(0.6*(attempt+1))
    with LOCK:
        FETCH_CACHE[url]=last
        REQUEST_LOG.append(request_row(label,url,*last))
        st=last[0]
        if not st or st in (401,403,408,425,429) or (isinstance(st,int) and st>=500): NETWORK_LOG.append(REQUEST_LOG[-1].copy())
    return last


def request_row(label,url,status,final,ctype,body,error):
    return {'time_local':time.strftime('%Y-%m-%d %H:%M:%S'),'action':label,'url':url,'final_url':final,'http_status':status,'content_type':ctype,'response_bytes':len(body),'error':error}


def host_of(url: str) -> str:
    return (urllib.parse.urlparse(url).hostname or '').lower()


def host_allowed(url: str, hosts: set[str]) -> bool:
    try:
        u=urllib.parse.urlparse(url)
        h=(u.hostname or '').lower()
        return u.scheme.lower()=='https' and any(h==x or h.endswith('.'+x) for x in hosts)
    except Exception: return False


def direct_pdf(url: str) -> bool:
    return urllib.parse.urlparse(url).path.lower().endswith('.pdf')


def parse_domains(source: str) -> list[dict]:
    marker='export const domains'
    at=source.find(marker)
    if at<0: raise ValueError("mockData.js missing `export const domains`")
    start=source.find('[',at)
    if start<0: raise ValueError('domains array opener missing')
    depth=0; quote=None; esc=False
    for i in range(start,len(source)):
        ch=source[i]
        if quote:
            if esc: esc=False
            elif ch=='\\': esc=True
            elif ch==quote: quote=None
            continue
        if ch in ('"',"'"): quote=ch
        elif ch=='[': depth+=1
        elif ch==']':
            depth-=1
            if depth==0:
                val=json.loads(source[start:i+1])
                if not isinstance(val,list): raise ValueError('Parsed domains was not a list')
                return val
    raise ValueError('domains array malformed')


def decode_manifest(source: str) -> tuple[list[dict],dict]:
    domains=parse_domains(source)
    domain=next((x for x in domains if x.get('id')=='science-pharmacy'),None)
    if not domain: raise ValueError('No `science-pharmacy` domain found in current PrepMaster manifest')
    courses=domain.get('courses') or []
    occurrences=[]
    for c in courses:
        for s in c.get('subjects') or []:
            title=str(s.get('title') or '').strip()
            sid=str(s.get('id') or '').strip()
            if not sid: continue
            occurrences.append({'source_course_id':str(c.get('id') or ''),'course_title':str(c.get('title') or c.get('id') or ''),
                'source_subject_id':sid,'subject_title':title,'semester':s.get('sem',''),'title_key':norm(title),'title_quality':'INVALID_GENERIC_TITLE' if is_generic_title(title) else 'CANDIDATE'})
    if not occurrences: raise ValueError('Science & Pharmacy domain found but has no catalog subjects')
    meta={'domain_id':domain.get('id'),'domain_title':domain.get('title'),'course_count':len(courses),'occurrence_count':len(occurrences),
          'source_url':MANIFEST_URLS[0],'source_sha256':hashlib.sha256(source.encode()).hexdigest(),'source_fetched_at':time.strftime('%Y-%m-%d %H:%M:%S')}
    return occurrences,meta


def build_targets(occurrences: list[dict]) -> tuple[list[dict],list[dict]]:
    grouped={}
    for o in occurrences: grouped.setdefault(o['title_key'],[]).append(o)
    targets=[]; duplicates=[]
    for key, rows in grouped.items():
        title=rows[0]['subject_title']
        tid=hashlib.sha1(key.encode()).hexdigest()[:12]
        courses=sorted({r['course_title'] for r in rows})
        target={'target_id':tid,'title_key':key,'subject_title':title,'occurrence_count':len(rows),'course_count':len(courses),
                'courses':courses,'course_ids':sorted({r['source_course_id'] for r in rows}),
                'semesters':sorted({str(r['semester']) for r in rows}), 'subject_ids':sorted({r['source_subject_id'] for r in rows}),
                'occurrences':rows,'expected_codes_by_course':{},'all_expected_codes':[],
                'title_quality':'INVALID_GENERIC_TITLE' if is_generic_title(title) else 'CANDIDATE'}
        targets.append(target)
        if len(rows)>1:
            duplicates.append({'target_id':tid,'normalized_title':key,'subject_title':title,'title_quality':target['title_quality'],
                'occurrence_count':len(rows),'course_count':len(courses),'courses':' | '.join(courses),
                'source_course_ids':' | '.join(target['course_ids']),'semesters':' | '.join(target['semesters']),
                'source_subject_ids':' | '.join(target['subject_ids']), 'download_rule':'one title-level download attempt; occurrence-level scope is separately checked',
                'selected_course':'','selected_pdf':'','selected_source':'','final_status':'PENDING'})
    targets.sort(key=lambda x:(x['title_quality']!='CANDIDATE',norm(x['subject_title'])))
    duplicates.sort(key=lambda x:norm(x['subject_title']))
    return targets,duplicates


def fetch_manifest() -> tuple[str,str]:
    errors=[]
    for url in MANIFEST_URLS:
        st,final,ctype,body,err=fetch(url,'fetch_current_prepMaster_science_pharmacy_manifest',None,timeout=20,max_bytes=6*1024*1024)
        if st==200 and body:
            text=body.decode('utf-8-sig',errors='replace')
            try: decode_manifest(text); return text,final
            except Exception as e: errors.append(f'{url}: content validation failed: {e}')
        else: errors.append(f'{url}: HTTP/status {st}; {err}')
    raise RuntimeError('Could not fetch current Science & Pharmacy catalog from GitHub. '+' | '.join(errors))


def scrape_links(page_url: str, raw_html: str, tier: int, institution: str, context_course='') -> list[dict]:
    hosts={1:MARWADI_HOSTS,2:GUJARAT_TIER_HOSTS,3:OTHER_TIER_HOSTS}[tier]
    soup=BeautifulSoup(raw_html,'html.parser'); out=[]; seen=set()
    for a in soup.find_all('a',href=True):
        url=urllib.parse.urljoin(page_url,html.unescape(a['href']))
        if not direct_pdf(url) or not host_allowed(url,hosts) or url in seen: continue
        seen.add(url)
        label=' '.join(a.stripped_strings) or a.get('title','') or ''
        out.append({'url':url,'tier':tier,'institution':institution,'listing_text':label,
                    'discovered_from':page_url,'context_course':context_course,'discovery_reason':'Direct PDF link on official source page','expected_codes':[],'score':0.0})
    return out


def title_similarity(title: str,evidence: str) -> float:
    a=words(title); b=words(evidence)
    if not a or not b: return 0.0
    if norm(title) and re.search(r'(?<![a-z0-9])'+re.escape(norm(title))+r'(?![a-z0-9])',norm(evidence)): return 1.0
    if len(a)<=2: return 0.0
    return len(a&b)/len(a)


def preload_marwadi_pages(course_ids: set[str]) -> dict[str,tuple[str,str,int,str]]:
    pages={}
    def work(item):
        cid,url=item; st,final,ctype,body,err=fetch(url,'fetch_Marwadi_program_page',MARWADI_HOSTS,max_bytes=6*1024*1024)
        raw=body.decode('utf-8',errors='replace') if st==200 and body else ''
        text=norm(' '.join(BeautifulSoup(raw,'html.parser').stripped_strings)) if raw else ''
        return cid,(final or url,text,st if isinstance(st,int) else 0,raw),err
    items=[(cid,MARWADI_PAGES[cid]) for cid in sorted(course_ids) if cid in MARWADI_PAGES]
    with ThreadPoolExecutor(max_workers=min(WORKERS,max(1,len(items)))) as ex:
        for f in as_completed([ex.submit(work,x) for x in items]):
            try:
                cid,entry,err=f.result(); pages[cid]=entry
                log(f'Marwadi page {cid}: HTTP {entry[2]}'+(f' ({err})' if err else ''))
            except Exception as e: log(f'Program page fetch exception: {type(e).__name__}: {e}')
    return pages


def scan_course_codes(targets:list[dict], pages:dict[str,tuple[str,str,int,str]]) -> None:
    # Official course IDs visible next to the subject title are separate from the website's source IDs.
    code_re=re.compile(r'(?<![a-z0-9])\d{2}[a-z]{2}[a-z0-9]{3,}(?![a-z0-9])',re.I)
    for t in targets:
        by_course={}
        if t['title_quality']=='CANDIDATE':
            for o in t['occurrences']:
                page=pages.get(o['source_course_id'])
                if not page or page[2]!=200: continue
                rawtext=norm(' '.join(BeautifulSoup(page[3],'html.parser').stripped_strings))
                subject=norm(t['subject_title'])
                m=re.search(r'(?<![a-z0-9])'+re.escape(subject)+r'(?![a-z0-9])',rawtext)
                if m:
                    neighborhood=rawtext[m.start():m.start()+max(180,len(subject)+130)]
                    codes=sorted(set(x.upper() for x in code_re.findall(neighborhood)))
                    if codes: by_course.setdefault(o['source_course_id'],[]);by_course[o['source_course_id']]=sorted(set(by_course[o['source_course_id']]+codes))
        t['expected_codes_by_course']=by_course
        t['all_expected_codes']=sorted({code for arr in by_course.values() for code in arr})


def wp_media_candidates(target:dict) -> tuple[list[dict],bool]:
    title=target['subject_title']
    endpoint='https://www.marwadiuniversity.ac.in/wp-json/wp/v2/media?'+urllib.parse.urlencode({'search':title,'per_page':100})
    st,final,ctype,body,err=fetch(endpoint,'Marwadi_WordPress_media_search:'+title,MARWADI_HOSTS,max_bytes=8*1024*1024)
    if st!=200 or not body:
        retryable=(not st or st in (401,403,408,425,429) or (isinstance(st,int) and st>=500))
        return [],retryable
    try: items=json.loads(body.decode('utf-8',errors='replace'))
    except Exception: return [],False
    out=[]
    for it in items if isinstance(items,list) else []:
        url=str(it.get('source_url') or '')
        if not direct_pdf(url) or not host_allowed(url,MARWADI_HOSTS): continue
        to=it.get('title',{}); label=(to.get('rendered','') if isinstance(to,dict) else str(to))+' '+str(it.get('slug',''))+' '+str(it.get('alt_text',''))
        score=title_similarity(title,label+' '+urllib.parse.unquote(urllib.parse.urlparse(url).path))
        if score<0.60 and norm(title) not in norm(label+' '+url): continue
        out.append({'url':url,'tier':1,'institution':'Marwadi University','listing_text':label,'discovered_from':endpoint,
                    'context_course':'','discovery_reason':'Official Marwadi WordPress media result; PDF title/content still checked',
                    'expected_codes':target['all_expected_codes'],'score':score})
    out.sort(key=lambda c:(-c['score'],c['url']))
    return out[:25],False


def search_candidates(target:dict,tier:int) -> tuple[list[dict],bool]:
    title=target['subject_title']
    if tier==2:
        hosts=GUJARAT_TIER_HOSTS
        host_query=' OR '.join(f'site:{h}' for h in sorted(hosts) if not h.startswith('www.'))
        query=f'"{title}" syllabus filetype:pdf ({host_query})'
        inst='Gujarat universities/technical or agricultural university (official comparable syllabus)'
    else:
        hosts=OTHER_TIER_HOSTS
        host_query=' OR '.join(f'site:{h}' for h in sorted(hosts) if not h.startswith('www.'))
        query=f'"{title}" syllabus filetype:pdf ({host_query})'
        inst='Other official university, regulator, or national education body (comparable reference)'
    # Search engines are discovery-only; only official allowlisted PDF URLs are downloaded.
    candidates=[]; network=False
    for engine in ('google','bing'):
        base='https://www.google.com/search?' if engine=='google' else 'https://www.bing.com/search?'
        query_params={'q':query,'num':'10'} if engine=='google' else {'q':query,'count':'10'}
        search_url=base+urllib.parse.urlencode(query_params)
        st,final,ctype,body,err=fetch(search_url,f'discovery_search_tier_{tier}_{engine}:{title}',None,max_bytes=5*1024*1024)
        if st!=200 or not body:
            network=True; continue
        raw=body.decode('utf-8',errors='replace'); low=raw[:250000].lower()
        if any(k in low for k in ('captcha','unusual traffic','verify you are human','access denied','automated queries')):
            network=True; continue
        soup=BeautifulSoup(raw,'html.parser'); found=[]
        for a in soup.find_all('a',href=True):
            href=html.unescape(a['href'])
            p=urllib.parse.urlparse(href)
            if engine=='google' and p.hostname and 'google.' in p.hostname:
                query_dict=urllib.parse.parse_qs(p.query); href=(query_dict.get('q') or query_dict.get('url') or [href])[0]
            href=urllib.parse.urldefrag(href)[0]
            if not href.startswith('https://') or not host_allowed(href,hosts): continue
            label=' '.join(a.stripped_strings)
            score=title_similarity(title,label+' '+urllib.parse.unquote(href))
            if direct_pdf(href):
                found.append({'url':href,'tier':tier,'institution':inst,'listing_text':label,'discovered_from':search_url,
                              'context_course':'','discovery_reason':'Search discovery of direct PDF on allowlisted official domain; PDF contents checked',
                              'expected_codes':[],'score':score})
            elif any(k in href.lower() for k in ('syllabus','programme','program','department','academic','curriculum','course','pharmacy','agriculture','science')):
                ss,ff,cc,bb,ee=fetch(href,f'open_official_fallback_listing_tier_{tier}',hosts,max_bytes=6*1024*1024)
                if ss==200 and bb: found.extend(scrape_links(ff or href,bb.decode('utf-8',errors='replace'),tier,inst))
                elif not ss or ss in (401,403,408,425,429) or (isinstance(ss,int) and ss>=500): network=True
        seen=set()
        for c in sorted(found,key=lambda x:(-x['score'],x['url'])):
            if c['url'] in seen: continue
            seen.add(c['url']); candidates.append(c)
    candidates.sort(key=lambda c:(not direct_pdf(c['url']),-c['score'],c['url']))
    return candidates[:35],network


def pdf_validate(body:bytes,target:dict,candidate:dict) -> tuple[bool,str,int,str,list[str],float]:
    if len(body)<1200 or not body.startswith(b'%PDF-'):
        return False,'Response is not a real PDF (missing %PDF- signature or too small)',0,'',[],0.0
    try:
        doc=fitz.open(stream=body,filetype='pdf')
        page_count=doc.page_count
        if page_count<1: doc.close();return False,'PDF contains no pages',0,'',[],0.0
        if page_count>MAX_PDF_PAGES: doc.close();return False,f'PDF exceeds {MAX_PDF_PAGES} page safety cap',page_count,'',[],0.0
        txt='\n'.join(doc.load_page(i).get_text('text') or '' for i in range(min(page_count,10)))
        doc.close()
    except Exception as e: return False,f'PDF parser could not open it: {type(e).__name__}: {e}',0,'',[],0.0
    ntext=norm(txt); title=target['subject_title']; nt=norm(title); wt=words(title)
    exact=bool(nt and re.search(r'(?<![a-z0-9])'+re.escape(nt)+r'(?![a-z0-9])',ntext))
    overlap=len(wt & words(txt))/max(1,len(wt)) if wt else 0.0
    # Generic/blank catalog subjects never reach this point. Short titles require exact title and
    # a matching official course code or a standalone heading near the beginning of the document.
    pdf_codes=sorted(set(re.findall(r'(?<![A-Z0-9])\d{2}[A-Z]{2}[A-Z0-9]{3,}(?![A-Z0-9])',txt[:15000],re.I)))
    pdf_codes=[x.upper() for x in pdf_codes]
    expected=sorted(set(x.upper() for x in candidate.get('expected_codes',[])))
    matches=sorted(set(pdf_codes)&set(expected))
    if expected and pdf_codes and not matches:
        return False,'Course-code conflict: page expected '+', '.join(expected)+'; PDF contains '+', '.join(pdf_codes[:8]),page_count,txt[:1600],pdf_codes,overlap
    lines=[norm(x) for x in txt.splitlines()[:20] if norm(x)]
    exact_heading=any(line==nt or re.match(r'^'+re.escape(nt)+r'\s+\d{2}[a-z]{2}[a-z0-9]{3,}(?:\s|$)',line) for line in lines)
    if len(wt)<=2 and not exact_heading:
        return False,'Short/fragmented title needs a standalone PDF heading near the beginning; word occurrence elsewhere is not enough',page_count,txt[:1600],pdf_codes,overlap
    if not exact and (len(wt)<3 or overlap<0.88):
        return False,f'Subject-title match too weak (token overlap {overlap:.2f}; exact={exact})',page_count,txt[:1600],pdf_codes,overlap
    content_markers=[m for m in PDF_CONTENT_MARKERS if norm(m) in ntext]
    detail_markers=[m for m in PDF_DETAIL_MARKERS if norm(m) in ntext]
    if len(txt.strip())<180: return False,'Too little extractable text; scanned PDFs need manual review',page_count,txt[:1600],pdf_codes,overlap
    if not content_markers or not detail_markers:
        return False,'Title found but document lacks both syllabus-content and course-detail markers',page_count,txt[:1600],pdf_codes,overlap
    tier=candidate['tier']
    note='Title and syllabus content verified on official Marwadi PDF' if tier==1 else ('Title and syllabus content verified on official regional-university PDF; comparable, not Marwadi' if tier==2 else 'Title and syllabus content verified on another official Indian university PDF; comparable, not Marwadi')
    if expected: note+='; expected code match '+(', '.join(matches) if matches else 'not visible in extracted pages')
    return True,note,page_count,txt[:1800],pdf_codes,overlap


def download_candidate(target:dict,c:dict) -> dict:
    hosts=MARWADI_HOSTS if c['tier']==1 else GUJARAT_TIER_HOSTS if c['tier']==2 else OTHER_TIER_HOSTS
    st,final,ctype,body,err=fetch(c['url'],f'download_pdf_tier_{c["tier"]}',hosts,max_bytes=MAX_DOWNLOAD_BYTES)
    row={'time_local':time.strftime('%Y-%m-%d %H:%M:%S'),'target_id':target['target_id'],'subject_title':target['subject_title'],
         'tier':c['tier'],'institution':c['institution'],'candidate_url':c['url'],'final_url':final,'discovered_from':c['discovered_from'],
         'context_course':c.get('context_course',''),'listing_text':c.get('listing_text',''),'http_status':st,'content_type':ctype,
         'response_bytes':len(body),'error':err,'validation':'NOT_TESTED','validation_note':'','page_count':'','sha256':'',
         'expected_codes':' | '.join(c.get('expected_codes',[])),'pdf_codes':'','title_token_overlap':'','saved_pdf':''}
    if st!=200 or not body:
        row['validation']='DOWNLOAD_FAILED';row['validation_note']='Direct PDF fetch failed or no response body'
        with LOCK: VALIDATION_LOG.append(row.copy())
        retry=(not st or st in (401,403,408,425,429) or (isinstance(st,int) and st>=500))
        return {'accepted':False,'row':row,'retryable':retry}
    ok,note,pages,preview,codes,overlap=pdf_validate(body,target,c)
    row.update({'validation':'VERIFIED_MATCH' if ok else 'REJECTED_NO_MATCH','validation_note':note,'page_count':pages,
                'sha256':hashlib.sha256(body).hexdigest(),'pdf_codes':' | '.join(codes),'title_token_overlap':f'{overlap:.2f}'})
    with LOCK: VALIDATION_LOG.append({**row,'text_preview':preview[:900]})
    return {'accepted':ok,'row':row,'retryable':False,'body':body,'pages':pages,'codes':codes,'note':note,'candidate':c}


def safe_name(text:str,limit=140)->str:
    s=re.sub(r'[<>:"/\\|?*\x00-\x1f]',' ',str(text or ''))
    s=re.sub(r'\s+',' ',s).strip(' .')
    return (s or 'Unknown subject')[:limit]


def target_candidates(t:dict,pages:dict[str,tuple[str,str,int,str]]) -> tuple[list[dict],bool]:
    out=[]; seen=set(); page_statuses=[]
    for o in t['occurrences']:
        entry=pages.get(o['source_course_id'])
        if not entry: continue
        url,page_text,status,raw=entry; page_statuses.append(status)
        if status!=200 or not raw: continue
        for c in scrape_links(url,raw,1,'Marwadi University',o['course_title']):
            evidence=c['listing_text']+' '+urllib.parse.unquote(urllib.parse.urlparse(c['url']).path)
            score=title_similarity(t['subject_title'],evidence)
            if score>=0.68:
                c['score']=score;c['context_course']=o['course_title'];c['expected_codes']=t['expected_codes_by_course'].get(o['source_course_id'],[])
                if c['url'] not in seen: seen.add(c['url']);out.append(c)
    api,api_network=wp_media_candidates(t)
    for c in api:
        if c['url'] not in seen: seen.add(c['url']);out.append(c)
    # Previous/current official pages are a discovery tier; do not assume the page itself is a syllabus.
    page_network=any((not s) or s in (401,403,408,425,429) or s>=500 for s in page_statuses) if page_statuses else True
    network=api_network or page_network
    out.sort(key=lambda c:(-c.get('score',0),c['url']))
    return out[:30],network


def process_target(t:dict,pages:dict[str,tuple[str,str,int,str]]) -> dict:
    r={'target_id':t['target_id'],'subject_title':t['subject_title'],'normalized_title':t['title_key'],'title_quality':t['title_quality'],
       'occurrence_count':t['occurrence_count'],'course_count':t['course_count'],'courses':' | '.join(t['courses']),
       'source_course_ids':' | '.join(t['course_ids']),'semesters':' | '.join(t['semesters']),'source_subject_ids':' | '.join(t['subject_ids']),
       'expected_codes_by_course':json.dumps(t['expected_codes_by_course'],ensure_ascii=False),'expected_codes':' | '.join(t['all_expected_codes']),
       'status':'','selected_tier':'','selected_institution':'','selected_pdf_url':'','selected_context_course':'','local_pdf_path':'',
       'sha256':'','page_count':'','pdf_declared_codes':'','validation_note':'','candidate_attempts':0,'network_issue_seen':'NO'}
    if is_generic_title(t['subject_title']):
        r['status']='EXCLUDED_INVALID_CATALOG_TITLE';r['validation_note']='Blank/generic title in mockData.js; not searched or downloadable until the actual subject name is corrected.'
        return r
    try:
        cands,network=target_candidates(t,pages); r['candidate_attempts']=len(cands)
        # Source order: test every Marwadi candidate first. If the tier could not be checked reliably,
        # do not claim absence; stop with retry status rather than silently falling back.
        for c in cands:
            a=download_candidate(t,c)
            if a['retryable']: network=True
            if a['accepted']:
                return save_accepted(t,r,a,network)
        primary_tier_unverified = network
        # Continue to relevant fallback sources so the run still collects usable PDFs. The final
        # record flags that Marwadi's primary tier was not completely checked; it must not imply
        # Marwadi definitively lacks a syllabus when its site/media API was blocked.
        for tier in (2,3):
            found,search_network=search_candidates(t,tier); network=network or search_network
            for c in found:
                a=download_candidate(t,c)
                if a['retryable']: network=True
                if a['accepted']: return save_accepted(t,r,a,network)
            if search_network:
                network=True
                # Keep checking the next approved fallback tier; if nothing verifies, the final
                # status remains retryable rather than treating this tier's access failure as absence.
        if network:
            r['status']='NETWORK_UNVERIFIED_RETRY';r['network_issue_seen']='YES'
            r['validation_note']='At least one source was blocked/unreachable; this is not proof a PDF does not exist.'
        else:
            r['status']='FAILED_NO_MATCHING_OFFICIAL_PDF'
            r['validation_note']='No acceptable title/content-matched PDF was found in accessible, searched official sources. This is not proof no such syllabus exists online.'
        return r
    except Exception as e:
        r['status']='PROCESSING_ERROR_RETRY';r['network_issue_seen']='YES';r['validation_note']=f'{type(e).__name__}: {e}'
        with LOCK: NETWORK_LOG.append({'time_local':time.strftime('%Y-%m-%d %H:%M:%S'),'action':'process_target','url':'','final_url':'','http_status':'PROCESSING_ERROR','content_type':'','response_bytes':0,'error':r['validation_note'],'subject_title':t['subject_title']})
        return r


def save_accepted(t:dict,r:dict,a:dict,network:bool)->dict:
    c=a['candidate']; body=a['body']
    sub=PDF_DIR/f'Tier_{c["tier"]}';sub.mkdir(parents=True,exist_ok=True)
    p=sub/f'{safe_name(t["subject_title"])} [{t["target_id"]}].pdf';p.write_bytes(body)
    a['row']['saved_pdf']=str(p.relative_to(OUT)).replace('\\','/')
    # Update existing validation record with saved path instead of duplicating the row.
    with LOCK:
        for existing in reversed(VALIDATION_LOG):
            if existing.get('candidate_url')==a['row']['candidate_url'] and existing.get('target_id')==t['target_id'] and existing.get('validation')=='VERIFIED_MATCH':
                existing['saved_pdf']=a['row']['saved_pdf'];break
    note=a['note']
    if network and c['tier']>1:
        note += ' Primary Marwadi discovery was partly blocked/unverified; this fallback PDF is verified, but do not infer Marwadi has no version.'
    r.update({'status':'VERIFIED_MARWADI' if c['tier']==1 else 'VERIFIED_GUJARAT_UNIVERSITY_COMPARABLE' if c['tier']==2 else 'VERIFIED_OTHER_OFFICIAL_COMPARABLE',
        'selected_tier':c['tier'],'selected_institution':c['institution'],'selected_pdf_url':c['url'],'selected_context_course':c.get('context_course',''),
        'local_pdf_path':str(p.relative_to(OUT)).replace('\\','/'),'sha256':a['row']['sha256'],'page_count':a['pages'],
        'pdf_declared_codes':' | '.join(a['codes']),'validation_note':note,'network_issue_seen':'YES' if network else 'NO'})
    return r


def emit_reports(meta,occurrences,targets,duplicates,results,manifest_url):
    source_catalog_rows = SOURCE_CATALOG
    write_csv(OUT/'source_catalog.csv', source_catalog_rows, ['tier','institution','role','url'])
    out_headers=['time_local','target_id','subject_title','tier','institution','candidate_url','final_url','discovered_from','context_course','listing_text','http_status','content_type','response_bytes','error','validation','validation_note','page_count','sha256','expected_codes','pdf_codes','title_token_overlap','saved_pdf','text_preview']
    write_csv(OUT/'pdf_validation_report.csv',VALIDATION_LOG,out_headers)
    write_csv(OUT/'source_attempts.csv',REQUEST_LOG,['time_local','action','url','final_url','http_status','content_type','response_bytes','error'])
    write_csv(OUT/'network_failures.csv',NETWORK_LOG)
    byid={r['target_id']:r for r in results}
    write_csv(OUT/'unique_download_list.csv',results)
    occrows=[]
    for t in targets:
        r=byid.get(t['target_id'],{})
        codes_pdf={x.strip().upper() for x in str(r.get('pdf_declared_codes','')).split('|') if x.strip()}
        for o in t['occurrences']:
            exp=set(t['expected_codes_by_course'].get(o['source_course_id'],[]))
            status=r.get('status','NOT_PROCESSED')
            if not status.startswith('VERIFIED_'): occurrence_status=status
            elif r.get('selected_tier')==1 and exp and codes_pdf and not exp.intersection(codes_pdf): occurrence_status='DUPLICATE_TITLE_CODE_MISMATCH_REVIEW'
            elif t['occurrence_count']>1 and not exp: occurrence_status='DUPLICATE_TITLE_SCOPE_REVIEW'
            else: occurrence_status=status
            occrows.append({'source_course_id':o['source_course_id'],'course_title':o['course_title'],'source_subject_id':o['source_subject_id'],
                'subject_title':o['subject_title'],'semester':o['semester'],'title_quality':o['title_quality'],'normalized_title':t['title_key'],
                'target_id':t['target_id'],'title_occurrence_count':t['occurrence_count'],'title_course_count':t['course_count'],
                'official_course_codes_for_occurrence':' | '.join(t['expected_codes_by_course'].get(o['source_course_id'],[])),
                'unique_title_status':status,'occurrence_review_status':occurrence_status,'selected_pdf_file':r.get('local_pdf_path',''),
                'selected_source':r.get('selected_institution',''),'selected_pdf_url':r.get('selected_pdf_url',''),'sha256':r.get('sha256',''),'note':r.get('validation_note','')})
    write_csv(OUT/'subject_occurrence_report.csv',occrows)
    drows=[]
    for d in duplicates:
        r=byid.get(d['target_id'],{})
        mismatches=sum(1 for x in occrows if x['target_id']==d['target_id'] and x['occurrence_review_status']=='DUPLICATE_TITLE_CODE_MISMATCH_REVIEW')
        drows.append({**d,'course_code_evidence_by_course':json.dumps(next((t['expected_codes_by_course'] for t in targets if t['target_id']==d['target_id']),{}),ensure_ascii=False),
            'all_expected_course_codes':' | '.join(next((t['all_expected_codes'] for t in targets if t['target_id']==d['target_id']),[])),
            'selected_course':r.get('selected_context_course',''),'selected_pdf':r.get('local_pdf_path',''),'selected_source':r.get('selected_institution',''),
            'selected_pdf_url':r.get('selected_pdf_url',''),'final_status':r.get('status',''),'course_occurrences_not_code_verified':mismatches,
            'verification_note':r.get('validation_note','')})
    write_csv(OUT/'duplicate_subject_titles.csv',drows)
    failures=[r for r in results if not str(r.get('status','')).startswith('VERIFIED_')]
    write_csv(OUT/'failed_subjects.csv',failures)
    quality=[o for o in occurrences if o['title_quality']!='CANDIDATE']
    write_csv(OUT/'catalog_data_quality_exclusions.csv',quality)
    write_csv(OUT/'source_occurrences_snapshot.csv',occurrences)
    write_json(OUT/'source_manifest_metadata.json',{**meta,'fetched_url':manifest_url,'unique_title_count':len(targets),'duplicate_title_group_count':len(duplicates)})
    from collections import Counter
    statuses=Counter(r.get('status','') for r in results)
    pdf_count=sum(1 for p in PDF_DIR.rglob('*.pdf')) if PDF_DIR.exists() else 0
    summary=[
      'PREPMASTER SCIENCE & PHARMACY SYLLABUS RECOVERY SUMMARY','='*62,
      'Run date: '+time.strftime('%Y-%m-%d %H:%M:%S'),f'Domain: {meta.get("domain_title")}',f'Manifest URL: {manifest_url}',
      f'Manifest source SHA-256: {meta.get("source_sha256")}',f'Courses in source catalog: {meta.get("course_count")}',
      f'Subject occurrences: {len(occurrences)}',f'Unique normalized title groups: {len(targets)}',f'Duplicate-title groups: {len(duplicates)}',
      f'Generic/blank-title occurrences excluded from download: {len(quality)}',f'PDF files actually saved: {pdf_count}',
      f'PDF candidate validations recorded: {len(VALIDATION_LOG)}',f'Network/access failures recorded: {len(NETWORK_LOG)}','',
      'RESULTS BY UNIQUE TITLE']+[f'  {k}: {v}' for k,v in sorted(statuses.items())]+[
      '', 'SOURCE ORDER','1. Marwadi University official course pages/direct syllabus PDFs.',
      '2. Gujarat University, Saurashtra University, GTU, and Gujarat agricultural universities (comparable official references, not Marwadi syllabi).',
      '3. PCI, ICAR, and other official Indian universities/education bodies (comparable references, not Marwadi syllabi).','',
      'DUPLICATE POLICY','Only one title-level download is attempted for each normalized title. All source subject IDs, courses and semesters stay in subject_occurrence_report.csv.',
      'A single title match does not guarantee syllabus equivalence across courses; code mismatches or missing per-course code evidence are explicitly flagged.','',
      'INVALID CATALOG TITLES','Blank names and generic labels such as "Course" are excluded from download attempts and listed in catalog_data_quality_exclusions.csv. They require catalog correction before a meaningful syllabus search.','',
      'STATUS WARNINGS','FAILED_NO_MATCHING_OFFICIAL_PDF means no acceptable PDF was found in accessible sources during this run, not proof that one does not exist.',
      'NETWORK_UNVERIFIED_RETRY and PROCESSING_ERROR_RETRY are not evidence that a subject should be removed.',
      'No database, GitHub, or production catalog writes were performed. Source IDs from mockData.js are not guaranteed to be live Supabase numeric IDs.',
      'Review these reports before any keep/remove decision: duplicate_subject_titles.csv, subject_occurrence_report.csv, failed_subjects.csv, pdf_validation_report.csv.']
    (OUT/'RUN_SUMMARY.txt').write_text('\n'.join(summary)+'\n',encoding='utf-8')
    output_zip=OUT/'Science_Pharmacy_Syllabus_Collection_Output.zip'
    with zipfile.ZipFile(output_zip,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5) as z:
        if PDF_DIR.exists():
            for p in sorted(PDF_DIR.rglob('*.pdf')): z.write(p,p.relative_to(OUT).as_posix())
        for p in sorted(OUT.iterdir()):
            if p.is_file() and p!=output_zip and p.suffix.lower() in ('.csv','.txt','.json'):
                z.write(p,p.relative_to(OUT).as_posix())
        z.writestr('OUTPUT_README.txt','Contains verified PDF downloads plus reports. Review duplicate_subject_titles.csv and subject_occurrence_report.csv before database decisions. No database or GitHub changes made.\n')
    with zipfile.ZipFile(output_zip) as z:
        bad=z.testzip()
        if bad: raise RuntimeError(f'Output ZIP validation failed at {bad}')
    log('Created and validated '+str(output_zip))


def write_json(path:Path,data:Any): path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')


def self_test()->int:
    fixture='''export const domains = [{"id":"science-pharmacy","title":"Science & Pharmacy","courses":[{"id":"b-sc-in-chemistry","title":"B.Sc Chemistry","subjects":[{"id":"1","title":"Cell Biology","sem":1},{"id":"2","title":"","sem":2}]},{"id":"b-sc-in-microbiology","title":"B.Sc Microbiology","subjects":[{"id":"3","title":"Cell Biology","sem":1},{"id":"4","title":"Basics of Microbiology","sem":1}],"scenarios":[{"id":"x","title":"DO NOT INCLUDE"}]}]}];'''
    occ,meta=decode_manifest(fixture)
    assert len(occ)==4 and meta['course_count']==2
    assert all(o['subject_title']!='DO NOT INCLUDE' for o in occ)
    targets,dups=build_targets(occ)
    assert len(targets)==3, f'Expected Cell Biology, Basics of Microbiology and blank group; got {len(targets)}'
    assert len(dups)==1, f'Expected only duplicate Cell Biology group, got {len(dups)}'
    assert sum(1 for t in targets if is_generic_title(t['subject_title']))==1
    assert host_allowed('https://www.marwadiuniversity.ac.in/bsc-in-chemistry-colleges-fees/',MARWADI_HOSTS)
    assert host_allowed('https://pci.gov.in/documents/test.pdf',OTHER_TIER_HOSTS)
    assert host_allowed('https://www.gsp.gtu.ac.in/any.pdf',GUJARAT_TIER_HOSTS)
    assert not host_allowed('http://www.marwadiuniversity.ac.in/a.pdf',MARWADI_HOSTS)
    assert not host_allowed('https://marwadiuniversity.ac.in.evil.example/a.pdf',MARWADI_HOSTS)
    doc=fitz.open();page=doc.new_page()
    lines=['Cell Biology','Course Objectives','Course Contents','Unit 1']
    lines += ['Cell structure, membranes, organelles, biological systems, transport, metabolism, research methods, laboratory methods, learning outcomes, assessment criteria and references.']*20
    page.insert_textbox(fitz.Rect(55,55,540,760),'\n'.join(lines),fontsize=10)
    pdf=doc.tobytes();doc.close()
    target={'subject_title':'Cell Biology'}; candidate={'tier':1,'expected_codes':[]}
    ok,note,pages,preview,codes,overlap=pdf_validate(pdf,target,candidate)
    assert ok and pages==1, f'Valid science subject PDF fixture rejected: {note}'
    shorttarget={'subject_title':'Cell'}
    ok,*_=pdf_validate(pdf,shorttarget,candidate)
    assert not ok,'A short title appearing only as part of a longer heading must be rejected'
    badtarget={'subject_title':'Cellular Respiration in Marine Engineering'}
    ok,*_=pdf_validate(pdf,badtarget,candidate)
    assert not ok,'Unrelated PDF must be rejected'
    print('SELF-TEST PASSED: science-pharmacy manifest, subject/scenario separation, duplicate grouping, blank-title exclusion, Marwadi/GTU/PCI host allowlists and generated PDF matching/rejection.')
    return 0


def main()->int:
    global WORKERS
    ap=argparse.ArgumentParser(description='Download and verify Science & Pharmacy syllabi without writing to DB/GitHub.')
    ap.add_argument('--self-test',action='store_true');ap.add_argument('--preflight-only',action='store_true');ap.add_argument('--workers',type=int,default=WORKERS)
    args=ap.parse_args()
    if args.self_test or args.preflight_only:
        print('Science & Pharmacy recovery preflight; no network download performed.')
        try: return self_test()
        except Exception: traceback.print_exc();return 3
    if args.workers<1 or args.workers>12: print('workers must be 1-12');return 2
    WORKERS=args.workers
    if OUT.exists() and any(OUT.iterdir()):
        archive=ROOT/('Output_previous_'+time.strftime('%Y%m%d_%H%M%S'))
        i=1
        while archive.exists(): archive=ROOT/('Output_previous_'+time.strftime('%Y%m%d_%H%M%S')+'_'+str(i));i+=1
        OUT.rename(archive);print('Previous output moved to',archive)
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'run_log.txt').write_text('',encoding='utf-8')
    log('Starting Science & Pharmacy syllabus recovery. No database/GitHub writes will be performed.')
    try:
        log('Fetching current PrepMaster Science & Pharmacy subject catalog from GitHub...')
        src,manifest_url=fetch_manifest();occ,meta=decode_manifest(src);targets,dups=build_targets(occ)
        log(f'Loaded {len(occ)} subject occurrences, {len(targets)} unique title groups, {len(dups)} duplicate title groups across {meta["course_count"]} courses.')
        course_ids={o['source_course_id'] for o in occ}
        log('Fetching official Marwadi course pages...')
        pages=preload_marwadi_pages(course_ids)
        scan_course_codes(targets,pages)
        write_csv(OUT/'source_occurrences_snapshot.csv',occ)
        write_csv(OUT/'unique_download_list_initial.csv',[{k:v for k,v in t.items() if k!='occurrences'} for t in targets])
        write_csv(OUT/'duplicate_subject_titles_initial.csv',dups)
        results=[]
        log('Searching once per unique non-generic title. Blank/"Course" catalog entries are excluded and reported.')
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs={ex.submit(process_target,t,pages):t for t in targets};done=0
            for fut in as_completed(futs):
                done+=1;t=futs[fut]
                try:r=fut.result()
                except Exception as e:r={'target_id':t['target_id'],'subject_title':t['subject_title'],'status':'PROCESSING_ERROR_RETRY','validation_note':f'{type(e).__name__}: {e}','network_issue_seen':'YES'}
                results.append(r);log(f'[{done}/{len(targets)}] {r.get("subject_title") or "[blank title]"} — {r.get("status")}')
        results.sort(key=lambda r:norm(r.get('subject_title','')))
        emit_reports(meta,occ,targets,dups,results,manifest_url)
        log('Recovery run finished. Inspect Output/RUN_SUMMARY.txt and duplicate/occurrence reports.')
        return 0
    except Exception as e:
        log(f'FATAL ERROR: {type(e).__name__}: {e}')
        with (OUT/'fatal_error.txt').open('a',encoding='utf-8') as f:f.write(f'\n{type(e).__name__}: {e}\n{traceback.format_exc()}\n')
        traceback.print_exc();return 1

if __name__=='__main__': raise SystemExit(main())
