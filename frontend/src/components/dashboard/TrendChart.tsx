'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api, { type Envelope } from '@/lib/api';

interface TrendPoint {
  date: string;
  present: number;
  late: number;
  absent: number;
}

export function TrendChart() {
  const { data } = useQuery({
    queryKey: ['attendance-trend'],
    queryFn: async () => {
      const r = await api.get<Envelope<TrendPoint[]>>('/reports/trend?days=7');
      return r.data.data ?? [];
    },
  });

  const chartData = (data ?? []).map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }),
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="present" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00e676" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#00e676" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="late" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffc107" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#ffc107" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="absent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff1744" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#ff1744" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a3045" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#4a6b82"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            fontFamily="JetBrains Mono"
          />
          <YAxis
            stroke="#4a6b82"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            fontFamily="JetBrains Mono"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0a1520',
              border: '1px solid #1a3045',
              borderRadius: 8,
              color: '#e8f4f8',
            }}
            labelStyle={{ color: '#8baebe', fontFamily: 'JetBrains Mono' }}
          />
          <Area
            type="monotone"
            dataKey="present"
            name="Hadir"
            stroke="#00e676"
            strokeWidth={2}
            fill="url(#present)"
          />
          <Area
            type="monotone"
            dataKey="late"
            name="Terlambat"
            stroke="#ffc107"
            strokeWidth={2}
            fill="url(#late)"
          />
          <Area
            type="monotone"
            dataKey="absent"
            name="Absen"
            stroke="#ff1744"
            strokeWidth={2}
            fill="url(#absent)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
