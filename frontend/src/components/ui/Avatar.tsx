import { cn, getInitials } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'present' | 'absent';
}

const sizeMap = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
};

const statusDot = {
  online: 'bg-success animate-status-blink',
  offline: 'bg-text-muted',
  present: 'bg-success',
  absent: 'bg-danger',
};

export function Avatar({ src, name, size = 'md', status }: AvatarProps) {
  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={cn(
          'rounded-full overflow-hidden bg-gradient-to-br from-primary-700 to-primary-900 ring-2 ring-surface-border flex items-center justify-center font-display font-semibold text-primary-300',
          sizeMap[size]
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={name} className="w-full h-full object-cover" />
        ) : (
          getInitials(name)
        )}
      </div>
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 block rounded-full ring-2 ring-surface-base',
            size === 'xs' ? 'w-1.5 h-1.5' : size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5',
            statusDot[status]
          )}
        />
      )}
    </div>
  );
}
