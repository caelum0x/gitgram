'use client';

export default function AnalyticsChart({ data }: { data: any[] }) {
  const maxValue = Math.max(...data.map(d => d.views));

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
      <h3 className="font-bold mb-4">Views Over Time</h3>
      <div className="flex items-end gap-2 h-48">
        {data.map((day, i) => (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div
              className="w-full bg-blue-500 rounded-t"
              style={{ height: `${(day.views / maxValue) * 100}%` }}
              title={`${day.views} views`}
            />
            <div className="text-xs text-gray-500 mt-2">
              {new Date(day.date).getDate()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
