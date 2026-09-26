import { useEffect, useRef, useState } from 'react';

export type ExportFormat = 'single' | 'separate';

interface ExportButtonProps {
  /** Main button text, e.g. "Export selected (3)" or "Export all". */
  label: string;
  onExport(format: ExportFormat): void;
}

const OPTIONS: { format: ExportFormat; label: string; title: string }[] = [
  { format: 'single', label: 'As single JSON file', title: 'One file holding an array of every capture' },
  { format: 'separate', label: 'As separate files', title: 'One file per capture, numbered NNN-host-path.json' }
];

/**
 * Split button: the main part exports as a single JSON file (the default), the
 * attached ▾ opens a menu with every format.
 */
export function ExportButton({ label, onExport }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // While open: focus the first item, close on a press outside.
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    function onPointerDown(event: PointerEvent): void {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function close(returnFocus: boolean): void {
    setOpen(false);
    if (returnFocus) toggle.current?.focus();
  }

  function choose(format: ExportFormat): void {
    close(true);
    onExport(format);
  }

  function onMenuKeyDown(event: React.KeyboardEvent): void {
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(current + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Tab') {
      close(false);
    }
  }

  return (
    <div className="split-btn" ref={root}>
      <button
        type="button"
        className="split-main"
        title={label + ' as a single JSON file'}
        onClick={() => onExport('single')}
      >
        {label}
      </button>
      <button
        type="button"
        ref={toggle}
        className={'split-toggle' + (open ? ' open' : '')}
        title="More export options"
        aria-label="More export options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ▾
      </button>
      {open && (
        <div className="split-menu" role="menu" ref={menu} onKeyDown={onMenuKeyDown}>
          {OPTIONS.map((option) => (
            <button
              key={option.format}
              type="button"
              role="menuitem"
              title={option.title}
              onClick={() => choose(option.format)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
