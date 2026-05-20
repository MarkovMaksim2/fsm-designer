import { cn } from "@/lib/utils";

function Separator({ className, orientation = "horizontal", ...props }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "shrink-0 bg-border/80",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
