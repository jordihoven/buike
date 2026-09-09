"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, CloudRain } from "lucide-react";
import { Area, AreaChart, XAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";

interface RainDataPoint {
  time: string;
  mmh: number;
}

const FALLBACK_LAT = 52.3676;
const FALLBACK_LON = 4.9041;

const chartConfig = {
  mmh: { label: "mm/h", color: "var(--chart-1)" },
} satisfies ChartConfig;

function parseRainText(text: string): RainDataPoint[] {
  return text
    .trim()
    .split("\n")
    .map((line) => {
      const [rawIntensity, time] = line.split("|");
      const intensity = parseInt(rawIntensity, 10);
      const mmh = intensity === 0 ? 0 : Math.pow(10, (intensity - 109) / 32);
      return { time: time?.trim() ?? "", mmh: Math.round(mmh * 100) / 100 };
    })
    .filter((d) => d.time);
}

function intensityColor(mmh: number): string {
  if (mmh < 0.1) return "#22c55e";
  if (mmh < 1) return "#eab308";
  if (mmh < 5) return "#f97316";
  return "#ef4444";
}

function rainSummary(data: RainDataPoint[]): string {
  if (data.length === 0) return "";

  const isRaining = data[0].mmh >= 0.1;
  const intervalMin =
    data.length >= 2 ? timeDiffMin(data[0].time, data[1].time) : 5;

  if (isRaining) {
    const stopsIdx = data.findIndex((d) => d.mmh < 0.1);
    if (stopsIdx === -1) return "Rain for the next 2 hours";
    return `Rain stops in ${stopsIdx * intervalMin} min`;
  }

  const startsIdx = data.findIndex((d) => d.mmh >= 0.1);
  if (startsIdx === -1) return "Dry for the next 2 hours";
  return `Rain starts in ${startsIdx * intervalMin} min`;
}

function timeDiffMin(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am) || 5;
}

function RainChart({ data }: { data: RainDataPoint[] }) {
  if (data.length === 0) return null;

  const tickInterval = Math.max(1, Math.floor(data.length / 5));

  return (
    <div className="w-full">
      <ChartContainer config={chartConfig} className="h-48 w-full">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
        >
          <defs>
            <linearGradient id="rainFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
              <stop
                offset="100%"
                stopColor="var(--chart-1)"
                stopOpacity={0.05}
              />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tickLine={false}
            axisLine={false}
            interval={tickInterval}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          />
          <ChartTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as RainDataPoint;
              return (
                <div className="rounded-lg border bg-background px-3 py-1.5 text-sm shadow-md">
                  <p className="font-medium">{d.time}</p>
                  <p className="text-muted-foreground">
                    {d.mmh.toFixed(2)} mm/h
                  </p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="mmh"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#rainFill)"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pulling, setPulling] = useState(false);
  const [pullY, setPullY] = useState(0);
  const startY = useRef(0);
  const refreshing = useRef(false);
  const threshold = 80;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) startY.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (refreshing.current || window.scrollY > 0) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) {
      setPulling(true);
      setPullY(Math.min(dy * 0.4, 120));
    }
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (!pulling) return;
    if (pullY >= threshold && !refreshing.current) {
      refreshing.current = true;
      setPullY(threshold * 0.4);
      await onRefresh();
      refreshing.current = false;
    }
    setPulling(false);
    setPullY(0);
  }, [pulling, pullY, onRefresh]);

  return { pullY, pulling, onTouchStart, onTouchMove, onTouchEnd };
}

export default function Home() {
  const [data, setData] = useState<RainDataPoint[]>([]);
  const [location, setLocation] = useState<string>("Locating…");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const coords = useRef<{ lat: number; lon: number } | null>(null);
  const [radarKey, setRadarKey] = useState(0);

  const fetchRain = useCallback(async (lat: number, lon: number) => {
    const res = await fetch(`/api/rain?lat=${lat}&lon=${lon}`);
    const text = await res.text();
    setData(parseRainText(text));
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const c = coords.current;
    if (!c) return;
    setRefreshing(true);
    await fetchRain(c.lat, c.lon);
    setRadarKey((k) => k + 1);
    setRefreshing(false);
  }, [fetchRain]);

  const pull = usePullToRefresh(refresh);

  useEffect(() => {
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
      coords.current = { lat, lon };
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
  }, [fetchRain]);

  return (
    <div
      className="flex flex-col flex-1 items-center bg-background px-4 py-8"
      onTouchStart={pull.onTouchStart}
      onTouchMove={pull.onTouchMove}
      onTouchEnd={pull.onTouchEnd}
    >
      <div
        className="w-full max-w-md"
        style={{
          transform: `translateY(${pull.pullY}px)`,
          transition: pull.pulling ? "none" : "transform 0.3s ease",
        }}
      >
        {(pull.pullY > 0 || refreshing) && (
          <div className="flex justify-center -mt-8 mb-2">
            <div
              className={`w-5 h-5 border-2 border-muted border-t-foreground rounded-full ${refreshing ? "animate-spin" : ""}`}
              style={
                refreshing
                  ? undefined
                  : { transform: `rotate(${pull.pullY * 3}deg)` }
              }
            />
          </div>
        )}

        <div className="w-fit mx-auto mb-5 text-center">
          <p className="font-medium" style={{ fontSize: "1.3rem" }}>
            {location}
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-0.5">
            {!loading &&
              (data.some((d) => d.mmh >= 0.1) ? (
                <CloudRain
                  size={16}
                  style={{ color: intensityColor(data[0]?.mmh ?? 0) }}
                />
              ) : (
                <Cloud size={16} className="text-muted-foreground" />
              ))}
            <p
              className="text-sm"
              style={{
                color: loading ? "#888" : intensityColor(data[0]?.mmh ?? 0),
              }}
            >
              {loading ? "Loading…" : rainSummary(data)}
            </p>
          </div>
          {error && <p className="text-yellow-500 text-xs mt-2">{error}</p>}
        </div>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Graph</CardTitle>
            {!loading && Math.max(...data.map((d) => d.mmh)) >= 0.1 && (
              <CardDescription>
                {Math.max(...data.map((d) => d.mmh)).toFixed(1)} mm/h peak
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-muted border-t-foreground rounded-full animate-spin" />
              </div>
            ) : (
              <RainChart data={data} />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Radar</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <img
              src={`https://image.buienradar.nl/2.0/image/animation/RadarMapRainNL?w=550&h=512&_=${radarKey}`}
              alt="Rain radar Netherlands"
              className="w-full h-auto"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
