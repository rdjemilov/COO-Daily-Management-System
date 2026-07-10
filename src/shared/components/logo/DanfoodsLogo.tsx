import React from "react";

interface DanfoodsLogoProps {
  className?: string;
  light?: boolean;
}

export default function DanfoodsLogo({ className = "h-12 w-auto", light = false }: DanfoodsLogoProps) {
  const color = light ? "#ffffff" : "#0da193";

  return (
    <div className={`flex items-center select-none ${className}`}>
      <svg
        viewBox="0 0 240 70"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* DANF Text */}
        <text
          x="5"
          y="42"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="800"
          fontSize="28"
          fill={color}
          letterSpacing="1"
        >
          DANF
        </text>

        {/* First Smiley O */}
        <circle
          cx="101"
          cy="33"
          r="11"
          stroke={color}
          strokeWidth="3.2"
          fill="none"
        />
        {/* Eyes */}
        <circle cx="97.5" cy="30" r="1.6" fill={color} />
        <circle cx="104.5" cy="30" r="1.6" fill={color} />
        {/* Smile */}
        <path
          d="M 96.5,35 A 5,5 0 0,0 105.5,35"
          stroke={color}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />

        {/* Second Smiley O */}
        <circle
          cx="127"
          cy="33"
          r="11"
          stroke={color}
          strokeWidth="3.2"
          fill="none"
        />
        {/* Eyes */}
        <circle cx="123.5" cy="30" r="1.6" fill={color} />
        <circle cx="130.5" cy="30" r="1.6" fill={color} />
        {/* Smile */}
        <path
          d="M 122.5,35 A 5,5 0 0,0 131.5,35"
          stroke={color}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />

        {/* DS Text */}
        <text
          x="141"
          y="42"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="800"
          fontSize="28"
          fill={color}
          letterSpacing="1"
        >
          DS
        </text>

        {/* Subtitle: Foodservice med et smil */}
        <text
          x="120"
          y="60"
          textAnchor="middle"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="600"
          fontSize="11"
          fill={color}
          letterSpacing="0.2"
        >
          Foodservice med et smil
        </text>
      </svg>
    </div>
  );
}
