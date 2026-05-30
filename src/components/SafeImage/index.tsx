import React, { useEffect, useRef, useState } from 'react';

const DEFAULT_FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <rect width="120" height="120" rx="8" fill="#F2F3F5"/>
    <path d="M30 80 L52 56 L66 70 L82 50 L96 80 Z" fill="#C9CDD4"/>
    <circle cx="44" cy="42" r="8" fill="#C9CDD4"/>
    <text x="60" y="104" text-anchor="middle" font-size="12" fill="#86909C" font-family="PingFang SC, Helvetica, Arial, sans-serif">暂无图片</text>
  </svg>`
)}`;

interface SafeImageProps {
  src?: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  width?: number | string;
  height?: number | string;
  fallback?: string;
}

export default function SafeImage(props: SafeImageProps) {
  const { src, alt = '', className, style, width, height, fallback } = props;
  const erroredRef = useRef(false);
  const [currentSrc, setCurrentSrc] = useState<string>(
    src || fallback || DEFAULT_FALLBACK
  );

  useEffect(() => {
    erroredRef.current = false;
    setCurrentSrc(src || fallback || DEFAULT_FALLBACK);
  }, [src, fallback]);

  function handleError() {
    if (erroredRef.current) {
      return;
    }
    erroredRef.current = true;
    setCurrentSrc(fallback || DEFAULT_FALLBACK);
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      style={style}
      width={width}
      height={height}
      onError={handleError}
    />
  );
}
