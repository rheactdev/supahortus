import { IconProps, defaultSize } from "../iconprops";
import { IconWrapper } from "./wrapper";

export function FileIcon({ size = defaultSize, className }: IconProps) {
    return (
        <IconWrapper className={className}>
            <svg xmlns="http://www.w3.org/2000/svg" baseProfile="basic" viewBox="0 0 24 24" width={size} height={size}><linearGradient id="gVuE9Ajkm17qktKMlPBwMa" x1="2.818" x2="19.061" y1="4.939" y2="21.182" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"/><stop offset="1" stopColor="#fff" stopOpacity=".3"/></linearGradient><path fill="url(#gVuE9Ajkm17qktKMlPBwMa)" d="M4,19V5c0-1.657,1.343-3,3-3h7l6,6v11c0,1.657-1.343,3-3,3H7C5.343,22,4,20.657,4,19z"/><linearGradient id="gVuE9Ajkm17qktKMlPBwMb" x1="2.818" x2="19.061" y1="4.939" y2="21.182" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"/><stop offset=".493" stopColor="#fff" stopOpacity="0"/><stop offset=".997" stopColor="#fff" stopOpacity=".3"/></linearGradient><path fill="url(#gVuE9Ajkm17qktKMlPBwMb)" d="M13.793,2.5L19.5,8.207V19 c0,1.378-1.122,2.5-2.5,2.5H7c-1.378,0-2.5-1.122-2.5-2.5V5c0-1.379,1.122-2.5,2.5-2.5H13.793 M14,2H7C5.343,2,4,3.343,4,5v14 c0,1.657,1.343,3,3,3h10c1.657,0,3-1.343,3-3V8L14,2L14,2z"/><linearGradient id="gVuE9Ajkm17qktKMlPBwMc" x1="12.793" x2="18.793" y1="3.207" y2="9.207" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".7"/><stop offset=".519" stopColor="#fff" stopOpacity=".45"/><stop offset="1" stopColor="#fff" stopOpacity=".55"/></linearGradient><path fill="url(#gVuE9Ajkm17qktKMlPBwMc)" d="M14,6V2l6,6h-4C14.895,8,14,7.105,14,6z"/></svg>
        </IconWrapper>
    )
}
