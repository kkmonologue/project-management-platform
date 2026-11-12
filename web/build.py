"""Assembles the deployable page from src/ plus sync.js.
   python build.py  ->  dist/index.html   (deploy to Cloudflare Pages; legacy seed removed)
                        import/index.html (LOCAL ONLY, one-time legacy import; never deploy)
   Edit src/app.js (application), src/head.html (CSS/markup), sync.js (login + database). source.html is the frozen original."""
import os, shutil
rd = lambda f: open(f, encoding='utf8').read()
head, seed, data, app, tail = (rd('src/' + f) for f in ('head.html', 'seed.js', 'data.js', 'app.js', 'tail.html'))
sync = rd('sync.js')
CDN = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>\n<script src="config.js"></script>\n'

def page(seed_js):
    return (head + '<script>\n' + seed_js + data + '</script>\n<script>\n' + app + '</script>\n' + CDN +
            '<script>\n' + sync + '\n</script>\n' + tail)

os.makedirs('dist', exist_ok=True); os.makedirs('import', exist_ok=True)
open('dist/index.html', 'w', encoding='utf8').write(page('const SEED={"teams":[],"projects":[],"follows":[]};\n'))
open('import/index.html', 'w', encoding='utf8').write(page(seed))
for d in ('dist', 'import'):
    shutil.copy('config.js' if os.path.exists('config.js') else 'config.example.js', d + '/config.js')
shutil.copy('_headers', 'dist/_headers')
print('dist', os.path.getsize('dist/index.html'), 'import', os.path.getsize('import/index.html'))

# ---- demo build: same new UI, local browser data, no login or database (for the shared prototype artifact) ----
import re
orig = rd('source.html')
who = re.search(r'<label class="who" title=.*?</label>', orig, re.S).group(0)
reset = re.search(r'<button class="btn ghost sm" style="padding-left:0" data-act="reset">.*?</button>', orig).group(0)
demo_app = app
demo_app, n1 = re.subn(r'<div class="who" style="padding:4px 12px 4px 4px">.*?</div>', lambda m: who, demo_app, count=1, flags=re.S)
demo_app, n2 = re.subn(r'<button class="btn ghost sm" style="padding-left:0" data-act="signout">.*?</button>', lambda m: reset, demo_app, count=1)
assert n1 == 1 and n2 == 1, (n1, n2)
boot = ("\nconst DEMO_BUILD=true;\ntry{load();S.users.forEach(u=>{if(u.id==='cokey'||u.id==='brent')u.riskAll=true});runReminders()}catch(e){console.error(e)}\n"
        "render();\ntry{histBoot()}catch(e){console.error(e)}\n")
body_start = head.index('<body>') + len('<body>')
authored_head = head[body_start:].replace('<title>EMEA After-sales PMO</title>', '<title>BYD Aftersales PMO (Copy)</title>')
frag = authored_head + '<script>\n' + seed + data + '</script>\n<script>\n' + demo_app + boot + '</script>\n'
os.makedirs('demo', exist_ok=True)
open('demo/artifact.html', 'w', encoding='utf8').write(frag)
print('demo', os.path.getsize('demo/artifact.html'))
