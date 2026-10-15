export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--wf-primary)" />
        <path d="M7 10.5 11.2 22l3.3-8.2L17.8 22 22 10.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="25" cy="10.5" r="2.2" fill="#7CF0B0" />
      </svg>
      <span className="text-xl font-extrabold tracking-tight text-fg">Wayfare</span>
    </span>
  );
}
