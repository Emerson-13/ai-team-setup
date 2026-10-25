import re, glob, json, os, sys, yaml
root=sys.argv[1]; os.chdir(root)
fails=[]
def fail(m): fails.append(m); print("FAIL",m)
def ok(m): print("ok  ",m)
def rd(p): return open(p,encoding='utf-8').read()

docs={os.path.basename(p) for p in glob.glob('stubs/docs/ai/*.md')}
for f in ['stubs/root/AGENTS.md','stubs/root/CLAUDE.md','README.md']+glob.glob('stubs/docs/ai/*.md')+glob.glob('stubs/claude/agents/*.md'):
    for m in re.findall(r'docs/ai/([A-Z0-9_-]+\.md)', rd(f)):
        if m not in docs: fail(f"{f} references missing docs/ai/{m}")
ok("doc references resolve")

team=rd('stubs/docs/ai/TEAM.md')
heads=set(re.findall(r'^#{1,3} (\d+(?:\.\d+)?)[. ]',team,re.M))
for f in glob.glob('stubs/docs/ai/*.md'):
    for m in re.findall(r'TEAM\.md Section (\d+(?:\.\d+)?)', rd(f)):
        if m not in heads: fail(f"{f}: TEAM.md Section {m} does not exist")
ok("TEAM.md section references resolve")

proto=rd('stubs/docs/ai/PROTOCOL.md')
psec=set(re.findall(r'^## (\d+)\.',proto,re.M))
for m in re.findall(r'PROTOCOL\.md Section (\d+)',proto+rd('stubs/docs/ai/PROMPTS.md')+rd('stubs/root/AGENTS.md')+rd('stubs/docs/ai/TEAM.md')):
    if m not in psec: fail(f"PROTOCOL Section {m} missing")
ok("PROTOCOL section references resolve")

readme=rd('README.md'); claude=rd('stubs/root/CLAUDE.md')
agents=sorted(glob.glob('stubs/claude/agents/*.md'))
for f in agents:
    s=rd(f); fm=yaml.safe_load(s.split('---')[1]); n=os.path.basename(f)[:-3]
    if fm.get('name')!=n: fail(f"{f} name mismatch")
    if not fm.get('description') or not fm.get('tools'): fail(f"{f} missing description/tools")
    if 'STATUS: completed | blocked' not in s or f'AGENT: {n}' not in s: fail(f"{f} missing status contract")
    if f'`{n}`' not in readme: fail(f"README missing agent {n}")
    if n not in claude: fail(f"CLAUDE.md missing agent {n}")
ok(f"{len(agents)} agents valid, status contract present, listed in README and CLAUDE.md")

route=proto.split('## 2.')[0]
targets=set(re.findall(r'\| `([a-z-]+)` ',route))
for n in targets:
    if not os.path.exists(f'stubs/claude/agents/{n}.md'): fail(f"PROTOCOL routes to missing agent {n}")
missing=[os.path.basename(f)[:-3] for f in agents if os.path.basename(f)[:-3] not in targets]
if missing: fail(f"agents not in PROTOCOL routing table: {missing}")
ok(f"PROTOCOL routing covers all {len(targets)} agents")

for f in glob.glob('stubs/docs/ai/*.md')+['README.md','stubs/root/AGENTS.md','stubs/root/CLAUDE.md']:
    if rd(f).count('```')%2: fail(f"unbalanced code fence {f}")
ok("code fences balanced")

sz=os.path.getsize('stubs/root/AGENTS.md')
if sz>24000: fail(f"AGENTS.md too large {sz}")
ok(f"AGENTS.md {sz} bytes (Codex limit is about 32 KiB)")

for f in glob.glob('stubs/docs/ai/n8n/*.json'):
    d=json.load(open(f))
    if 'credentials' in json.dumps(d): fail(f"{f} has credentials")
ok("n8n workflows valid JSON, no credentials")

for need in ['stubs/docs/ai/templates/laravel/StorageService.php','stubs/docs/ai/STORAGE.md','stubs/docs/ai/PROMPTS.md']:
    if not os.path.exists(need): fail(f"missing {need}")
for must in ['STORAGE.md','PROTOCOL.md','PROMPTS.md','UI.md','N8N.md','ACCESS.md','TOOLS.md']:
    for f in ['README.md','stubs/root/AGENTS.md','stubs/docs/ai/TEAM.md']:
        if must not in rd(f): fail(f"{f} does not mention {must}")
ok("all playbooks mentioned in README, AGENTS.md, TEAM.md")

bad=[p for p in glob.glob('**/*',recursive=True) if p.endswith(('.orig','.bak','~'))]
if bad: fail(f"stray files {bad}")
ok("no stray files")
print("\nFAILED:",len(fails) if fails else "none"); sys.exit(1 if fails else 0)
