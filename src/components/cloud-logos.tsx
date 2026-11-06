// Small brand marks for the Microsoft 365 places a demo file can live, drawn inline so nothing is loaded from outside.

export function SharePointLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="SharePoint" role="img">
      <circle cx="18" cy="11" r="9" fill="#036C70" />
      <circle cx="23" cy="19.5" r="7.5" fill="#1A9BA1" />
      <circle cx="18" cy="26" r="5.5" fill="#37C6D0" />
      <rect x="2" y="8" width="16" height="16" rx="2" fill="#03787C" />
      <text x="10" y="20.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" fontFamily="Segoe UI, Arial, sans-serif">S</text>
    </svg>
  );
}

export function OneDriveLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="OneDrive" role="img">
      <path d="M13.2 10.4a8 8 0 0 1 13.5 3.2 6 6 0 0 1 3.3 5.6H11.6l1.6-8.8Z" fill="#0364B8" />
      <path d="M10.6 11.6a7 7 0 0 1 6.9 2.6l-2.2 9.8H5.4A4.8 4.8 0 0 1 6 14.6a7 7 0 0 1 4.6-3Z" fill="#0078D4" />
      <path d="M17.5 14.2a6 6 0 0 1 8.9-.6 5.5 5.5 0 0 1 4.6 7.4 3.2 3.2 0 0 1-3 2.2H12.6l4.9-9Z" fill="#1490DF" />
      <path d="M5.4 24h22.6a3.2 3.2 0 0 0 3-2.2l-13-7.6-12.6 9.8Z" fill="#28A8EA" />
    </svg>
  );
}

export function TeamsLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="Microsoft Teams" role="img">
      <circle cx="24" cy="8" r="3.5" fill="#5059C9" />
      <rect x="19" y="13" width="11" height="12" rx="3" fill="#5059C9" />
      <circle cx="16" cy="7" r="4.5" fill="#7B83EB" />
      <rect x="9" y="12" width="14" height="16" rx="3" fill="#7B83EB" />
      <rect x="2" y="9" width="16" height="16" rx="2" fill="#4B53BC" />
      <text x="10" y="21.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" fontFamily="Segoe UI, Arial, sans-serif">T</text>
    </svg>
  );
}
