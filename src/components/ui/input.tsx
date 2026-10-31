import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-md border border-border bg-surface text-[13px] text-fg placeholder:text-subtle shadow-xs transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(field, "h-8 px-2.5", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(field, "px-2.5 py-2", className)} {...props} />
));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-fg-2", className)} {...props} />;
}
