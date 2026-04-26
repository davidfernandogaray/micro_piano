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
      borderBottom: `2px solid ${BORDER[variant]}`,
      borderTop: 'none',
      borderRadius: variant === 'gray' ? '0 0 3px 3px' : '0 0 6px 6px',
      zIndex: layout.zIndex,
      pointerEvents: 'none',
      boxSizing: 'border-box',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingBottom: variant === 'gray' ? 2 : variant === 'black' ? 5 : 6,
      transition: 'background 0.04s',
      boxShadow: variant === 'white'
        ? 'inset -1px 0 0 rgba(0,0,0,0.06), inset 0 -4px 10px rgba(0,0,0,0.1)'
        : variant === 'black'
        ? 'inset 0 -6px 12px rgba(0,0,0,0.6), inset 1px 0 0 rgba(255,255,255,0.04)'
        : 'inset 0 -3px 6px rgba(0,0,0,0.35)',
    }}>

      {/* White key — horizontal black bold label */}
      {variant === 'white' && (
        <span style={{
          fontSize: 10,
          fontWeight: 'bold',
          color: isActive ? '#0d47a1' : '#222',
          fontFamily: 'system-ui, sans-serif',
          userSelect: 'none',
          lineHeight: 1,
          textAlign: 'center',
        }}>{label}</span>
      )}

      {/* Black key — horizontal white bold label */}
      {variant === 'black' && (
        <span style={{
          fontSize: 8,
          fontWeight: 'bold',
          color: isActive ? '#e3f2fd' : '#fff',
          fontFamily: 'system-ui, sans-serif',
          userSelect: 'none',
          textAlign: 'center',
          lineHeight: 1,
        }}>{label}</span>
      )}

      {/* Gray key — vertical black bold label (rotated, fits narrow key) */}
      {variant === 'gray' && (
        <span style={{
          fontSize: 7,
          fontWeight: 'bold',
          color: isActive ? '#e3f2fd' : '#111',
          fontFamily: 'system-ui, sans-serif',
          userSelect: 'none',
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          lineHeight: 1,
        }}>{label}</span>
      )}
    </div>
  );
});

export default PianoKey;
