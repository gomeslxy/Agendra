"use client";

import { useEffect, useState, ReactNode } from "react";

interface SafeClientOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function SafeClientOnly({ children, fallback = null }: SafeClientOnlyProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
