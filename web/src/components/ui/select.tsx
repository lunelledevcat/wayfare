"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  /** plain-text name used by screen readers / typeahead when label is rich */
  text?: string;
  lang?: string;
}

/** Themed select (Radix) — replaces the browser's native <select>. */
export function Select({
  value,
  onValueChange,
  options,
  ariaLabel,
  icon,
  className,
  disabled,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "press inline-flex h-11 w-full items-center gap-2 rounded-xl border border-border bg-card px-3 text-left text-sm font-medium text-fg hover:border-primary/50 hover:bg-subtle disabled:opacity-50 data-[state=open]:border-primary",
          className,
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">
          <SelectPrimitive.Value />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-muted transition-transform duration-200 [[data-state=open]_&]:rotate-180" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-border bg-elevated p-1 text-fg shadow-lift data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out"
        >
          <SelectPrimitive.Viewport className="thin-scroll">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                textValue={o.text}
                lang={o.lang}
                className="relative flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-xl py-2 pl-3 pr-9 text-sm outline-none data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary data-[state=checked]:font-semibold"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-3">
                  <Check className="size-4 text-primary" aria-hidden />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
