import { cn } from "@/lib/utils";
import React from "react";

interface PixelInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
}

export function PixelInput({ className, label, ...props }: PixelInputProps) {
    return (
        <div className="flex flex-col gap-2">
            {label && <label className="text-sm font-bold uppercase tracking-wider text-neutral-400">{label}</label>}
            <input
                className={cn(
                    "w-full border-4 border-black bg-neutral-100 px-4 py-3 text-black placeholder:text-neutral-500 focus:outline-none focus:ring-0",
                    "shadow-[4px_4px_0_0_#000] focus:translate-x-[1px] focus:translate-y-[1px] focus:shadow-[3px_3px_0_0_#000]",
                    className
                )}
                {...props}
            />
        </div>
    );
}
