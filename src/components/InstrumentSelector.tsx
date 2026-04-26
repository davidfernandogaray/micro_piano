import { useState } from 'react';
import { INSTRUMENTS } from '../audio/instruments';
import { setInstrument } from '../audio/engine';

export function InstrumentSelector() {
  const [activeId, setActiveId] = useState('piano');
  return (
    <div style={{
      display: 'flex', gap: 5, padding: '4px 12px',
      overflowX: 'auto', background: '#0a0a12',
      borderBottom: '1px solid #161622',
      WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none',
      minHeight: 34,
      alignItems: 'center',
    }}>
      {INSTRUMENTS.map(inst => {
        const on = inst.id === activeId;
        return (
          <button key={inst.id}
            onClick={() => { setActiveId(inst.id); setInstrument(inst); }}
            style={{
              flexShrink: 0, padding: '3px 11px', borderRadius: 14,
              border: `1px solid ${on ? '#4fc3f7' : '#1e1e2e'}`,
              background: on ? 'rgba(79,195,247,0.12)' : 'transparent',
              color: on ? '#4fc3f7' : '#bbb',
              fontSize: 12, fontFamily: 'system-ui',
              cursor: 'pointer', whiteSpace: 'nowrap',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {inst.name}
          </button>
        );
      })}
    </div>
  );
}
