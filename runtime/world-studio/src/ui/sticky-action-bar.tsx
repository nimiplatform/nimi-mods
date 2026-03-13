import React from 'react';

export function StickyActionBar(props: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="sticky bottom-0 z-10 border-t border-white/70 bg-white/82 px-5 py-3 backdrop-blur-xl">
      <div className="flex w-full flex-wrap items-center gap-2">
        {props.children}
      </div>
    </div>
  );
}
