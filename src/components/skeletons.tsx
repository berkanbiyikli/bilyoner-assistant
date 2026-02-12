export function MatchCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-5 w-10 rounded-full bg-muted" />
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-muted" />
          <div className="h-4 w-24 rounded bg-muted" />
        </div>
        <div className="h-3 w-6 bg-muted rounded" />
        <div className="flex items-center gap-3">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-8 w-8 rounded-full bg-muted" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-8 w-20 rounded-lg bg-muted" />
        <div className="h-8 w-24 rounded-lg bg-muted" />
        <div className="h-8 w-20 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse">
          <div className="h-3 w-16 rounded bg-muted mb-2" />
          <div className="h-6 w-20 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
