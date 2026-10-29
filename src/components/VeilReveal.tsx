import { useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import { ART } from "./art";

type Shard = {
  points: string;
  dx: number;
  dy: number;
  rot: number;
  delay: number;
};

// A radial fracture: rings of cells around an off-centre impact point.
function fracture(seed: number): { shards: Shard[]; cracks: string[] } {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const cx = 50,
    cy = 48;
  const spokes = 13;
  const radii = [0, 9, 24, 46, 80];
  const angles = Array.from(
    { length: spokes },
    (_, i) => ((i + rand() * 0.6) / spokes) * Math.PI * 2,
  );
  const point = (ring: number, spoke: number) => {
    const a = angles[spoke % spokes];
    const r = radii[ring] * (ring === 0 ? 0 : 0.85 + rand() * 0.3);
    return [cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r];
  };
  const grid = radii.map((_, ring) =>
    angles.map((__, spoke) => point(ring, spoke)),
  );
  const shards: Shard[] = [];
  const cracks: string[] = [];
  for (let ring = 0; ring < radii.length - 1; ring++) {
    for (let k = 0; k < spokes; k++) {
      const a = grid[ring][k],
        b = grid[ring][(k + 1) % spokes],
        c = grid[ring + 1][(k + 1) % spokes],
        d = grid[ring + 1][k];
      const poly = ring === 0 ? [a, c, d] : [a, b, c, d];
      const mx = poly.reduce((t, p) => t + p[0], 0) / poly.length;
      const my = poly.reduce((t, p) => t + p[1], 0) / poly.length;
      const dist = Math.hypot(mx - cx, my - cy) || 1;
      const push = 60 + ring * 28 + rand() * 30;
      shards.push({
        points: poly
          .map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`)
          .join(","),
        dx: ((mx - cx) / dist) * push,
        dy: ((my - cy) / dist) * push + 25,
        rot: (rand() - 0.5) * 110,
        delay: ring * 55 + rand() * 60,
      });
      cracks.push(`M${a[0]} ${a[1]}L${d[0]} ${d[1]}`);
      if (ring > 0) cracks.push(`M${d[0]} ${d[1]}L${c[0]} ${c[1]}`);
    }
  }
  return { shards, cracks };
}

export default function VeilReveal({
  title,
  onDone,
}: {
  title: string;
  onDone: () => void;
}) {
  const { shards, cracks } = useMemo(
    () => fracture(Math.floor(Math.random() * 1e6) + 7),
    [],
  );
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onDone, reduce ? 50 : 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      className="veil-reveal"
      aria-hidden="true"
      onClick={onDone}
      style={{ "--veil": `url(${ART.veil})` } as CSSProperties}
    >
      {shards.map((sh, i) => (
        <span
          key={i}
          className="veil-shard"
          style={
            {
              clipPath: `polygon(${sh.points})`,
              "--dx": `${sh.dx}vw`,
              "--dy": `${sh.dy}vh`,
              "--rot": `${sh.rot}deg`,
              "--delay": `${sh.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
      <svg
        className="veil-cracks"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {cracks.map((d, i) => (
          <path
            key={i}
            d={d}
            style={{
              animationDelay: `${320 + Math.floor(i / 26) * 120 + (i % 26) * 6}ms`,
            }}
          />
        ))}
      </svg>
      <span className="veil-flash" />
      <p className="veil-caption">
        <small>帷幕之后</small>
        {title}
      </p>
    </div>
  );
}
