import { IconProps, defaultSize } from "../iconprops";
import { IconWrapper } from "./wrapper";

export function Checkmark({ size = defaultSize, className }: IconProps) {
    return (
        <IconWrapper className={className}>
            <svg xmlns="http://www.w3.org/2000/svg" baseProfile="basic" viewBox="0 0 24 24" width={size} height={size}>
                <linearGradient id="b1pOqSqPlU5fLhWUpWB9La" x1="4.929" x2="19.071" y1="4.929" y2="19.071" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"/><stop offset="1" stopColor="#fff" stopOpacity=".3"/></linearGradient><circle cx="12" cy="12" r="10" fill="url(#b1pOqSqPlU5fLhWUpWB9La)"/><linearGradient id="b1pOqSqPlU5fLhWUpWB9Lb" x1="4.929" x2="19.071" y1="4.929" y2="19.071" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"/><stop offset=".493" stopColor="#fff" stopOpacity="0"/><stop offset=".997" stopColor="#fff" stopOpacity=".3"/></linearGradient><path fill="url(#b1pOqSqPlU5fLhWUpWB9Lb)" d="M12,2.5c5.238,0,9.5,4.262,9.5,9.5 s-4.262,9.5-9.5,9.5S2.5,17.238,2.5,12S6.762,2.5,12,2.5 M12,2C6.477,2,2,6.477,2,12s4.477,10,10,10s10-4.477,10-10S17.523,2,12,2 L12,2z"/><linearGradient id="b1pOqSqPlU5fLhWUpWB9Lc" x1="12.293" x2="16.707" y1="6.293" y2="10.707" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".7"/><stop offset=".519" stopColor="#fff" stopOpacity=".45"/><stop offset="1" stopColor="#fff" stopOpacity=".55"/></linearGradient><path fill="url(#b1pOqSqPlU5fLhWUpWB9Lc)" d="M11,16c-0.256,0-0.512-0.098-0.707-0.293	l-3-3c-0.391-0.391-0.391-1.023,0-1.414s1.023-0.391,1.414,0L11,13.586l9.293-9.293c0.391-0.391,1.023-0.391,1.414,0	s0.391,1.023,0,1.414l-10,10C11.512,15.902,11.256,16,11,16z"/>
            </svg>
        </IconWrapper>
    )
}
