"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const AccordionContext = React.createContext<{
  openItem: string | null;
  setOpenItem: (value: string | null) => void;
}>({ openItem: null, setOpenItem: () => {} });

export const Accordion = ({ children, className, type = "single", collapsible = true }: any) => {
  const [openItem, setOpenItem] = React.useState<string | null>(null);
  return (
    <AccordionContext.Provider value={{ openItem, setOpenItem }}>
      <div className={cn("space-y-1", className)}>{children}</div>
    </AccordionContext.Provider>
  );
};

export const AccordionItem = ({ children, className, value }: any) => {
  return (
    <div className={cn("border-b border-[#E4E4E7]", className)}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child as any, { value }) : child
      )}
    </div>
  );
};

export const AccordionTrigger = ({ children, className, value }: any) => {
  const { openItem, setOpenItem } = React.useContext(AccordionContext);
  const isOpen = openItem === value;
  return (
    <button
      onClick={() => setOpenItem(isOpen ? null : value)}
      className={cn(
        "flex w-full items-center justify-between py-5 text-left transition-all hover:text-brand-blue-400 font-medium",
        className
      )}
    >
      {children}
      <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
    </button>
  );
};

export const AccordionContent = ({ children, className, value }: any) => {
  const { openItem } = React.useContext(AccordionContext);
  const isOpen = openItem === value;
  if (!isOpen) return null;
  return (
    <div className={cn("overflow-hidden text-sm transition-all pb-5", className)}>
      {children}
    </div>
  );
};

