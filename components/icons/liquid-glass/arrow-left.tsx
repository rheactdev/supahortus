import { useId } from "react";
import { type IconProps, defaultSize } from "../iconprops";
import { IconWrapper } from "./wrapper";

export function ArrowLeft({ size = defaultSize, className }: IconProps) {
  const id = useId();

  return (
    <IconWrapper className={className}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-0`} x1="6.046" x2="18.177" y1="5.934" y2="18.066" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".6" />
            <stop offset="1" stopColor="#fff" stopOpacity=".3" />
          </linearGradient>
          <linearGradient id={`${id}-1`} x1="6.046" x2="18.177" y1="5.934" y2="18.066" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".6" />
            <stop offset=".493" stopColor="#fff" stopOpacity="0" />
            <stop offset=".997" stopColor="#fff" stopOpacity=".3" />
          </linearGradient>
        </defs>
        <path fill={`url(#${id}-0)`} d="M20,9c-1.045,0-8.955,0-10,0V5.391c0-1.233-1.488-1.854-2.365-0.986l-6.229,6.17 c-0.793,0.785-0.793,2.066,0,2.851l6.229,6.17C8.512,20.463,10,19.843,10,18.609V15c1.045,0,8.955,0,10,0c1.657,0,3-1.343,3-3 S21.657,9,20,9z"/>
        <path fill={`url(#${id}-1)`} d="M8.602,4.5 C9.044,4.5,9.5,4.833,9.5,5.391V9v0.5H10h10c1.379,0,2.5,1.122,2.5,2.5s-1.121,2.5-2.5,2.5H10H9.5V15v3.609 c0,0.558-0.457,0.891-0.898,0.891c-0.161,0-0.398-0.045-0.615-0.26l-6.229-6.17C1.47,12.785,1.312,12.405,1.312,12 c0-0.405,0.158-0.785,0.446-1.071l6.229-6.17C8.204,4.545,8.441,4.5,8.602,4.5L8.602,4.5 M8.602,4 C8.263,4,7.918,4.125,7.635,4.405l-6.229,6.17c-0.793,0.785-0.793,2.066,0,2.851l6.229,6.17C7.918,19.875,8.263,20,8.602,20 C9.316,20,10,19.445,10,18.609V15c1.045,0,8.955,0,10,0c1.657,0,3-1.343,3-3s-1.343-3-3-3c-1.045,0-8.955,0-10,0V5.391 C10,4.555,9.316,4,8.602,4L8.602,4z"/>
      </svg>
    </IconWrapper>
  );
}
