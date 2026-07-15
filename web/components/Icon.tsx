export type IconName =
  | "book" | "chat" | "grid" | "layers" | "clock" | "chart"
  | "list" | "bars" | "zap" | "refresh" | "calendar" | "target" | "flag"
  | "flame" | "sparkle" | "chevronDown" | "graduate" | "brain" | "shuffle";

const PATHS: Record<IconName, React.ReactNode> = {
  book: <path d="M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 1-2-2Z M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />,
  chat: <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2Z" />,
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  layers: <path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17l9 5 9-5" />,
  clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 3" />,
  chart: <path d="M4 20V10M11 20V4M18 20v-7" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  bars: <path d="M5 20V10M12 20V4M19 20v-7" />,
  zap: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
  refresh: <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 12a9 9 0 0 1-15 6.7L3 16M21 3v5h-5M3 21v-5h5" />,
  calendar: <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2ZM3 9h18M8 3v3M16 3v3" />,
  target: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h.01" />,
  flag: <path d="M5 3v18M5 4h11l-2 4 2 4H5" />,
  flame: <path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c1 1 2 2.5 2 4.5A5 5 0 0 1 7 14c0-5 5-6 5-12Z" />,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  graduate: <path d="m2 9 10-5 10 5-10 5-10-5ZM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6" />,
  brain: <path d="M8 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 18a3 3 0 0 0 5-2V6a3 3 0 0 0-4-1ZM16 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 17 18a3 3 0 0 1-5-2V6a3 3 0 0 1 4-1Z" />,
  shuffle: <path d="M17 3h4v4M21 3l-7 7M3 21l6-6M3 8l4-4h4M3 8l7 7M14 16l3 3 4-4" />,
};

export default function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
