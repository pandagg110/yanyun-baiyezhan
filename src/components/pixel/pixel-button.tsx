import { cn } from "@/lib/utils";
import React from "react";

interface PixelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "danger";
    size?: "sm" | "md" | "lg";
    isLoading?: boolean;
}

export function PixelButton({
    className,
    variant = "primary",
    isLoading,
    children,
    ...props
}: PixelButtonProps) {
    return (
        <button
            className={cn(
                "relative flex items-center justify-center border-4 border-black px-6 py-3 font-bold uppercase tracking-wide transition-all",
                "shadow-[4px_4px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
                "disabled:opacity-50 disabled:pointer-events-none",
                variant === "primary" && "bg-yellow-400 text-black hover:bg-yellow-300",
                variant === "secondary" && "bg-white text-black hover:bg-neutral-100",
                variant === "danger" && "bg-red-400 text-black hover:bg-red-300",
                props.size === "sm" && "px-3 py-1 text-xs",
                (props.size === "md" || !props.size) && "px-6 py-3",
                props.size === "lg" && "px-8 py-4 text-xl",
                className
            )}
            disabled={isLoading || props.disabled}
            {...props}
        >
            {isLoading ? "Loading..." : children}
        </button>
    );
}
