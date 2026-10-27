import React from 'react';

interface OtiumLinkLogoProps {
  className?: string;
  size?: number;
}

export const OtiumLinkLogo: React.FC<OtiumLinkLogoProps> = ({ className = '', size = 36 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="otiumLinkEmerald" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34d399" />
          <stop offset="0.6" stopColor="#10b981" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
        <linearGradient id="otiumLinkGold" x1="12" y1="8" x2="36" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fde047" />
          <stop offset="0.7" stopColor="#eab308" />
          <stop offset="1" stopColor="#ca8a04" />
        </linearGradient>
        <filter id="otiumLinkGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#10b981" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Background Rounded Shield Tile */}
      <rect x="3" y="3" width="42" height="42" rx="12" fill="#0d1117" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1.2" />

      {/* Two interlinked organic loops symbolizing PC and Phone seamless bridge */}
      <g filter="url(#otiumLinkGlow)">
        {/* Left Link Loop (PC Node) */}
        <path
          d="M19 16H15C12.2386 16 10 18.2386 10 21V27C10 29.7614 12.2386 32 15 32H19"
          stroke="url(#otiumLinkEmerald)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />

        {/* Right Link Loop (Phone Node) */}
        <path
          d="M29 16H33C35.7614 16 38 18.2386 38 21V27C38 29.7614 35.7614 32 33 32H29"
          stroke="url(#otiumLinkGold)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />

        {/* Center Connecting Bridge Beam */}
        <line
          x1="17"
          y1="24"
          x2="31"
          y2="24"
          stroke="#f0fdf4"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeDasharray="0.1 5"
        />
        <line
          x1="18"
          y1="24"
          x2="30"
          y2="24"
          stroke="url(#otiumLinkEmerald)"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
};
