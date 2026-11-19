import { cn } from "@/lib/utils"

interface SegmentedProps<T extends string> {
  value: T
  options: { label: string; value: T }[]
  onChange: (value: T) => void
  "aria-label": string
  className?: string
}

/** Two or three exclusive choices in a pill, like the "Ваши / Команда" switch of the design */
function Segmented<T extends string>({ value, options, onChange, className, ...props }: SegmentedProps<T>) {
  return (
    <div
      data-slot="segmented"
      role="group"
      aria-label={props["aria-label"]}
      className={cn("inline-flex items-center rounded-lg border border-border/50 bg-muted/80 p-0.5 text-xs font-medium", className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1 transition-all",
            value === option.value
              ? "bg-[#e8eaed] font-semibold text-foreground dark:bg-[#3c3f42] dark:text-white dark:ring-1 dark:ring-white/15"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export { Segmented }
