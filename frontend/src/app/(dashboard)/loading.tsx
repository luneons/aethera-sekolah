export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6 space-y-4 animate-pulse">
      {/* Page title skeleton */}
      <div className="h-7 w-48 rounded-lg bg-surface-overlay" />
      <div className="h-4 w-72 rounded-md bg-surface-overlay" />

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-surface-border bg-surface-raised p-4 space-y-3">
            <div className="h-3 w-16 rounded bg-surface-overlay" />
            <div className="h-8 w-12 rounded bg-surface-overlay" />
            <div className="h-2 w-20 rounded bg-surface-overlay" />
          </div>
        ))}
      </div>

      {/* Content area skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
        <div className="rounded-xl border border-surface-border bg-surface-raised p-4 h-48" />
        <div className="rounded-xl border border-surface-border bg-surface-raised p-4 h-48" />
      </div>
    </div>
  );
}
