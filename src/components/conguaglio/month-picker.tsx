'use client'
// Client component for month navigation (needs window.location.href)
interface MonthPickerProps {
  value: string
}

export function MonthPicker({ value }: MonthPickerProps) {
  return (
    <input
      type="month"
      defaultValue={value}
      onChange={e => {
        window.location.href = `/conguaglio?month=${e.target.value}`
      }}
      className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  )
}
