/** Wordmark with a small medical-cross mark. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="logo-mark" aria-hidden>
        <svg viewBox="0 0 16 16" width="12" height="12">
          <path d="M6 1.5h4v4.5h4.5v4H10v4.5H6V10H1.5V6H6z" fill="currentColor" />
        </svg>
      </span>
      <span>
        Auto<span className="text-brand">COB</span>
      </span>
    </span>
  );
}
