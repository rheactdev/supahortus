import { useId } from "react";
import { type IconProps, defaultSize } from "../iconprops";
import { IconWrapper } from "./wrapper";

export function Copy({ size = defaultSize, className }: IconProps) {
  const id = useId();

  return (
    <IconWrapper className={className}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-0`} x1="12.793" x2="18.793" y1="3.207" y2="9.207" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".7" />
            <stop offset=".519" stopColor="#fff" stopOpacity=".45" />
            <stop offset="1" stopColor="#fff" stopOpacity=".55" />
          </linearGradient>
          <linearGradient id={`${id}-1`} x1="3.818" x2="18.061" y1="5.939" y2="20.182" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".6" />
            <stop offset="1" stopColor="#fff" stopOpacity=".3" />
          </linearGradient>
          <linearGradient id={`${id}-2`} x1="3.818" x2="18.061" y1="5.939" y2="20.182" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".6" />
            <stop offset=".493" stopColor="#fff" stopOpacity="0" />
            <stop offset=".997" stopColor="#fff" stopOpacity=".3" />
          </linearGradient>
          <linearGradient id={`${id}-3`} x1="1.275" x2="15.104" y1="8.896" y2="22.725" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".7" />
            <stop offset=".519" stopColor="#fff" stopOpacity=".45" />
            <stop offset="1" stopColor="#fff" stopOpacity=".55" />
          </linearGradient>
        </defs>
        <path fill={`url(#${id}-0)`} d="M14,6V2l6,6h-4C14.895,8,14,7.105,14,6z" />
        <path fill={`url(#${id}-1)`} d="M14,2H9C7.343,2,6,3.343,6,5 C4.895,5,4,5.895,4,7v12c0,1.657,1.343,3,3,3h8c1.105,0,2-0.895,2-2c1.657,0,3-1.343,3-3V8L14,2z" />
        <path fill={`url(#${id}-2)`} d="M13.793,2.5L19.5,8.207V17 c0,1.379-1.122,2.5-2.5,2.5h-0.5V20c0,0.827-0.673,1.5-1.5,1.5H7c-1.378,0-2.5-1.121-2.5-2.5V7c0-0.827,0.673-1.5,1.5-1.5h0.5V5 c0-1.379,1.122-2.5,2.5-2.5H13.793 M14,2H9C7.343,2,6,3.343,6,5C4.895,5,4,5.895,4,7v12c0,1.657,1.343,3,3,3h8 c1.105,0,2-0.895,2-2c1.657,0,3-1.343,3-3V8L14,2L14,2z" />
        <path fill={`url(#${id}-3)`} d="M9,20c-1.657,0-3-1.343-3-3V5 C4.895,5,4,5.895,4,7v12c0,1.657,1.343,3,3,3h8c1.105,0,2-0.895,2-2H9z" />
      </svg>
    </IconWrapper>
  );
}
