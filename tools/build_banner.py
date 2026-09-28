"""Build assets/banner.svg from tools/banner.src.svg with a subset of JetBrains Mono embedded,
so the banner looks the same for every visitor. Needs fonttools + brotli and the Nerd Font installed.

    python tools/build_banner.py
"""
import base64, io, pathlib, re
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = pathlib.Path('/usr/share/fonts/TTF')
src = (ROOT / 'tools/banner.src.svg').read_text()
chars = ''.join(sorted(set(re.sub(r'<[^>]+>', '', src.split('</style>')[1]))))

def face(file, weight):
    font = TTFont(FONTS / file)
    opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = []
    sub = subset.Subsetter(opts); sub.populate(text=chars); sub.subset(font)
    buf = io.BytesIO(); font.flavor = 'woff2'; font.save(buf)
    data = base64.b64encode(buf.getvalue()).decode()
    return f"@font-face {{ font-family: 'LM'; font-weight: {weight}; src: url(data:font/woff2;base64,{data}) format('woff2'); }}"

out = src.replace('/*FONTS*/', face('JetBrainsMonoNerdFont-Regular.ttf', 400) + '\n' + face('JetBrainsMonoNerdFont-Bold.ttf', 700))
(ROOT / 'assets/banner.svg').write_text(out)
print(f'assets/banner.svg: {len(out) // 1024} KB, {len(chars)} glyphs')
