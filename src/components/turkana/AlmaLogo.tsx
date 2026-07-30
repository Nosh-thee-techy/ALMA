/** ALMA mark — river-wave “A” for ops chrome and auth screens. */
export function AlmaLogo({
  className = "h-10 w-10",
  title = "ALMA",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <img
      src="/alma-logo.png"
      alt={title}
      className={className}
      width={40}
      height={40}
      decoding="async"
    />
  );
}

/** Inline SVG fallback if PNG fails to load in constrained environments. */
export function AlmaMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="64" height="64" rx="12" fill="#1a6b7a" />
      <path
        d="M18 44 L32 16 L46 44"
        stroke="#f3ebe0"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 36c4 4 8 4 12 0s8-4 12 0"
        stroke="#c4a574"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M22 42c4 4 8 4 12 0s8-4 12 0"
        stroke="#e8dcc8"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
