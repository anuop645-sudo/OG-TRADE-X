import React from 'react';
import { ColourType } from '../types/trading';

interface LotteryBallProps {
  num: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  active?: boolean;
}

export const LotteryBall: React.FC<LotteryBallProps> = ({
  num,
  size = 'md',
  active = false,
}) => {
  const outerSize =
    size === 'xs'
      ? 'h-7 w-7 p-[3px] text-xs'
      : size === 'sm'
        ? 'h-8 w-8 p-[3.5px] text-sm'
        : size === 'lg'
          ? 'h-12 w-12 p-[5px] text-xl'
          : 'h-11 w-11 p-[4.5px] text-lg';

  const getOuterRingStyle = (): React.CSSProperties => {
    if (num === 0) {
      return {
        background: 'linear-gradient(135deg, #EF4444 50%, #9333EA 50%)',
      };
    }
    if (num === 5) {
      return {
        background: 'linear-gradient(135deg, #16A34A 50%, #9333EA 50%)',
      };
    }
    if (num % 2 === 1) {
      return {
        background: 'linear-gradient(180deg, #22C55E 0%, #15803D 100%)',
      };
    }
    return {
      background: 'linear-gradient(180deg, #F87171 0%, #DC2626 100%)',
    };
  };

  const getNumberColorClass = (): string => {
    if (num === 0) return 'text-rose-600';
    if (num === 5) return 'text-emerald-700';
    return num % 2 === 1 ? 'text-emerald-700' : 'text-rose-600';
  };

  return (
    <span
      style={getOuterRingStyle()}
      className={`inline-flex items-center justify-center rounded-full shadow-sm transition-transform shrink-0 ${outerSize} ${
        active ? 'scale-110 ring-2 ring-slate-900 ring-offset-2 ring-offset-white' : ''
      }`}
    >
      <span
        className={`flex h-full w-full items-center justify-center rounded-full bg-gradient-to-b from-white to-slate-100 font-mono font-extrabold shadow-inner ${getNumberColorClass()}`}
      >
        {num}
      </span>
    </span>
  );
};

interface ColourDotsProps {
  colours: ColourType[];
}

export const ColourDots: React.FC<ColourDotsProps> = ({ colours }) => {
  const safeColours = Array.isArray(colours) ? colours : [];
  return (
    <span className="inline-flex items-center gap-1.5">
      {safeColours.map((c) => {
        const dotClass =
          c === 'green'
            ? 'bg-emerald-500'
            : c === 'violet'
              ? 'bg-violet-600'
              : 'bg-rose-500';
        const label = typeof c === 'string' && c.length > 0 ? c.charAt(0).toUpperCase() + c.slice(1) : 'Colour';
        return (
          <span key={c} className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
            <span className={`h-3 w-3 rounded-full ${dotClass}`} aria-hidden="true" />
            <span>{label}</span>
          </span>
        );
      })}
    </span>
  );
};
