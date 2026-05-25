"use client"

interface SkyQueryLogoProps {
  size?: "sm" | "md" | "lg"
  showText?: boolean
  className?: string
}

export function SkyQueryLogo({
  size = "md",
  showText = true,
  className = "",
}: SkyQueryLogoProps) {
  const iconSizes = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  }

  const textSizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  }

  const starScales = {
    sm: 16,
    md: 20,
    lg: 24,
  }

  const s = starScales[size]

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Blue rounded square with white star */}
      <div
        className={`${iconSizes[size]} flex items-center justify-center rounded-lg bg-[#4A90D9]`}
      >
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 2L14.09 8.26L20.18 8.64L15.54 12.74L17.12 19.36L12 15.77L6.88 19.36L8.46 12.74L3.82 8.64L9.91 8.26L12 2Z"
            fill="white"
          />
        </svg>
      </div>
      {showText && (
        <span
          className={`${textSizes[size]} font-semibold tracking-tight text-foreground`}
        >
          SkyQuery
        </span>
      )}
    </div>
  )
}
