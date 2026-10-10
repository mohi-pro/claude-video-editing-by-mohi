"""Face track for auto-framing ("virtual gimbal").

usage: engine/.venv/bin/python engine/track.py <cut.mp4> <out.json> [--fps 10]
Detects the face (OpenCV Haar, frontal + profile fallback) at `fps`, fills gaps, smooths with a
two-sided exponential filter, and writes [{t, x, y, h}] in canvas fractions:
x = face centre, y = eye line, h = face height.
"""
import argparse
import json
import subprocess
import sys

import cv2
import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("out")
    ap.add_argument("--fps", type=float, default=10)
    ap.add_argument("--smooth", type=float, default=0.35, help="seconds; bigger = calmer camera")
    a = ap.parse_args()
    probe = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                     "-of", "csv=p=0", a.video], text=True).strip().split(",")
    W, H = int(probe[0]), int(probe[1])
    sw = 360
    sh = int(H * sw / W)
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", a.video, "-vf", f"fps={a.fps},scale={sw}:{sh}", "-f", "rawvideo",
                          "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
    import os
    model = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "face_detection_yunet_2023mar.onnx")
    det = cv2.FaceDetectorYN.create(model, "", (sw, sh), 0.6, 0.3, 50)
    obs = []
    i = 0
    prev = None
    while True:
        buf = p.stdout.read(sw * sh * 3)
        if len(buf) < sw * sh * 3:
            break
        img = np.frombuffer(buf, np.uint8).reshape(sh, sw, 3)
        _, res = det.detect(img)
        faces = [] if res is None else [r for r in res if r[2] > sw * 0.08]
        best = None
        if faces:
            # biggest face, but stay with the previous one if several
            def score(f):
                s = f[2] * f[3]
                if prev is not None:
                    s -= 4 * ((f[0] + f[2] / 2 - prev[0]) ** 2 + (f[1] + f[3] / 2 - prev[1]) ** 2)
                return s
            f = max(faces, key=score)
            prev = (f[0] + f[2] / 2, f[1] + f[3] / 2)
            ex, ey = (f[4] + f[6]) / 2, (f[5] + f[7]) / 2  # midpoint of the eyes (landmarks)
            best = (ex / sw, ey / sh, f[3] / sh)
        obs.append(best)
        i += 1
    n = len(obs)
    if not n or all(o is None for o in obs):
        json.dump({"ok": False, "track": []}, open(a.out, "w"))
        print('{"ok": false, "reason": "no face found"}')
        return 1
    arr = np.full((n, 3), np.nan)
    for k, o in enumerate(obs):
        if o is not None:
            arr[k] = o
    # fill gaps by linear interpolation
    idx = np.arange(n)
    for c in range(3):
        good = ~np.isnan(arr[:, c])
        arr[:, c] = np.interp(idx, idx[good], arr[good, c])
    # reject single-frame outliers (median of 5), then two-sided exponential smoothing
    med = arr.copy()
    for k in range(n):
        med[k] = np.median(arr[max(0, k - 2): k + 3], axis=0)
    alpha = 1 - np.exp(-1 / (a.fps * a.smooth))
    fw = med.copy()
    for k in range(1, n):
        fw[k] = fw[k - 1] + alpha * (med[k] - fw[k - 1])
    bw = fw.copy()
    for k in range(n - 2, -1, -1):
        bw[k] = bw[k + 1] + alpha * (fw[k] - bw[k + 1])
    track = [{"t": round(k / a.fps, 3), "x": round(float(bw[k, 0]), 4), "y": round(float(bw[k, 1]), 4), "h": round(float(bw[k, 2]), 4)} for k in range(n)]
    found = sum(o is not None for o in obs)
    presence = [round(float(o[2]), 3) if o is not None else 0 for o in obs]  # raw face height per sample (0 = no face)
    json.dump({"ok": True, "fps": a.fps, "detected": round(found / n, 3), "track": track, "presence": presence}, open(a.out, "w"))
    xs, ys = bw[:, 0], bw[:, 1]
    print(json.dumps({"ok": True, "samples": n, "detected": round(found / n, 3), "x": [round(float(xs.min()), 3), round(float(xs.max()), 3)],
                      "y": [round(float(ys.min()), 3), round(float(ys.max()), 3)]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
