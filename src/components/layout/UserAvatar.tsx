import React from 'react';
import { twMerge } from 'tailwind-merge';

// Avatar with initials fallback (profiles.avatar is optional).
export const UserAvatar: React.FC<{ name: string; src?: string; className?: string }> = ({ name, src, className }) => {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || '?';
  return (
    <div
      className={twMerge(
        'w-8 h-8 rounded-full bg-[#DCEFE5] text-[#06452F] overflow-hidden shrink-0 border border-slate-700 flex items-center justify-center text-[11px] font-bold select-none',
        className
      )}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : initials}
    </div>
  );
};
