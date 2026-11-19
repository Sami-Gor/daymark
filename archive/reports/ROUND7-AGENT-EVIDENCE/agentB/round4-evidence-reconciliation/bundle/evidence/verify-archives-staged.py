#!/usr/bin/env python3
# R4 B -- read-only archive/member/staged-asset re-verification. Writes JSON+TSV evidence only.
import bz2, tarfile, hashlib, json, os, sys, time

T5 = "/Volumes/DaymarkWorkspace/Daymark"
OLD = os.path.join(T5, "archive/assets/parakeet-preservation/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2")
NEW = os.path.join(T5, "quarantine/parakeet-20261118/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2")
STAGED = [
  os.path.join(T5, "repositories/daymark/artifacts/weather-app/android/parakeet-assets/src/main/assets/parakeet"),
  os.path.join(T5, "worktrees/negative/artifacts/weather-app/android/parakeet-assets/src/main/assets/parakeet"),
]
OUT = os.path.join(T5, "archive/reports/round4-b-evidence-20261118")

def sha256_file(p):
    h = hashlib.sha256(); n = 0
    with open(p, "rb") as f:
        while True:
            c = f.read(1 << 20)
            if not c: break
            h.update(c); n += len(c)
    return n, h.hexdigest()

def stream_members(p):
    out = []
    with bz2.BZ2File(p) as bz, tarfile.open(fileobj=bz, mode="r|") as tf:
        for m in tf:
            row = {"name": m.name, "type": "dir" if m.isdir() else ("file" if m.isfile() else "other"),
                   "declared_size": m.size}
            if m.isfile():
                h = hashlib.sha256(); n = 0
                f = tf.extractfile(m)
                while True:
                    c = f.read(1 << 20)
                    if not c: break
                    h.update(c); n += len(c)
                row["read_size"] = n; row["sha256"] = h.hexdigest()
            out.append(row)
    return out

def main():
    os.makedirs(OUT, exist_ok=True)
    ev = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "archives": {}, "staged": {}}
    for label, p in (("old", OLD), ("new", NEW)):
        st = os.stat(p)
        n, h = sha256_file(p)
        ev["archives"][label] = {"path": p, "size": n, "sha256": h, "mode": oct(st.st_mode & 0o777), "mtime": int(st.st_mtime)}
        ev["archives"][label]["members"] = stream_members(p)
        print("ARCHIVE", label, n, h, "members", len(ev["archives"][label]["members"]), flush=True)
    for d in STAGED:
        ev["staged"][d] = {}
        for fn in ("encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"):
            fp = os.path.join(d, fn)
            if os.path.exists(fp):
                n, h = sha256_file(fp)
                ev["staged"][d][fn] = {"size": n, "sha256": h, "mtime": int(os.stat(fp).st_mtime)}
                print("STAGED", d, fn, n, h, flush=True)
    with open(os.path.join(OUT, "archive-staged-reverify.json"), "w") as f:
        json.dump(ev, f, indent=2, sort_keys=True)
    # TSV member tables
    for label in ("old", "new"):
        with open(os.path.join(OUT, "members-%s.tsv" % label), "w") as f:
            f.write("member\ttype\tsize\tsha256\n")
            for m in ev["archives"][label]["members"]:
                f.write("%s\t%s\t%s\t%s\n" % (m["name"], m["type"], m.get("read_size", 0), m.get("sha256", "-")))
    print("DONE")

if __name__ == "__main__":
    main()
