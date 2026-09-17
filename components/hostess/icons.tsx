/** Small hand-drawn line icons for the hostess panel - kept inline (no icon
 * library in this project) and consistent with the thin, 1.5px-stroke look
 * used across the dashboard's charts and marks. */

type IconProps = { className?: string };

const BASE = "1.5" as const;

export function DashboardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={BASE} className={className}>
      <rect x="3.5" y="3.5" width="7" height="9" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={BASE} className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17" strokeLinecap="round" />
      <path d="M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}

export function HallIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={BASE} className={className}>
      <path d="M4 10 12 3.5 20 10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9v11h13V9" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

export function StaffIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={BASE} className={className}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20c0-3.4 2.7-6 6-6s6 2.6 6 6" strokeLinecap="round" />
      <path d="M15.5 5.5c1.6.3 2.75 1.7 2.75 3.4 0 1.6-1 2.9-2.4 3.3" strokeLinecap="round" />
      <path d="M14.5 14c2.9.4 5 2.9 5 6" strokeLinecap="round" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={BASE} className={className}>
      <path
        d="M6 10.5a6 6 0 1 1 12 0c0 3.4 1 5 1.8 6H4.2c.8-1 1.8-2.6 1.8-6Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 19.5a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}

export function TrendUpIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={BASE} className={className}>
      <path d="M4 16 10 10l4 4 6.5-6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 7.5h5v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrendDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={BASE} className={className}>
      <path d="M4 8 10 14l4-4 6.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 16.5h5v-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TableIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={BASE} className={className}>
      <rect x="3.5" y="7" width="17" height="4" rx="1.5" />
      <path d="M6 11v9M18 11v9" strokeLinecap="round" />
    </svg>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={BASE} className={className}>
      <circle cx="8.5" cy="8" r="3" />
      <path d="M2.5 19.5c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
      <circle cx="17" cy="8.5" r="2.25" />
      <path d="M15.5 12.3c2.4.5 4 2.6 4 5.2" strokeLinecap="round" />
    </svg>
  );
}
