import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SlideOverDrawerSize = 'md' | 'lg' | 'xl' | '2xl';

interface SlideOverDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  size?: SlideOverDrawerSize;
  modal?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

const SIZE_CLASSES: Record<SlideOverDrawerSize, string> = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-xl',
  xl: 'sm:max-w-2xl',
  '2xl': 'sm:max-w-3xl',
};

export const SlideOverDrawer: React.FC<SlideOverDrawerProps> = ({
  open,
  onOpenChange,
  title,
  description,
  icon,
  headerExtra,
  footer,
  size = 'lg',
  modal = true,
  className,
  bodyClassName,
  children,
}) => {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="drawer-overlay fixed inset-0 z-50 bg-black/35 transition-opacity"
        />
        <Dialog.Content
          className={cn(
            'drawer-content fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l border-border bg-card text-card-foreground shadow-2xl focus:outline-none',
            SIZE_CLASSES[size],
            className
          )}
        >
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card/95 backdrop-blur-xs px-5 py-4 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              {icon && (
                <div className="p-2.5 rounded-xl bg-tint-cyan text-ink-cyan border border-tint-cyan-border shrink-0 mt-0.5">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                <Dialog.Title className="text-sm sm:text-base font-bold text-foreground tracking-tight leading-snug">
                  {title}
                </Dialog.Title>
                {description && (
                  <Dialog.Description className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {description}
                  </Dialog.Description>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {headerExtra}
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Tutup panel"
                  className="p-2 rounded-lg border border-border bg-muted text-muted-foreground hover:text-foreground hover:bg-accent transition focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Independent Scrollable Body */}
          <div className={cn('flex-1 min-h-0 overflow-y-auto px-5 py-4', bodyClassName)}>
            {children}
          </div>

          {/* Optional Sticky Footer */}
          {footer && (
            <div className="sticky bottom-0 z-10 border-t border-border bg-card/95 backdrop-blur-xs px-5 py-3.5 shrink-0">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
