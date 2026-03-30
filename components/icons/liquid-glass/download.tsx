import { IconProps, defaultSize } from "../iconprops";
import { IconWrapper } from "./wrapper";

export function Download({ size = defaultSize, className }: IconProps) {
    return (
        <IconWrapper className={className}>
            <svg xmlns="http://www.w3.org/2000/svg" baseProfile="basic" viewBox="0 0 24 24" width={size} height={size}><linearGradient id="ZzW6-4oZOsMijumYfGj8la" x1="3.879" x2="20.121" y1="3.879" y2="20.121" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"/><stop offset="1" stopColor="#fff" stopOpacity=".3"/></linearGradient><path fill="url(#ZzW6-4oZOsMijumYfGj8la)" d="M18,21H6c-1.657,0-3-1.343-3-3V6c0-1.657,1.343-3,3-3h12c1.657,0,3,1.343,3,3v12 C21,19.657,19.657,21,18,21z"/><linearGradient id="ZzW6-4oZOsMijumYfGj8lb" x1="3.879" x2="20.121" y1="3.879" y2="20.121" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"/><stop offset=".493" stopColor="#fff" stopOpacity="0"/><stop offset=".997" stopColor="#fff" stopOpacity=".3"/></linearGradient><path fill="url(#ZzW6-4oZOsMijumYfGj8lb)" d="M18,3.5c1.379,0,2.5,1.121,2.5,2.5v12 c0,1.379-1.121,2.5-2.5,2.5H6c-1.379,0-2.5-1.121-2.5-2.5V6c0-1.379,1.121-2.5,2.5-2.5H18 M18,3H6C4.343,3,3,4.343,3,6v12 c0,1.657,1.343,3,3,3h12c1.657,0,3-1.343,3-3V6C21,4.343,19.657,3,18,3L18,3z"/><linearGradient id="ZzW6-4oZOsMijumYfGj8lc" x1="7.583" x2="16.417" y1="5.01" y2="13.845" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".7"/><stop offset=".519" stopColor="#fff" stopOpacity=".45"/><stop offset="1" stopColor="#fff" stopOpacity=".55"/></linearGradient><path fill="url(#ZzW6-4oZOsMijumYfGj8lc)" d="M16.131,12H14V3.421c0-1.105-0.895-2-2-2	s-2,0.895-2,2V12H7.869c-0.771,0-1.159,0.93-0.616,1.478l3.856,3.893c0.491,0.495,1.291,0.495,1.782,0l3.856-3.893	C17.29,12.93,16.902,12,16.131,12z"/></svg>
        </IconWrapper>
    )
}
