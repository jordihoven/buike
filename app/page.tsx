"use client";

import { useEffect, useState } from "react";

interface RainDataPoint {
  time: string;
  mmh: number;
}

const FALLBACK_LAT = 52.3676;
const FALLBACK_LON = 4.9041;

function parseRainText(text: string): RainDataPoint[] {
  return text
    .trim()
    .split("\n")
    .map((line) => {
      const [rawIntensity, time] = line.split("|");
      const intensity = parseInt(rawIntensity, 10);
      const mmh = intensity === 0 ? 0 : Math.pow(10, (intensity - 109) / 32);
      return { time: time?.trim() ?? "", mmh };
    })
    .filter((d) => d.time);
}

function intensityColor(mmh: number): string {
  if (mmh < 0.1) return "#22c55e";
  if (mmh < 1) return "#eab308";
  if (mmh < 5) return "#f97316";
  return "#ef4444";
}

function maxIntensityLabel(max: number): string {
  if (max < 0.1) return "No rain expected";
  if (max < 1) return "Light rain";
  if (max < 5) return "Moderate rain";
  return "Heavy rain";
}

function RainChart({ data }: { data: RainDataPoint[] }) {
  if (data.length === 0) return null;

  const peakMmh = Math.max(...data.map((d) => d.mmh));
  const maxMmh = Math.max(peakMmh, 0.5);
  const peakColor = intensityColor(peakMmh);
  const w = 600;
  const h = 200;
  const pad = { top: 16, bottom: 32, left: 16 };
  const chartW = w - pad.left * 2;
  const chartH = h - pad.top - pad.bottom;

  const points = data.map((d, i) => ({
    x: pad.left + (i / (data.length - 1)) * chartW,
    y: pad.top + chartH - (d.mmh / maxMmh) * chartH,
  }));

  const baseline = pad.top + chartH;
  const areaPath =
    `M${points[0].x},${baseline}` +
    points.map((p) => `L${p.x},${p.y}`).join("") +
    `L${points[points.length - 1].x},${baseline}Z`;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
    .join("");

  const tickIndices = [
    0,
    Math.floor(data.length / 4),
    Math.floor(data.length / 2),
    Math.floor((data.length * 3) / 4),
    data.length - 1,
  ];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-sm font-semibold text-muted">
          {maxIntensityLabel(peakMmh)}
        </span>
        {peakMmh >= 0.1 && (
          <span className="text-sm font-semibold" style={{ color: peakColor }}>
            {peakMmh.toFixed(1)} mm/h peak
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        <line
          x1={pad.left}
          y1={baseline}
          x2={pad.left + chartW}
          y2={baseline}
          stroke="#2a2a2a"
          strokeWidth="1"
        />
        <path d={areaPath} fill="#0090FF" fillOpacity="0.15" />
        <path
          d={linePath}
          fill="none"
          stroke="#0090FF"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {tickIndices.map((idx) => {
          const p = points[idx];
          return (
            <text
              key={idx}
              x={p.x}
              y={baseline + 20}
              textAnchor="middle"
              fill="#888"
              fontSize="12"
              fontFamily="var(--font-geist-sans), sans-serif"
            >
              {data[idx].time}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<RainDataPoint[]>([]);
  const [location, setLocation] = useState<string>("Locating…");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRain(lat: number, lon: number) {
      const res = await fetch(`/api/rain?lat=${lat}&lon=${lon}`);
      const text = await res.text();
      setData(parseRainText(text));
      setLoading(false);
    }

    async function reverseGeocode(lat: number, lon: number) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
        );
        const json = await res.json();
        const city =
          json.address?.city ||
          json.address?.town ||
          json.address?.village ||
          json.address?.municipality ||
          "Unknown location";
        setLocation(city);
      } catch {
        setLocation("Unknown location");
      }
    }

    function load(lat: number, lon: number) {
      fetchRain(lat, lon);
      reverseGeocode(lat, lon);
    }

    if (!navigator.geolocation) {
      queueMicrotask(() => setError("Geolocation not supported"));
      load(FALLBACK_LAT, FALLBACK_LON);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => load(pos.coords.latitude, pos.coords.longitude),
      () => {
        setError("Location denied, showing Amsterdam");
        load(FALLBACK_LAT, FALLBACK_LON);
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  }, []);

  return (
    <div className="flex flex-col flex-1 items-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <p className="text-muted text-sm mt-1">{location}</p>
          {error && <p className="text-yellow-500 text-xs mt-1">{error}</p>}
        </div>

        <div className="rounded-2xl bg-card border border-card-border p-4">
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-muted border-t-foreground rounded-full animate-spin" />
            </div>
          ) : (
            <RainChart data={data} />
          )}
        </div>
      </div>
    </div>
  );
}
