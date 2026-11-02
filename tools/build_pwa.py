#!/usr/bin/env python3
"""Gera docs/index.html (versão iPhone/PWA, tema pastel rosa+lilás) a partir de www/index.html."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
s = (root / 'www/index.html').read_text(encoding='utf-8')

def sub(a, b, count=1):
    global s
    assert s.count(a) >= 1, a[:60]
    s = s.replace(a, b) if count == 0 else s.replace(a, b, count)

# --- meta ---
s = s.replace('content="#000000"', 'content="#fdf2f8"')
s = s.replace('black-translucent', 'default')
# --- paleta ---
s = re.sub(r':root\{--bg:#000;.*?--azul:#3d8bff;', ':root{--bg:#fdf2f8;--card:#ffffff;--card2:#f6edfd;--line:#f4e4f0;--line2:#e9d8f4;--tx:#4b3560;--mut:#9a86ad;--dim:#c5b6d4;--on:#ffffff;--lima:#ee7ab8;--lima2:#c9a6f5;--verm:#ef6a85;--azul:#9b8cf0;', s, count=1, flags=re.S)
# cores soltas no CSS/JS
for a, b in [
 ('color:#fff', 'color:var(--tx)'),
 ('background:#fff;color:#000', 'background:var(--tx);color:#fff'),
 ('color:#000', 'color:var(--on)'),
 ('border-color:#fff', 'border-color:var(--lima)'),
 ('border:2px solid #000', 'border:2px solid #fff'),
 ('#c5f400', '#ee7ab8'), ('#9bc400', '#c9a6f5'), ('#6b8a00', '#e9a6cf'), ('#3f5200', '#fbd3e8'),
 ('#2a1214', '#fde4ea'), ('#5a1f22', '#f7b6c4'), ('#242424', '#efe4f8'),
 ('stroke="#0e0e0e"', 'stroke="#ffffff"'), ('stroke="#3a3a3a"', 'stroke="#e1d0ee"'), ('fill="#fff"', 'fill="#4b3560"'),
 ('background:#161616', 'background:#ffffff'), ('rgba(18,18,18,.92)', 'rgba(255,255,255,.88)'), ('rgba(20,20,20,.7)', 'rgba(255,255,255,.75)'),
 ('rgba(0,0,0,.72)', 'rgba(75,53,96,.35)'), ('rgba(0,0,0,.35)', 'rgba(255,255,255,.55)'), ('rgba(0,0,0,.6)', 'rgba(150,100,190,.25)'),
 ('#1a1a1a','#f4e4f0'),('#171717','#f6edfd'),('#1c1c1c','#f0e3f6'),('#252525','#fde4f2'),('#0b0b0b','#fffafd'),('background:#222','background:#efe4f8'),('#b6ff2a','#bff0a8'),('#2fbf2f','#7fd69a'),('#ff6b6b','#ff9bb0'),('#e03a3a','#f27a93'),
 ('#b6f23a','#a9e6a0'),('#ff8a3d','#ffb38a'),('#f5c518','#f6cf7a'),('#8b7cff','#a99cff'),('#ff5fa2','#ff94c2'),('#ff5a5f','#ff8a99'),('#2fd1c5','#7fdccf'),('#ffd166','#ffd98a'),('#4dd0ff','#8fdcf7'),('#6fb3ff','#9cc7ff'),
 ('#ff7a1a','#ffab7a'),('#19c37d','#7fd9ae'),('#e5254b','#f27a93'),('#7c5cff','#a99cff'),('#2f8cff','#8fbcff'),
 ('rgba(197,244,0,.25)', 'rgba(238,122,184,.30)'), ('<i style="background:#fff"></i>', '<i style="background:#4b3560"></i>'),
]:
    s = s.replace(a, b)
# degradê do topo
s = re.sub(r'background:radial-gradient\(120% 90% at 85% 0%,#ff7a2f.*?#14091f\}', 'background:radial-gradient(120% 90% at 90% 0%,#ffc4e1 0%,rgba(255,196,225,0) 60%),radial-gradient(90% 80% at 0% 10%,#d4c1ff 0%,rgba(212,193,255,0) 62%),radial-gradient(100% 70% at 50% 100%,#ffe0ef 0%,rgba(255,224,239,0) 70%),#f6e9ff;color:var(--tx)}', s, count=1, flags=re.S)
s = s.replace('linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55))', 'linear-gradient(180deg,rgba(255,255,255,0) 55%,rgba(253,242,248,.55))')
# detalhes fofos
extra = """
/* ===== tema pastel (versão iPhone) ===== */
body{background:var(--bg)}
.card,.mini{box-shadow:0 6px 22px rgba(190,140,220,.14);border-color:var(--line)}
.btn.pri,.fab,.quick .go,.badge{background:linear-gradient(135deg,#f58fc6,#b99af2);color:#fff}
.fab{box-shadow:0 10px 26px rgba(185,154,242,.45)}
.btn.bco{background:var(--card2);color:var(--tx)}
.btn.no{background:#fde4ea;color:var(--verm)}
.hero .lbl{color:var(--mut)}
.title span{color:var(--lima)}
.sheet{box-shadow:0 -10px 40px rgba(150,100,190,.25)}
.dock nav{box-shadow:0 8px 26px rgba(190,140,220,.22)}
input,select,textarea{background:#fff;color:var(--tx);border-color:var(--line2)}
input::placeholder{color:var(--dim)}
.toast{box-shadow:0 14px 40px rgba(150,100,190,.3)}
"""
s = s.replace('</style>', extra + '</style>', 1)
(root / 'docs/index.html').write_text(s, encoding='utf-8')
print('docs/index.html gerado', len(s))
