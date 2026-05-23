"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ChartDataPoint {
  date: string;
  leads: number;
  events: number;
  [key: string]: unknown;
}

function AreaTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass relative z-50 rounded-xl px-4 py-3 text-xs shadow-xl">
      <p className="mb-2 font-semibold text-white">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: "var(--color-fg-2)" }}>
            {p.name === "leads" ? "Leads" : "Agendamentos"}:
          </span>
          <span className="font-mono font-semibold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function RevenueChart({ data }: { data: ChartDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradEvents" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#14B8A6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="rgba(255,255,255,0.05)"
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "var(--color-fg-3)" }}
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          interval="preserveStartEnd"
          minTickGap={20}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--color-fg-3)" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          content={<AreaTooltip />}
          cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 2 }}
        />
        <Area
          type="monotone"
          dataKey="leads"
          stroke="#3B82F6"
          strokeWidth={2}
          fill="url(#gradLeads)"
          dot={false}
          activeDot={{ r: 4, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }}
        />
        <Area
          type="monotone"
          dataKey="events"
          stroke="#14B8A6"
          strokeWidth={2}
          fill="url(#gradEvents)"
          dot={false}
          activeDot={{ r: 4, fill: "#14B8A6", stroke: "#fff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
