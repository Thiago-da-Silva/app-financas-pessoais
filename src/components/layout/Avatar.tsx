import { cn } from "@/lib/utils";

export function Avatar({ name, url, size = 36, className }: { name: string; url: string | null; size?: number; className?: string }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 font-semibold text-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {url ? <img src={url} alt="" className="size-full object-cover" /> : initials}
    </span>
  );
}
