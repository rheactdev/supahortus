import { IconProps, defaultSize } from "../iconprops";
import { IconWrapper } from "./wrapper";

export function Music({ size = defaultSize, className }: IconProps) {
    return (
        <IconWrapper className={className}>
            <svg xmlns="http://www.w3.org/2000/svg" baseProfile="basic" viewBox="0 0 24 24" width={size} height={size}>
                <linearGradient id="HulQ7FjlQ51k48LUaeq1ya" x1="9.172" x2="17.621" y1="7" y2="15.45" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"/><stop offset="1" stopColor="#fff" stopOpacity=".3"/></linearGradient><path fill="url(#HulQ7FjlQ51k48LUaeq1ya)" d="M20,3h-5h-1c-1.105,0-2,0.895-2,2v6.422C11.387,11.154,10.712,11,10,11c-2.761,0-5,2.239-5,5 s2.239,5,5,5s5-2.239,5-5V8h2c2.209,0,4-1.791,4-4C21,3.448,20.552,3,20,3z"/><linearGradient id="HulQ7FjlQ51k48LUaeq1yb" x1="9.172" x2="17.621" y1="7" y2="15.45" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"/><stop offset=".493" stopColor="#fff" stopOpacity="0"/><stop offset=".997" stopColor="#fff" stopOpacity=".3"/></linearGradient><path fill="url(#HulQ7FjlQ51k48LUaeq1yb)" d="M20,3.5c0.276,0,0.5,0.224,0.5,0.5 c0,1.93-1.57,3.5-3.5,3.5h-2h-0.5V8v8c0,2.481-2.019,4.5-4.5,4.5S5.5,18.481,5.5,16s2.019-4.5,4.5-4.5 c0.618,0,1.223,0.128,1.8,0.38l0.7,0.307v-0.765V5c0-0.827,0.673-1.5,1.5-1.5h1H20 M20,3h-5h-1c-1.105,0-2,0.895-2,2v6.422 C11.387,11.154,10.712,11,10,11c-2.761,0-5,2.239-5,5s2.239,5,5,5s5-2.239,5-5V8h2c2.209,0,4-1.791,4-4C21,3.448,20.552,3,20,3 L20,3z"/>
            </svg>
        </IconWrapper>
    )
}
