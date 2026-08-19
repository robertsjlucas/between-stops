import type {
  TransportMode,
} from "@/lib/types";

type TransportIconProps = {
  mode: TransportMode;
  className?: string;
};

export function TransportIcon({
  mode,
  className = "transportIcon",
}: TransportIconProps) {
  if (mode === "cab") {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M5 11 7 6h10l2 5" />
        <path d="M4 11h16v7H4z" />
        <path d="M8 6V4h8v2" />
        <circle cx="7" cy="18" r="1.5" />
        <circle cx="17" cy="18" r="1.5" />
      </svg>
    );
  }

  if (
    mode === "tram" ||
    mode === "train"
  ) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="m8 4 4-2 4 2" />
        <rect
          x="5"
          y="4"
          width="14"
          height="14"
          rx="3"
        />
        <path d="M8 8h8M8 12h8M8 21l2-3M16 18l2 3" />
        <circle cx="9" cy="15" r="1" />
        <circle cx="15" cy="15" r="1" />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="3"
        width="14"
        height="16"
        rx="3"
      />
      <path d="M8 7h8v5H8zM7 15h2M15 15h2M8 22l2-3M16 19l2 3" />
    </svg>
  );
}
