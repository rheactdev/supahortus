import { useId } from "react";
import { type IconProps, defaultSize } from "../iconprops";
import { IconWrapper } from "./wrapper";

export function Clipboard({ size = defaultSize, className }: IconProps) {
  const id = useId();

  return (
    <IconWrapper className={className}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-0`} x1="4.129" x2="19.871" y1="4.629" y2="20.371" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".6" />
            <stop offset="1" stopColor="#fff" stopOpacity=".3" />
          </linearGradient>
          <linearGradient id={`${id}-1`} x1="4.129" x2="19.871" y1="4.629" y2="20.371" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".6" />
            <stop offset=".493" stopColor="#fff" stopOpacity="0" />
            <stop offset=".997" stopColor="#fff" stopOpacity=".3" />
          </linearGradient>
          <linearGradient id={`${id}-2`} x1="9.586" x2="14.414" y1=".586" y2="5.414" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".7" />
            <stop offset=".519" stopColor="#fff" stopOpacity=".45" />
            <stop offset="1" stopColor="#fff" stopOpacity=".55" />
          </linearGradient>
          <linearGradient id={`${id}-3`} x1="7" x2="17" y1="10" y2="10" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".7" />
            <stop offset=".519" stopColor="#fff" stopOpacity=".45" />
            <stop offset="1" stopColor="#fff" stopOpacity=".55" />
          </linearGradient>
          <linearGradient id={`${id}-4`} x1="7" x2="13" y1="14" y2="14" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".7" />
            <stop offset=".519" stopColor="#fff" stopOpacity=".45" />
            <stop offset="1" stopColor="#fff" stopOpacity=".55" />
          </linearGradient>
          <linearGradient id={`${id}-5`} x1="7" x2="15" y1="18" y2="18" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".7" />
            <stop offset=".519" stopColor="#fff" stopOpacity=".45" />
            <stop offset="1" stopColor="#fff" stopOpacity=".55" />
          </linearGradient>
        </defs>
        <path fill={`url(#${id}-0)`} d="M17,3h-1c0-1.105-0.895-2-2-2h-4C8.895,1,8,1.895,8,3H7C5.343,3,4,4.343,4,6v13 c0,1.657,1.343,3,3,3h10c1.657,0,3-1.343,3-3V6C20,4.343,18.657,3,17,3z" />
        <path fill={`url(#${id}-1)`} d="M14,1.5c0.827,0,1.5,0.673,1.5,1.5v0.5 H16h1c1.378,0,2.5,1.121,2.5,2.5v13c0,1.379-1.122,2.5-2.5,2.5H7c-1.378,0-2.5-1.121-2.5-2.5V6c0-1.379,1.122-2.5,2.5-2.5h1h0.5V3 c0-0.827,0.673-1.5,1.5-1.5H14 M14,1h-4C8.895,1,8,1.895,8,3H7C5.343,3,4,4.343,4,6v13c0,1.657,1.343,3,3,3h10 c1.657,0,3-1.343,3-3V6c0-1.657-1.343-3-3-3h-1C16,1.895,15.105,1,14,1L14,1z" />
        <path fill={`url(#${id}-2)`} d="M14,5h-4C8.895,5,8,4.105,8,3v0 c0-1.105,0.895-2,2-2h4c1.105,0,2,0.895,2,2v0C16,4.105,15.105,5,14,5z" />
        <path fill={`url(#${id}-3)`} d="M16,9H8c-0.553,0-1,0.448-1,1s0.447,1,1,1 h8c0.553,0,1-0.448,1-1S16.553,9,16,9z" />
        <path fill={`url(#${id}-4)`} d="M8,15h4c0.553,0,1-0.448,1-1s-0.447-1-1-1 H8c-0.553,0-1,0.448-1,1S7.447,15,8,15z" />
        <path fill={`url(#${id}-5)`} d="M14,17H8c-0.553,0-1,0.448-1,1s0.447,1,1,1 h6c0.553,0,1-0.448,1-1S14.553,17,14,17z" />
      </svg>
    </IconWrapper>
  );
}
