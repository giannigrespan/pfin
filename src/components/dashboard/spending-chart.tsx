'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface ChartData {
  name: string
  icon: string
  color: string
  value: number
}

interface SpendingChartProps {
  data: ChartData[]
}

const renderCustomLabel = ({
  cx, cy, midAngle, innerRadius, outerRadius, percent, name,
}: any) => {
  if (percent < 0.06) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

export function SpendingChart({ data }: SpendingChartProps) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={65}
          outerRadius={100}
          dataKey="value"
          nameKey="name"
          labelLine={false}
          label={renderCustomLabel}
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} stroke="white" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number | undefined, name: string | undefined) => [
            value != null ? `€${value.toFixed(2)}` : '—',
            name ?? '',
          ]}
          contentStyle={{ borderRadius: '8px', fontSize: '13px' }}
        />
        <Legend
          formatter={(value, entry) => {
            const item = data.find(d => d.name === value)
            return `${item?.icon ?? ''} ${value}`
          }}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '12px' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
