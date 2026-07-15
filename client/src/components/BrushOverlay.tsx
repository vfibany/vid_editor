import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { simplify } from '../utils/simplify';

type BrushOverlayProps = {
  videoWidth: number;
  videoHeight: number;
  onShapeComplete: (points: [number, number][]) => void;
};

export function BrushOverlay({ videoWidth, videoHeight, onShapeComplete }: BrushOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rawPoints = useRef<[number, number][]>([]);
  const completedPoints = useRef<[number, number][]>([]);
  const [drawing, setDrawing] = useState(false);

  const getContentRect = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const fitScale = Math.min(rect.width / videoWidth, rect.height / videoHeight);
    const contentWidth = videoWidth * fitScale;
    const contentHeight = videoHeight * fitScale;
    const offsetX = (rect.width - contentWidth) / 2;
    const offsetY = (rect.height - contentHeight) / 2;

    return {
      rect,
      contentWidth,
      contentHeight,
      offsetX,
      offsetY,
    };
  };

  const toNormalized = (clientX: number, clientY: number): [number, number] | null => {
    const content = getContentRect();
    if (!content) return [0, 0] as [number, number];

    const localX = clientX - content.rect.left - content.offsetX;
    const localY = clientY - content.rect.top - content.offsetY;

    if (localX < 0 || localY < 0 || localX > content.contentWidth || localY > content.contentHeight) {
      return null;
    }

    const x = localX / content.contentWidth;
    const y = localY / content.contentHeight;

    return [
      Math.min(1, Math.max(0, x)),
      Math.min(1, Math.max(0, y)),
    ] as [number, number];
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const content = getContentRect();
    if (!content) return;

    if (content.offsetX > 0 || content.offsetY > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(content.offsetX, content.offsetY, content.contentWidth, content.contentHeight);
    }

    const drawPoints = rawPoints.current.length > 1 ? rawPoints.current : completedPoints.current;
    if (drawPoints.length < 2) return;

    ctx.beginPath();
    drawPoints.forEach(([x, y], i) => {
      const px = content.offsetX + x * content.contentWidth;
      const py = content.offsetY + y * content.contentHeight;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    if (drawPoints.length >= 3) {
      const [firstX, firstY] = drawPoints[0];
      ctx.lineTo(content.offsetX + firstX * content.contentWidth, content.offsetY + firstY * content.contentHeight);
    }

    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    if (completedPoints.current.length >= 3 && drawPoints === completedPoints.current) {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
      ctx.fill();
    }

    if (drawing && drawPoints.length >= 3) {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.05)';
      ctx.fill();
    }
  };

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawing(true);
    completedPoints.current = [];
    const point = toNormalized(e.clientX, e.clientY);
    rawPoints.current = point ? [point] : [];
    redraw();
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const point = toNormalized(e.clientX, e.clientY);
    if (!point) return;
    rawPoints.current.push(point);
    redraw();
  };

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDrawing(false);

    const clean = simplify(rawPoints.current);
    const normalized = clean.length >= 3 ? clean : rawPoints.current;
    if (normalized.length >= 3) {
      completedPoints.current = normalized;
      onShapeComplete(normalized.map(([x, y]) => [x * 100, y * 100] as [number, number]));
    }

    rawPoints.current = [];
    redraw();
  };

  return (
    <canvas
      ref={canvasRef}
      width={videoWidth}
      height={videoHeight}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    />
  );
}
