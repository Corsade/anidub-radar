"""Run before publishing JS/CSS changes to keep browser assets in sync."""
import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
assets = sorted([*ROOT.glob('*.js'), *ROOT.glob('*.css')])
normalize = lambda text: re.sub(r'\?v=[0-9a-f]{12}', '', text)
contents = {path: normalize(path.read_text(encoding='utf-8-sig')) for path in assets}
digest = hashlib.sha256(''.join(path.name + '\n' + contents[path] for path in assets).encode()).hexdigest()[:12]
# A single release fingerprint covers the entire module graph and stylesheet.
for path in [*assets, ROOT / 'index.html', ROOT / 'tests' / 'index.html']:
    text = normalize(path.read_text(encoding='utf-8-sig'))
    text = re.sub(r'''(["'])(\.{1,2}/[^"']+\.js)\1''', lambda m: f'{m[1]}{m[2]}?v={digest}{m[1]}', text)
    if path.suffix == '.html':
        text = re.sub(r'(src|href)="([^"?]+\.(?:js|css))"', lambda m: f'{m[1]}="{m[2]}?v={digest}"', text)
    path.write_text(text, encoding='utf-8')
print('Asset version:', digest)
