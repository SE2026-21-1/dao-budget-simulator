import os, subprocess, socket, json, datetime, pathlib
root=pathlib.Path('/tmp/dao-pr65-tv1-evidence/attempt2')
root.mkdir(exist_ok=True)
pg=pathlib.Path('/tmp/dao-what-if-pg-root/usr/lib/postgresql/16/bin')
env=os.environ.copy()
for k in list(env):
    if k.startswith('PG') or k in ['DATABASE_URL','BE05_TEST_DATABASE_URL']: env.pop(k,None)
env['PATH']='/tmp/node-v24.15.0-linux-x64/bin:'+env['PATH']
env['LD_LIBRARY_PATH']='/tmp/dao-what-if-pg-root/usr/lib/x86_64-linux-gnu'
records=[]
def run(args,name,**kw):
    with (root/(name+'.log')).open('w') as f:
        p=subprocess.run(args,env=kw.pop('env',env),stdout=f,stderr=subprocess.STDOUT,**kw)
    records.append({'command':args,'exitCode':p.returncode,'log':name+'.log','at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
    print(name,p.returncode,flush=True)
    if p.returncode: raise RuntimeError(name+' failed')
data=root/'pg-data'; sock=root/'pg-socket'; sock.mkdir(exist_ok=True)
with socket.socket() as s:
    s.bind(('127.0.0.1',0)); port=s.getsockname()[1]
started=False
try:
    run([str(pg/'initdb'),'-D',str(data),'-L','/tmp/dao-what-if-pg-root/usr/share/postgresql/16','-A','trust','--no-sync','--no-locale','-E','UTF8'],'pg-init')
    run([str(pg/'pg_ctl'),'-D',str(data),'-l',str(root/'pg-server.log'),'-o',f'-h 127.0.0.1 -p {port} -k {sock} -c shared_buffers=16MB -c max_connections=20 -c fsync=off -c synchronous_commit=off -c full_page_writes=off','-w','start'],'pg-start')
    started=True
    run([str(pg/'createdb'),'-h','127.0.0.1','-p',str(port),'tv4_be05_pr65_tv1'],'pg-createdb')
    run([str(pg/'psql'),'-h','127.0.0.1','-p',str(port),'-d','tv4_be05_pr65_tv1','-XAtc','select version()'],'pg-version')
    te=env.copy(); te['BE05_TEST_ISOLATED']='1'; te['BE05_TEST_DATABASE_URL']=f'postgresql://{os.getuid() and os.environ.get("USER","nvdungmim")}@127.0.0.1:{port}/tv4_be05_pr65_tv1'
    run(['npm','run','test:api'],'api-postgres',env=te,cwd='/tmp/dao-pr65-tv1-review-8838cfd')
finally:
    if started:
        run([str(pg/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],'pg-stop')
    (root/'database-results.json').write_text(json.dumps(records,indent=2)+'\n')
