"use client";

import { forwardRef, InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  optional?: boolean;
  icon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, optional, icon, className = "", ...props }, ref) => {
    return (
      <div className="w-full">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
          {optional && (
            <span className="ml-1 text-xs text-gray-400 font-normal">(opcional)</span>
          )}
        </label>
        <div className="relative">
          {icon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full px-4 py-3.5 rounded-xl border bg-white
              text-gray-900 placeholder-gray-400
              transition-all duration-200 ease-in-out
              ${icon ? "pl-10" : ""}
              ${
                error
                  ? "border-red-400 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-200"
                  : "border-gray-200 hover:border-[#ffa69e] focus:border-[#ffa69e] focus:ring-2 focus:ring-[#ffa69e]/25"
              }
              focus:outline-none
              ${className}
            `}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1 animate-fade-in-up">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;
