import React, { ReactNode } from 'react';

interface DetailTitleProps {
  /** Small icon tile on the left. */
  icon?: ReactNode;
  /** Record name or number. */
  title: ReactNode;
  /** Status / priority badges next to the title. */
  badges?: ReactNode;
  /** One line under the title: key identifier and facts. */
  meta?: ReactNode;
}

/** The one detail-modal header: icon, title + status badges, identifier line. Renders inline
 *  elements only, so it is valid inside the Modal's <h2>. */
export const DetailTitle: React.FC<DetailTitleProps> = ({ icon, title, badges, meta }) => (
  <span className="flex items-center gap-3 min-w-0">
    {icon && (
      <span className="w-9 h-9 rounded-xl bg-slate-850 border border-slate-700 text-[#086343] flex items-center justify-center shrink-0">
        {icon}
      </span>
    )}
    <span className="min-w-0 flex flex-col">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-base font-bold text-slate-100 break-words">{title}</span>
        {badges}
      </span>
      {meta && <span className="text-xs font-normal text-slate-400 font-mono break-words">{meta}</span>}
    </span>
  </span>
);
