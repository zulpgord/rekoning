#!/bin/zsh
# Rigenera la voce di Alfie nella video guida (scheda Dati e guida), in italiano,
# inglese e cinese, e la incorpora in index.html dentro <script id="kwAudio">.
# I testi stanno in <script id="kwSay">; qui si corregge solo la pronuncia
# (solo per l'audio: il testo a schermo non cambia).
# Voci neurali maschili Kokoro, in locale e senza chiavi:
#   italiano im_nicola, inglese am_michael, cinese zm_yunxi.
# Requisiti:
#   - brew install espeak-ng
#   - un Python >= 3.10 con kokoro-onnx, soundfile e "misaki[zh]",
#     indicato con KW_PY=/percorso/python
#   - i file del modello (kokoro-v1.0.onnx e voices-v1.0.bin, dalle release
#     di github.com/thewh1teagle/kokoro-onnx) nella cartella KW_KOKORO
# Uso: KW_PY=… KW_KOKORO=… tools/kw-audio.sh
set -e
cd "$(dirname "$0")/.."
: "${KW_PY:?indica il Python con kokoro-onnx in KW_PY}"
: "${KW_KOKORO:?indica la cartella del modello Kokoro in KW_KOKORO}"
ESPEAK="$(brew --prefix espeak-ng)"
TMP=$(mktemp -d)
"$KW_PY" -W ignore - "$TMP" "$KW_KOKORO" "$ESPEAK" <<'EOF'
import json, os, re, sys
import soundfile as sf
from kokoro_onnx import Kokoro, EspeakConfig
from misaki import zh
out, mod, esp = sys.argv[1:4]
s = open("index.html").read()
a = s.index('<script id="kwSay" type="application/json">'); a = s.index(">", a) + 1
say = json.loads(s[a:s.index("</script>", a)])
k = Kokoro(f"{mod}/kokoro-v1.0.onnx", f"{mod}/voices-v1.0.bin",
           espeak_config=EspeakConfig(lib_path=f"{esp}/lib/libespeak-ng.dylib", data_path=f"{esp}/share/espeak-ng-data"))
g2p_zh = zh.ZHG2P()
VOCE = {"it": ("im_nicola", "it", 1.0), "en": ("am_michael", "en-us", .96), "zh": ("zm_yunxi", None, 1.0)}
# pronuncia: sostituzioni applicate solo al parlato
PRON = {
  "it": {"Reckoning": "Rèkoning", "Alfie": "Alfi", "CAPEX": "Càpex", "OPEX": "Òpex", "payback": "pèibek", "business case": "bìsness keis",
         "contingency": "contìngensi", "insourcing": "insòrsing", "browser": "brauser", "mouse": "maus", "template": "tèmpleit",
         "Sensitivity": "Sensitìviti", "Report": "Ripòrt", "PDF": "pi di effe", "CSV": "ci esse vu", "VAN": "Van", "TIR": "Tir"},
  "en": {"CAPEX": "cap ex", "OPEX": "op ex", "IRR": "I R R", "NPV": "N P V"},
  "zh": {"Reckoning": "瑞克宁"},
}
for lang, texts in say.items():
    os.makedirs(f"{out}/{lang}")
    voce, codice, vel = VOCE[lang]
    for i, t in enumerate(texts):
        for x, y in PRON[lang].items():
            t = re.sub(rf"\b{re.escape(x)}\b", y, t)
        if lang == "zh":
            t = re.sub(r"（[A-Za-z ]+）", "", t)
            ph = g2p_zh(t); ph = ph[0] if isinstance(ph, tuple) else ph
            audio, sr = k.create(ph, voice=voce, speed=vel, is_phonemes=True)
        else:
            audio, sr = k.create(t, voice=voce, speed=vel, lang=codice)
        sf.write(f"{out}/{lang}/{i:02d}.wav", audio, sr)
    print(lang, len(texts), "scene,", voce)
EOF
for L in it en zh; do
  for f in "$TMP/$L"/*.wav; do afconvert -f m4af -d aac -b 32000 -c 1 "$f" "${f%.wav}.m4a"; done
done
python3 - "$TMP" <<'EOF'
import base64, glob, json, sys
au = {L: ["data:audio/mp4;base64," + base64.b64encode(open(f, "rb").read()).decode()
          for f in sorted(glob.glob(f"{sys.argv[1]}/{L}/*.m4a"))] for L in ("it", "en", "zh")}
p = "index.html"; s = open(p).read()
a = s.index('<script id="kwAudio">'); b = s.index("</script>", a) + 9
s = s[:a] + '<script id="kwAudio">/* voce della video guida: generata da tools/kw-audio.sh */ const KW_AUDIO = ' + json.dumps(au) + ";</script>" + s[b:]
open(p, "w").write(s)
print("audio incorporato:", len(json.dumps(au)) // 1024, "KB")
EOF
rm -rf "$TMP"
