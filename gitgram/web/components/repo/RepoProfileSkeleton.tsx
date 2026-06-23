'use client';

export default function RepoProfileSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-6">
      {/* Hero skeleton */}
      <div className="mb-6 overflow-hidden rounded-xl border border-border bg-card">
        <div className="h-32 bg-hover" />
        <div className="px-6 pb-6">
          <div className="-mt-12 mb-4 flex items-end justify-between">
            <div className="h-24 w-24 rounded-xl bg-hover border-4 border-card" />
            <div className="flex gap-3">
              <div className="h-10 w-32 rounded-lg bg-hover" />
              <div className="h-10 w-24 rounded-lg bg-hover" />
            </div>
          </div>
          <div className="mb-2 h-7 w-64 rounded bg-hover" />
          <div className="mb-4 h-4 w-96 rounded bg-hover" />
          {/* Topic badges skeleton */}
          <div className="mb-4 flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 w-16 rounded-full bg-hover" />
            ))}
          </div>
          <div className="flex gap-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 w-20 rounded bg-hover" />
            ))}
          </div>
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 h-10 w-10 rounded-lg bg-hover" />
            <div className="mb-1 h-6 w-16 rounded bg-hover" />
            <div className="h-3 w-20 rounded bg-hover" />
          </div>
        ))}
      </div>

      {/* Checkpoint section skeleton */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-hover" />
          <div className="h-4 w-52 rounded bg-hover" />
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3 rounded-lg border border-border p-3">
              <div className="h-10 w-10 rounded-lg bg-hover flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 rounded bg-hover" />
                <div className="h-3 w-full rounded bg-hover" />
                <div className="flex gap-3">
                  <div className="h-3 w-12 rounded bg-hover" />
                  <div className="h-3 w-12 rounded bg-hover" />
                  <div className="h-3 w-12 rounded bg-hover" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab skeleton */}
      <div className="mb-6 flex gap-1 border-b border-border pb-px">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 w-24 rounded-t bg-hover" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-hover" />
                <div className="flex-1">
                  <div className="mb-1 h-4 w-24 rounded bg-hover" />
                  <div className="h-3 w-16 rounded bg-hover" />
                </div>
              </div>
              <div className="mb-2 h-4 w-full rounded bg-hover" />
              <div className="mb-2 h-4 w-3/4 rounded bg-hover" />
              <div className="h-48 w-full rounded bg-hover" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 h-4 w-32 rounded bg-hover" />
              <div className="h-16 w-full rounded bg-hover" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
