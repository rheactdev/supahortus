import { IconProps, defaultSize } from "../iconprops";
import { IconWrapper } from "./wrapper";

export function MenuDots({ size = defaultSize, className }: IconProps) {
    return (
        <IconWrapper className={className}>
            <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width={size} height={size} viewBox="0 0 24 24">
                <linearGradient id="oDXcg7ctzdm-e4MvNKv-ta_0mAtpPoNoAEd_gr1" x1="3.086" x2="20.914" y1="3.086" y2="20.914" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"></stop><stop offset="1" stopColor="#fff" stopOpacity=".3"></stop></linearGradient><path fill="url(#oDXcg7ctzdm-e4MvNKv-ta_0mAtpPoNoAEd_gr1)" d="M22,12c0,1.105-0.895,2-2,2H4c-1.105,0-2-0.895-2-2c0-1.105,0.895-2,2-2h16 C21.105,10,22,10.895,22,12z M4,7h16c1.105,0,2-0.895,2-2c0-1.105-0.895-2-2-2H4C2.895,3,2,3.895,2,5C2,6.105,2.895,7,4,7z M20,17 H4c-1.105,0-2,0.895-2,2c0,1.105,0.895,2,2,2h16c1.105,0,2-0.895,2-2C22,17.895,21.105,17,20,17z"></path><linearGradient id="oDXcg7ctzdm-e4MvNKv-tb_0mAtpPoNoAEd_gr2" x1="3.086" x2="20.914" y1="3.086" y2="20.914" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"></stop><stop offset=".493" stopColor="#fff" stopOpacity="0"></stop><stop offset=".997" stopColor="#fff" stopOpacity=".3"></stop></linearGradient><path fill="url(#oDXcg7ctzdm-e4MvNKv-tb_0mAtpPoNoAEd_gr2)" d="M20,3.5c0.827,0,1.5,0.673,1.5,1.5 S20.827,6.5,20,6.5H4C3.173,6.5,2.5,5.827,2.5,5S3.173,3.5,4,3.5H20 M20,10.5c0.827,0,1.5,0.673,1.5,1.5s-0.673,1.5-1.5,1.5H4 c-0.827,0-1.5-0.673-1.5-1.5s0.673-1.5,1.5-1.5H20 M20,17.5c0.827,0,1.5,0.673,1.5,1.5s-0.673,1.5-1.5,1.5H4 c-0.827,0-1.5-0.673-1.5-1.5s0.673-1.5,1.5-1.5H20 M20,3H4C2.895,3,2,3.895,2,5c0,1.105,0.895,2,2,2h16c1.105,0,2-0.895,2-2 C22,3.895,21.105,3,20,3L20,3z M20,10H4c-1.105,0-2,0.895-2,2c0,1.105,0.895,2,2,2h16c1.105,0,2-0.895,2-2 C22,10.895,21.105,10,20,10L20,10z M20,17H4c-1.105,0-2,0.895-2,2c0,1.105,0.895,2,2,2h16c1.105,0,2-0.895,2-2 C22,17.895,21.105,17,20,17L20,17z"></path>
            </svg>
        </IconWrapper>
    )
}
