#!/usr/bin/env python3

import argparse
import json
import os
import subprocess
import sys

import cv2
import numpy as np


def clamp_point(point):
    x, y = point
    return [min(1.0, max(0.0, float(x))), min(1.0, max(0.0, float(y)))]


def parse_args():
    parser = argparse.ArgumentParser(description='Apply a polygon blur to a video range.')
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--width', type=int, required=True)
    parser.add_argument('--height', type=int, required=True)
    parser.add_argument('--fps', type=float, required=True)
    parser.add_argument('--start-ms', type=float, required=True)
    parser.add_argument('--end-ms', type=float, required=True)
    parser.add_argument('--blur-px', type=float, default=18)
    parser.add_argument('--points', required=True)
    return parser.parse_args()


def build_mask(frame_w, frame_h, points):
    pts = np.array([[int(round(x * frame_w)), int(round(y * frame_h))] for x, y in points], dtype=np.int32)
    mask = np.zeros((frame_h, frame_w), dtype=np.uint8)
    cv2.fillPoly(mask, [pts], 255)
    return mask


def main():
    args = parse_args()
    points = [clamp_point(p) for p in json.loads(args.points)]
    if len(points) < 3:
        print('Need 3+ points', file=sys.stderr)
        return 2

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
      print(f'Could not open {args.input}', file=sys.stderr)
      return 2

    source_fps = cap.get(cv2.CAP_PROP_FPS) or args.fps or 30
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or args.width
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or args.height

    start_frame = max(0, int(round((args.start_ms / 1000.0) * source_fps)))
    end_frame = max(start_frame, int(round((args.end_ms / 1000.0) * source_fps)))
    total_frames = frame_count if frame_count > 0 else max(end_frame + 1, 1)
    if frame_count > 0:
        end_frame = min(end_frame, max(0, frame_count - 1))

    print('READY', flush=True)

    temp_output = args.output + '.tmp.mov'
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(temp_output, fourcc, source_fps, (width, height))
    if not writer.isOpened():
        print('Could not open output writer', file=sys.stderr)
        cap.release()
        return 2

    mask = build_mask(width, height, points)
    kernel = max(3, int(round(args.blur_px)) * 2 + 1)

    frame_idx = 0
    processed = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame.shape[1] != width or frame.shape[0] != height:
            frame = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)

        if start_frame <= frame_idx <= end_frame:
            blurred = cv2.GaussianBlur(frame, (kernel, kernel), 0)
            frame = np.where(mask[..., None] > 0, blurred, frame)
        writer.write(frame)

        processed += 1
        print(f'FRAME:{processed}/{total_frames}', flush=True)
        if processed % 10 == 0 or processed == total_frames:
            progress = (processed / total_frames) * 100.0
            print(f'PROGRESS:{progress:.1f}%', flush=True)

        frame_idx += 1

    writer.release()
    cap.release()

    print('MUXING', flush=True)

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    ffmpeg_cmd = [
        'ffmpeg', '-y',
        '-i', temp_output,
        '-movflags', 'faststart',
        '-pix_fmt', 'yuv420p',
        '-an',
        args.output,
    ]
    subprocess.run(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    try:
        os.remove(temp_output)
    except OSError:
        pass

    print('DONE', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
