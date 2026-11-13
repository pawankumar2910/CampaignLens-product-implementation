/** Shown while a workspace page loads its data on the server. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-5">
      <span className="sr-only">Loading…</span>
      <div className="h-9 w-64 rounded-[6px] bg-sunken" />
      <div className="h-20 rounded-[10px] bg-sunken" />
      <div className="h-28 rounded-[10px] bg-sunken" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="h-72 rounded-[10px] bg-sunken" />
        <div className="h-72 rounded-[10px] bg-sunken" />
      </div>
    </div>
  );
}
