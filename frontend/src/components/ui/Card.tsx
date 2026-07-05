import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva('rounded-xl border transition-all duration-300', {
  variants: {
    variant: {
      default:
        'bg-surface-raised border-surface-border shadow-card hover:shadow-card-hover hover:border-primary-500/30',
      glass:
        'bg-surface-raised/60 backdrop-blur-xl border-surface-border/50 hover:border-primary-500/40',
      glow:
        'bg-surface-raised border-primary-500/30 shadow-glow-sm hover:border-primary-500/60 hover:shadow-glow-primary',
      stat: 'bg-gradient-card border-surface-border relative overflow-hidden',
    },
    padding: { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' },
  },
  defaultVariants: { variant: 'default', padding: 'md' },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ variant, padding, className, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, padding }), className)} {...props} />;
}
