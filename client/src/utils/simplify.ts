export function simplify(points: [number, number][], tolerance = 0.004): [number, number][] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  const [start, end] = [points[0], points[points.length - 1]];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplify(points.slice(0, index + 1), tolerance);
    const right = simplify(points.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [start, end];
}

function perpendicularDistance(p: [number, number], a: [number, number], b: [number, number]) {
  const [x, y] = p;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const num = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1);
  const den = Math.hypot(y2 - y1, x2 - x1) || 1;
  return num / den;
}
