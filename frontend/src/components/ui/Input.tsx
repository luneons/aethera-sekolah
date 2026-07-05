import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  'w-full font-body text-sm text-text-primary bg-surface-raised border rounded-lg px-4 py-2.5 outline-none placeholder:text-text-muted transition-all duration-200 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      state: {
        default: 'border-surface-border hover:border-text-muted',
        error: 'border-danger/60 focus:border-danger focus:ring-danger/20',
        success: 'border-success/60 focus:border-success focus:ring-success/20',
      },
    },
    defaultVariants: { state: 'default' },
  }
);

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, leftIcon, state, className, ...props }, ref) => {
    const derivedState = error ? 'error' : state;
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block font-body text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(inputVariants({ state: derivedState }), leftIcon && 'pl-10', className)}
            {...props}
          />
        </div>
        {(error || hint) && (
          <p className={cn('text-xs font-body', error ? 'text-danger' : 'text-text-muted')}>
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
