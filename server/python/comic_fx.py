#!/usr/bin/env python3
"""
comic_skin_fx.py  (v3.2)
"""

import sys
import os
import json
import argparse
import cv2
import subprocess
import numpy as np
from PIL import Image as PILImage, ImageSequence

# ---- Skin detection ranges (YCrCb is more lighting-robust than RGB/HSV) ----
SKIN_LOWER = np.array([0, 135, 85], dtype=np.uint8)
SKIN_UPPER = np.array([255, 180, 135], dtype=np.uint8)


# ============================== Skin masking ==============================

def detect_skin_mask(frame_bgr: np.ndarray) -> np.ndarray:
    """Return a single-channel 0..255 mask of likely skin pixels."""
    ycrcb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2YCrCb)
    mask = cv2.inRange(ycrcb, SKIN_LOWER, SKIN_UPPER)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.GaussianBlur(mask, (7, 7), 0)
    return mask


def _circle_at_frame(c: dict, frame_idx: int):
    track = c.get("track")
    if not track:
        return c.get("x"), c.get("y"), c.get("r")

    pts = sorted(track, key=lambda t: t["frame"])
    if frame_idx <= pts[0]["frame"]:
        kp = pts[0]
        return kp["x"], kp["y"], kp["r"]
    if frame_idx >= pts[-1]["frame"]:
        kp = pts[-1]
        return kp["x"], kp["y"], kp["r"]

    for a, b in zip(pts, pts[1:]):
        if a["frame"] <= frame_idx <= b["frame"]:
            span = max(1, b["frame"] - a["frame"])
            t = (frame_idx - a["frame"]) / span
            x = a["x"] + (b["x"] - a["x"]) * t
            y = a["y"] + (b["y"] - a["y"]) * t
            r = a["r"] + (b["r"] - a["r"]) * t
            return x, y, r
    return None, None, None


def apply_manual_circles(mask: np.ndarray, frame_idx: int, corrections: list) -> np.ndarray:
    if not corrections:
        return mask
    out = mask.copy()
    for c in corrections:
        if not (c.get("frame_start", 0) <= frame_idx <= c.get("frame_end", 10**9)):
            continue
        x, y, r = _circle_at_frame(c, frame_idx)
        if x is None:
            continue
        mode = c.get("mode", "add")
        value = 255 if mode == "add" else 0
        cv2.circle(out, (int(round(x)), int(round(y))), int(round(r)), value, -1)
    return out


def smooth_mask_temporal(curr_mask: np.ndarray, prev_mask: np.ndarray, alpha: float = 0.6) -> np.ndarray:
    if prev_mask is None:
        return curr_mask
    blended = cv2.addWeighted(curr_mask.astype(np.float32), alpha,
                               prev_mask.astype(np.float32), 1 - alpha, 0)
    return blended.astype(np.uint8)


def whiten_skin(frame_bgr: np.ndarray, mask_soft: np.ndarray) -> np.ndarray:
    mask_f = (mask_soft.astype(np.float32) / 255.0)[..., None]
    white = np.full_like(frame_bgr, 255)
    out = frame_bgr.astype(np.float32) * (1 - mask_f) + white.astype(np.float32) * mask_f
    return out.astype(np.uint8)


# ============================ Stable color palette ==========================

