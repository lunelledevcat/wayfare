import { Skeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6" aria-busy="true">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="mt-4 h-9 w-2/3" />
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <Skeleton className="mt-4 h-28 w-full" />
      <div className="mt-4 grid gap-5 lg:grid-cols-[280px_1fr]">
        <Skeleton className="hidden h-96 lg:block" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
