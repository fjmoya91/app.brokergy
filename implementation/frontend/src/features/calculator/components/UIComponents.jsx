import React from 'react';

export function SectionCard({ children, className = '' }) {
    return (
        <div className={`glass-card p-5 md:p-8 animate-fade-in ${className}`}>
            {children}
        </div>
    );
}

export function Label({ htmlFor, children }) {
    return (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-white/60 mb-2">
            {children}
        </label>
    );
}

export function Input({ id, type = 'text', value, onChange, placeholder, min, max, step, disabled, inputMode, className = '' }) {
    return (
        <input
            id={id}
            type={type}
            inputMode={inputMode}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className={`
                w-full px-4 py-3 bg-bkg-deep/50 border border-white/[0.1] rounded-xl 
                text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50
                disabled:opacity-50 disabled:cursor-not-allowed transition-all
                text-base min-h-[48px] shadow-sm
                ${className}
            `}
        />
    );
}

export function Select({ id, value, onChange, children, className = '' }) {
    return (
        <div className="relative">
            <select
                id={id}
                value={value}
                onChange={onChange}
                className={`
                    w-full px-4 py-3 bg-bkg-deep/50 border border-white/[0.1] rounded-xl 
                    text-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50
                    appearance-none cursor-pointer transition-all
                    text-base min-h-[48px] shadow-sm
                    ${className}
                `}
            >
                {children}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </div>
    );
}

export function Button({ children, onClick, variant = 'primary', size = 'md', className = '', disabled = false }) {
    const baseStyles = "inline-flex items-center justify-center font-semibold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bkg-base disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";

    const variants = {
        primary: "bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-bold shadow-lg shadow-brand/20 hover:shadow-brand/30",
        secondary: "bg-bkg-elevated hover:bg-bkg-hover text-white border border-white/[0.1] hover:border-white/[0.15]",
        ghost: "bg-transparent hover:bg-bkg-hover text-white/60 hover:text-white",
        danger: "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20"
    };

    const sizes = {
        sm: "px-3 py-2 text-xs min-h-[32px]",
        md: "px-5 py-3 text-sm min-h-[48px]",
        lg: "px-8 py-4 text-base min-h-[56px]"
    };

    return (
        <button
            onClick={onClick}
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
            disabled={disabled}
        >
            {children}
        </button>
    );
}

export function Divider() {
    return <div className="h-px bg-white/[0.06] my-6" />;
}