def compute_global_palette(in_path: str, is_img: bool = False, num_colors: int = 8, samples: int = 24) -> np.ndarray:
    if is_img:
        if in_path.lower().endswith('.gif'):
            img = PILImage.open(in_path)
            # FIX: Explicit cast generator wrapper to a formal python list before tracking slices
            all_frames = list(ImageSequence.Iterator(img))
            frames = [cv2.cvtColor(np.array(f.convert('RGB')), cv2.COLOR_RGB2BGR) for f in all_frames[:samples]]
            data = np.vstack([cv2.resize(f, (f.shape[1]//2, f.shape[0]//2)).reshape(-1, 3) for f in frames]).astype(np.float32)
        else:
            frame = cv2.imread(in_path)
            small = cv2.resize(frame, (frame.shape[1] // 2, frame.shape[0] // 2))
            data = small.reshape(-1, 3).astype(np.float32)
    else:
        cap = cv2.VideoCapture(in_path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or samples
        step = max(1, total // samples)
        pixels = []
        idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if idx % step == 0:
                smooth = cv2.bilateralFilter(frame, d=9, sigmaColor=75, sigmaSpace=75)
                small = cv2.resize(smooth, (smooth.shape[1] // 4, smooth.shape[0] // 4))
                pixels.append(small.reshape(-1, 3))
            idx += 1
        cap.release()
        data = np.vstack(pixels).astype(np.float32)

    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, _, centers = cv2.kmeans(data, num_colors, None, criteria, 5, cv2.KMEANS_PP_CENTERS)
    return np.uint8(centers)


def update_output_path_for_gif(out_path: str) -> str:
    """Safely updates target tracking path extension for compiled web videos."""
    ext = os.path.splitext(out_path)[1]
    if ext.lower() == '.gif':
        return os.path.splitext(out_path)[0] + '.mp4'
    return out_path


def quantize_to_palette(frame_bgr: np.ndarray, palette: np.ndarray) -> np.ndarray:
    h, w = frame_bgr.shape[:2]
    flat = frame_bgr.reshape(-1, 3).astype(np.float32)
    pal = palette.astype(np.float32)
    dists = np.linalg.norm(flat[:, None, :] - pal[None, :, :], axis=2)
    nearest = np.argmin(dists, axis=1)
    out = pal[nearest].reshape(h, w, 3)
    return np.uint8(out)


# ============================== Cartoon effect ==============================

def cartoonize(frame_bgr: np.ndarray, palette: np.ndarray, saturation: float = 1.8,
               use_halftone: bool = True) -> np.ndarray:
    smooth = cv2.bilateralFilter(frame_bgr, d=9, sigmaColor=75, sigmaSpace=75)
    for _ in range(2):
        smooth = cv2.bilateralFilter(smooth, d=9, sigmaColor=75, sigmaSpace=75)

    quantized = quantize_to_palette(smooth, palette)

    hsv = cv2.cvtColor(quantized, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * saturation, 0, 255)
    hsv[..., 2] = np.clip(hsv[..., 2] * 1.08, 0, 255)
    quantized = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    gray_blur = cv2.medianBlur(gray, 7)
    edges = cv2.adaptiveThreshold(
        gray_blur, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY,
        blockSize=9, C=2
    )
    edges = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
    comic = cv2.bitwise_and(quantized, edges)

    if use_halftone:
        comic = apply_halftone(comic)

    return comic


def apply_halftone(frame_bgr: np.ndarray, dot_spacing: int = 6, strength: float = 0.18) -> np.ndarray:
    h, w = frame_bgr.shape[:2]
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    yy, xx = np.mgrid[0:h, 0:w]
    pattern = (np.sin(xx / dot_spacing * np.pi) * np.sin(yy / dot_spacing * np.pi))
    pattern = (pattern > 0.3).astype(np.float32)
    darkness = 1.0 - (gray.astype(np.float32) / 255.0)
    dot_mask = (pattern * darkness * strength)[..., None]
    out = frame_bgr.astype(np.float32) * (1 - dot_mask)
    return np.clip(out, 0, 255).astype(np.uint8)


# ============================== Image & GIF Processors ==============================

def load_corrections(path: str) -> list:
    if not path:
        return []
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return []


def process_image_or_gif(in_path: str, out_path: str, palette: np.ndarray, use_halftone: bool, saturation: float, corrections: list, target_width: int = 1920):
    if in_path.lower().endswith('.gif'):
        print("🔄 Converting structural GIF timeline into raw processing MP4 container...", flush=True)
        base_dir = os.path.dirname(out_path)
        tmp_mp4 = os.path.join(base_dir, f"tmp_gif_convert_{os.path.basename(in_path)}.mp4")
        
        try:
            gif_convert_cmd = [
                'ffmpeg', '-y',
                '-i', in_path,
                '-movflags', 'faststart',
                '-pix_fmt', 'yuv420p',
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                tmp_mp4
            ]
            subprocess.run(gif_convert_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            
            final_out_path = update_output_path_for_gif(out_path)
            print(f"🚀 Streaming processed rendering matrix directly into target path: {final_out_path}", flush=True)
            process_video(tmp_mp4, final_out_path, palette, use_halftone, saturation, corrections, target_width=target_width)
            
        finally:
            if os.path.exists(tmp_mp4):
                try:
                    os.remove(tmp_mp4)
                except Exception:
                    pass
    else:
        frame_bgr = cv2.imread(in_path)
        mask = detect_skin_mask(frame_bgr)
        mask = apply_manual_circles(mask, 0, corrections)
        whitened = whiten_skin(frame_bgr, mask)
        styled = cartoonize(whitened, palette, saturation=saturation, use_halftone=use_halftone)
        
        print("PROGRESS: 50.0%", flush=True)
        cv2.imwrite(out_path, styled)
        print("PROGRESS: 100.0%", flush=True)
        print(f"Done. Wrote styled asset graphic straight to {out_path}")


# ================================ Full video render =================================

def process_video(in_path: str, out_path: str, palette: np.ndarray, use_halftone: bool,
                   saturation: float, corrections: list, target_width: int = 1920, show_progress: bool = True):
    cap = cv2.VideoCapture(in_path)
    if not cap.isOpened():
        raise IOError(f"Could not open input video source file tracking targets: {in_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    orig_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    if orig_width > target_width:
        scale = target_width / orig_width
        out_width = int(orig_width * scale)
        out_height = int(orig_height * scale)
        out_width = (out_width // 2) * 2
        out_height = (out_height // 2) * 2
    else:
        out_width, out_height = orig_width, orig_height

    ffmpeg_cmd = [
        'ffmpeg', '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-pix_fmt', 'bgr24',
        '-s', f'{out_width}x{out_height}',
        '-r', str(fps),
        '-i', '-',
        '-vcodec', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'medium',
        '-crf', '22',
        '-tune', 'animation',
        out_path
    ]

    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

    frame_idx = 0
    prev_mask = None
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if orig_width > target_width:
            frame = cv2.resize(frame, (out_width, out_height), interpolation=cv2.INTER_AREA)

        mask = detect_skin_mask(frame)
        mask = apply_manual_circles(mask, frame_idx, corrections)
        mask = smooth_mask_temporal(mask, prev_mask)
        prev_mask = mask

        whitened = whiten_skin(frame, mask)
        styled = cartoonize(whitened, palette, saturation=saturation, use_halftone=use_halftone)

        proc.stdin.write(styled.tobytes())

        frame_idx += 1
        if show_progress and total_frames > 0 and frame_idx % 15 == 0:
            pct = 100.0 * frame_idx / total_frames
            print(f"PROGRESS: {pct:.1f}%", flush=True)

    cap.release()
    proc.stdin.close()
    proc.wait()
    print(f"Done. Wrote {frame_idx} video processing frames directly to {out_path}")


def main():
    parser = argparse.ArgumentParser(description="Whiten skin + comic-cartoon stylize an asset.")
    parser.add_argument("input", nargs="?", default=None, help="Path to input video/image file")
    parser.add_argument("output", nargs="?", default=None, help="Path to output file")
    parser.add_argument("--no-halftone", action="store_true", help="Disable halftone dot overlay")
    parser.add_argument("--saturation", type=float, default=1.8, help="Saturation multiplier")
    parser.add_argument("--corrections", type=str, default=None, help="Path to manual circles JSON")
    parser.add_argument("--target-width", type=int, default=1920, help="Max resolution scale ceiling")
    args = parser.parse_args()

    if not args.input or not args.output:
        print("Error: Missing required parameters [input] and [output].", file=sys.stderr)
        sys.exit(2)

    corrections = load_corrections(args.corrections)
    
    ext = args.input.lower()
    is_img = ext.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp'))

    print("Building stable color palette...", flush=True)
    palette = compute_global_palette(args.input, is_img=is_img, num_colors=8)

    if is_img:
        process_image_or_gif(args.input, args.output, palette, not args.no_halftone, args.saturation, corrections, target_width=args.target_width)
    else:
        process_video(args.input, args.output, palette, not args.no_halftone, args.saturation, corrections, target_width=args.target_width)

if __name__ == "__main__":
    main()