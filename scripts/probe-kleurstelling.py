# De onafhankelijke lezer voor proef L0 (design/ontwerpen/lakstudio.md §9): de
# kleurstellingen van elke .bus/.ovh/.sco onder Vehicles, zoals Omsi.exe ze telt.
# Los geschreven van src/core/kleurstelling.ts (en uit K/rp_index.py): wie
# hetzelfde vindt, heeft dezelfde regels, niet dezelfde fout.
#
#   python scripts/probe-kleurstelling.py [<OMSI-map>] > uit.json
#
# De regels (Omsi.exe 0x5F02D8, 0x5F0509, 0x5F0C16-0x5F13FB):
#  1. een kop telt alleen als de hele regel precies [item]/[setvar]/[CTC]/[CTCTexture] is;
#  2. een [item] telt alleen als zijn plek in [CTCTexture] van deze cfg staat, dan pas de naam;
#  3. een [setvar] hoort bij het laatst aangenomen item, ook in een volgend bestand;
#  4. plek, naam en variabele gelijk na UpperCase van alleen a-z;
#  5. niets getrimd;
#  6. de CTC-map vanaf de map van de .bus.
# Een .cti leest OMSI met Readln (regel eindigt op LF, losse CR valt weg); een cfg
# met TStringList (CR, LF en CRLF breken). De .cti's in de volgorde van de schijf.
# Alleen lezen.
import json
import os
import re
import sys

OMSI = sys.argv[1] if len(sys.argv) > 1 else r"C:\Program Files (x86)\Steam\steamapps\common\OMSI 2"
VEHICLES = os.path.join(OMSI, "Vehicles")

KLEIN = "abcdefghijklmnopqrstuvwxyz"
GROOT = KLEIN.upper()
HOOFD = str.maketrans(KLEIN, GROOT)
GETAL = re.compile(r"^ *[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)? *$")


def hoofd(s):
    return s.translate(HOOFD)


def ansi(b):
    # Zoals Windows-1252; de vijf gaten (0x81, 0x8D, 0x8F, 0x90, 0x9D) als hetzelfde codepunt.
    return b.decode("cp1252", errors="ignore") if all(x not in b for x in b"\x81\x8d\x8f\x90\x9d") else "".join(
        chr(c) if c in (0x81, 0x8D, 0x8F, 0x90, 0x9D) else bytes([c]).decode("cp1252") for c in b
    )


def cfg_regels(pad):
    b = open(pad, "rb").read()
    if b[:2] == b"\xff\xfe":
        t = b[2:].decode("utf-16-le", errors="replace")
    elif b[:3] == b"\xef\xbb\xbf":
        t = b[3:].decode("utf-8", errors="replace")
    else:
        t = ansi(b)
    return re.split(r"\r\n|\r|\n", t)


def cti_regels(pad):
    b = open(pad, "rb").read()
    return [ansi(r.replace(b"\r", b"")) for r in b.split(b"\n")]


def regel(r, i):
    return r[i] if i < len(r) else ""


def bus_model(pad):
    # Zoals de app het [model] van een .bus vindt (core/busmodel.ts): geen van de zes regels.
    try:
        r = [x.rstrip("\r") for x in open(pad, "rb").read().decode("cp1252", errors="replace").split("\n")]
    except OSError:
        return None
    for i, x in enumerate(r):
        if x.strip().lower() == "[model]":
            rel = regel(r, i + 1).strip()
            if not rel:
                return None
            p = os.path.join(os.path.dirname(pad), *[d for d in re.split(r"[\\/]", rel) if d])
            return p if os.path.isfile(p) else None
    return None


def lees(bus):
    cfg = bus_model(bus)
    if not cfg:
        return None
    try:
        c = cfg_regels(cfg)
    except OSError:
        return None
    blokken = []
    i = 0
    while i < len(c):
        if c[i] == "[CTC]":
            blokken.append({"var": regel(c, i + 1), "map": regel(c, i + 2), "plekken": []})
            i += 4
            continue
        if c[i] == "[CTCTexture]":
            if blokken:
                blokken[-1]["plekken"].append(regel(c, i + 1))
            i += 3
            continue
        i += 1
    if not blokken or not blokken[0]["var"]:
        return None
    eerste = blokken[0]
    busmap = os.path.dirname(bus)
    map_ = os.path.join(busmap, *[d for d in re.split(r"[\\/]", eerste["map"]) if d])
    plekken = set(hoofd(p) for p in eerste["plekken"])
    try:
        ctis = [f for f in os.listdir(map_) if f.lower().endswith(".cti")]
    except OSError:
        return None
    namen = []  # [spelling]
    index = {}  # hoofd(naam) -> plek in namen
    setvars = []  # per naam: {hoofd(var): [spelling, waarde]}
    huidig = None
    for f in ctis:  # de volgorde van de schijf, zoals FindFirst/FindNext
        try:
            L = cti_regels(os.path.join(map_, f))
        except OSError:
            continue
        k = 0
        while k < len(L):
            if L[k] == "[item]":
                naam, plek = regel(L, k + 1), regel(L, k + 2)
                k += 4
                if hoofd(plek) not in plekken:
                    continue
                h = hoofd(naam)
                if h not in index:
                    index[h] = len(namen)
                    namen.append(naam)
                    setvars.append({})
                huidig = index[h]
                continue
            if L[k] == "[setvar]":
                var, waarde = regel(L, k + 1), regel(L, k + 2)
                k += 3
                if huidig is None or not GETAL.match(waarde):
                    continue
                h = hoofd(var)
                spelling = setvars[huidig][h][0] if h in setvars[huidig] else var
                setvars[huidig][h] = [spelling, float(waarde.strip())]
                continue
            k += 1
    if not namen:
        return None
    return {
        "cfg": os.path.relpath(cfg, VEHICLES),
        "variabele": eerste["var"],
        "map": os.path.relpath(map_, VEHICLES),
        "namen": namen,
        "setvars": [{s: w for s, w in d.values()} for d in setvars],
    }


uit = {}
for wortel, _, bestanden in os.walk(VEHICLES):
    for f in bestanden:
        if os.path.splitext(f)[1].lower() in (".bus", ".ovh", ".sco"):
            pad = os.path.join(wortel, f)
            r = lees(pad)
            if r:
                uit[os.path.relpath(pad, VEHICLES)] = r
json.dump(uit, sys.stdout, ensure_ascii=True, indent=0, sort_keys=True)
