import { cn } from "@/lib/utils";
import React from "react";

interface PixelCardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: "default" | "primary" | "dark";
}

export function PixelCard({ className, variant = "default", children, ...props }: PixelCardProps) {
    return (
        <div
            className={cn(
                "relative border-4 border-black bg-neutral-800 p-4 shadow-[4px_4px_0_0_#000]",
                variant === "primary" && "bg-yellow-400 text-black",
                variant === "dark" && "bg-neutral-900 text-white",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}
