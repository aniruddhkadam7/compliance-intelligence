import { cn } from "@/lib/utils";

// Official EY mark (2019). Letters inherit currentColor so the mark stays legible on dark surfaces.
export function EyLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 68.67 69.32" role="img" aria-label="EY" className={cn("shrink-0", className)}>
      <path
        d="M11.09 61.4h17.37v7.92H.67V34.9h19.7l4.61 7.92H11.1v5.68h12.56v7.22H11.1zm35.86-26.5l-5.9 11.23-5.88-11.23H23.65l12.13 20.82v13.6h10.4v-13.6L58.31 34.9z"
        fill="currentColor"
        fillRule="evenodd"
      />
      <path d="M68.67 12.81V0L0 24.83z" fill="#ffe600" fillRule="evenodd" />
    </svg>
  );
}
