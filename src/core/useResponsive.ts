import { useState, useEffect } from 'react';

export interface ResponsiveState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  width: number;
}

export function useResponsive(): ResponsiveState {
  const getSnapshot = (): ResponsiveState => {
    if (typeof window === 'undefined') {
      return { isMobile: false, isTablet: false, isDesktop: true, isTouch: false, width: 1200 };
    }
    const width = window.innerWidth;
    const isTouch = 'ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0);
    const isMobileUa = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    const isMobile = width < 768 || (isMobileUa && width < 1024);
    const isTablet = width >= 768 && width < 1024;
    const isDesktop = width >= 1024 && !isMobileUa;
    return { isMobile, isTablet, isDesktop, isTouch, width };
  };

  const [state, setState] = useState<ResponsiveState>(getSnapshot);

  useEffect(() => {
    const handleResize = () => {
      setState(getSnapshot());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return state;
}
