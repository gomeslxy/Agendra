"use client";

import { cn } from "@/lib/utils";
import { type SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

/**
 * Agendra Branded Icons
 * Premium, custom SVGs that follow the "High-Contrast Minimal Slate" and brand aesthetic.
 */

export function IconInbox({ size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
      {...props}
    >
      <path
        d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="1.5" fill="var(--color-brand-teal-400)" />
      <path
        d="M16 10H16.01"
        stroke="var(--color-brand-teal-400)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 10H8.01"
        stroke="var(--color-brand-teal-400)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconAgenda({ size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
      {...props}
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M16 2V6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 2V6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 10H21" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16" cy="16" r="2.5" fill="var(--color-brand-orange-500)" className="animate-pulse" />
    </svg>
  );
}

export function IconLeads({ size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
      {...props}
    >
      <path
        d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="8.5"
        cy="7"
        r="4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23 21V19C22.9993 18.1137 22.7044 17.2524 22.1614 16.5523C21.6184 15.8522 20.8581 15.3516 20 15.13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <path
        d="M17 11C17.9 11 18.7 10.6 19.3 10C19.9 9.4 20.2 8.6 20.2 7.7C20.2 6.8 19.9 6 19.3 5.4C18.7 4.8 17.9 4.4 17 4.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <circle cx="18" cy="16" r="3" fill="var(--color-brand-blue-500)" fillOpacity="0.4" />
    </svg>
  );
}

export function IconReports({ size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
      {...props}
    >
      <path
        d="M18 20V10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 20V4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 20V14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 20H21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M4 12L9 7L14 10L20 4"
        stroke="var(--color-brand-teal-400)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSettings({ size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
    </svg>
  );
}

export function IconPersona({ size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
      {...props}
    >
      <rect x="3" y="11" width="18" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="5" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V9C8 7.89543 8.89543 7 10 7H14C15.1046 7 16 7.89543 16 9V11" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 14V18" stroke="var(--color-brand-teal-400)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 16H14" stroke="var(--color-brand-teal-400)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconFlows({ size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
      {...props}
    >
      <path d="M6 3V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 13V21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="6" cy="15" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="9" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 15H14C15.1046 15 16 14.1046 16 13V11C16 9.89543 15.1046 9 14 9H10" stroke="var(--color-brand-teal-400)" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export function IconChannels({ size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
      {...props}
    >
      <path d="M18 10L21 7L18 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 7H21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 14L3 17L6 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 17H21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" fill="var(--color-brand-blue-500)" fillOpacity="0.2" />
    </svg>
  );
}

export function IconTeam({ size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
      {...props}
    >
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M18 21V19C18 17.3431 16.6569 16 15 16H9C7.34315 16 6 17.3431 6 19V21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 16V21" stroke="var(--color-brand-teal-400)" strokeWidth="1.8" opacity="0.6" />
    </svg>
  );
}

export function IconLogout({ size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
      {...props}
    >
      <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17L21 12L16 7" stroke="var(--color-brand-teal-400)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12H9" stroke="var(--color-brand-teal-400)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBell({ size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
      {...props}
    >
      <path
        d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.73 21a2 2 0 0 1-3.46 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
    </svg>
  );
}

export function IconZap({ size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-current", className)}
      {...props}
    >
      <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="var(--color-brand-orange-500)" stroke="var(--color-brand-orange-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
