import { memo } from 'react';
import { useAppStore } from '../../store';
import type { KeyLayout, KeyVariant } from './layout';

interface Props {
  noteId: string;
  variant: KeyVariant;
  absLeft: number;
  layout: KeyLayout;
  label: string;
}

// Gray keys use a steel-blue to distinguish clearly from black keys
const IDLE   = { white: '#f0ebe0', black: '#1e2030', gray: '#607d8b' };
const ACTIVE = { white: '#7ecfff', black: '#1565c0', gray: '#29b6f6' };
const BORDER = { white: '#c0b8a8', black: '#0a0a14', gray: '#37474f' };

const PianoKey = memo(function PianoKey({ noteId, variant, absLeft, layout, label }: Props) {
  const isActive = useAppStore((s) => s.activeNoteIds.has(noteId));
  const bg = isActive ? ACTIVE[variant] : IDLE[variant];

  return (
    <div style={{
      position: 'absolute',
      left: absLeft,
      top: 0,
      width: layout.width,
      height: layout.height,
      background: bg,
      borderLeft:   `1px solid ${BORDER[variant]}`,
      borderRight:  `1px solid ${BORDER[variant]}`,
      borderBottom: `1px solid ${BORDER[variant]}`,
      borderTop: 'none',
      borderRadius: variant === 'gray' ? '0 0 3px 3px' : '0 0 5px 5px',
      zIndex: layout.zIndex,
      pointerEvents: 'none',
      boxSizing: 'border-box',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingBottom: variant === 'white' ? 6 : 4,
      transition: 'background 0.04s',
      boxShadow: variant === 'white'
        ? 'inset -1px 0 0 rgba(0,0,0,0.06), inset 0 -4px 10px rgba(0,0,0,0.1)'
        : variant === 'black'
        ? 'inset 0 -6px 12px rgba(0,0,0,0.6), inset 1px 0 0 rgba(255,255,255,0.04)'
        : 'inset 0 -3px 6px rgba(0,0,0,0.35)',
    }}>
      {variant === 'white' && (
        <span style={{
          fontSize: 9, color: isActive ? '#1565c0' : '#8a8070',
          fontFamily: 'monospace', userSelect: 'none', lineHeight: 1,
        }}>{label}</span>
      )}
      {variant === 'black' && (
        <span style={{
          fontSize: 7, color: isActive ? '#90caf9' : '#556',
          fontFamily: 'monospace', userSelect: 'none',
          writingMode: 'vertical-rl', transform: 'rotate(180deg)',
        }}>{label}</span>
      )}
      {variant === 'gray' && (
        <span style={{
          fontSize: 6, color: isActive ? '#e3f2fd' : '#90a4ae',
          fontFamily: 'monospace', userSelect: 'none',
          writingMode: 'vertical-rl', transform: 'rotate(180deg)',
        }}>{label}</span>
      )}
    </div>
  );
});

export default PianoKey;
