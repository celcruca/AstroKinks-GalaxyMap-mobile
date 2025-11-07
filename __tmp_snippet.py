import pathlib
text = pathlib.Path(''main.js'').read_text(encoding='utf-8')
idx = text.find('const displayName = target')
print(text[idx:idx+120])
