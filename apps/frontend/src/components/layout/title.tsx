'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';
export const Title = () => {
  const path = usePathname();
  const { all: menuItems } = useMenuItem();
  const currentTitle = useMemo(() => {
    return menuItems.find((item) => path.indexOf(item.path) > -1)?.name;
    // menuItems must be a dependency: its names are translated, and the
    // translations load after first render. With [path] alone the heading
    // froze on the English fallback ("Calendar") until the route changed.
  }, [path, menuItems]);

  return <h1>{currentTitle}</h1>;
};
