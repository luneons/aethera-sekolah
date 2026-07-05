'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-display font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base disabled:opacity-40 disabled:cursor-not-allowed select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-primary-500 text-text-inverse hover:bg-primary-400 hover:shadow-glow-primary active:bg-primary-600 active:scale-[0.98]',
        secondary:
          'bg-surface-raised text-text-primary border border-surface-border hover:border-primary-500 hover:text-primary-400 active:scale-[0.98]',
        ghost:
          'text-text-secondary hover:text-primary-400 hover:bg-surface-raised active:scale-[0.98]',
        danger:
          'bg-danger text-white hover:bg-danger-light hover:shadow-glow-danger active:bg-danger-dark active:scale-[0.98]',
        outline:
          'border border-primary-500 text-primary-400 bg-transparent hover:bg-primary-500/10 hover:shadow-glow-sm active:scale-[0.98]',
      },
      size: {
        xs: 'px-3 py-1.5 text-xs rounded',
        sm: 'px-4 py-2 text-sm rounded-md',
        md: 'px-5 py-2.5 text-sm rounded-md',
        lg: 'px-6 py-3 text-base rounded-lg',
        xl: 'px-8 py-4 text-lg rounded-xl',
        icon: 'p-2.5 rounded-md',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  )
);
Button.displayName = 'Button';
