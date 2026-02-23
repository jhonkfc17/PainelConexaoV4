import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectPremiumProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SelectPremium({
  value,
  onChange,
  options,
  placeholder = "Selecionar",
  className = "",
  disabled = false,
}: SelectPremiumProps) {
  return (
    <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
      <Select.Trigger
        className={
          "flex h-9 w-full items-center justify-between rounded-lg " +
          "border border-slate-700/60 bg-slate-950/60 px-3 text-sm text-white " +
          "outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 " +
          "transition disabled:cursor-not-allowed disabled:opacity-60 " +
          className
        }
        aria-label={placeholder}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown size={16} className="text-white/50" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          sideOffset={6}
          className="z-50 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950/95 backdrop-blur shadow-2xl"
        >
          <Select.Viewport className="p-1">
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={
                  "relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm " +
                  "text-white/80 outline-none transition " +
                  "hover:bg-slate-800/60 focus:bg-emerald-500/15 " +
                  "data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
                }
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="absolute right-2">
                  <Check size={14} className="text-emerald-400" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
