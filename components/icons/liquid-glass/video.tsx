import { IconProps, defaultSize } from "../iconprops";
import { IconWrapper } from "./wrapper";

export function Video({ size = defaultSize, className }: IconProps) {
    return (
        <IconWrapper className={className}>
            <svg xmlns="http://www.w3.org/2000/svg" baseProfile="basic" viewBox="0 0 24 24" width={size} height={size}>
                <linearGradient id="6irOewKBnXDcWQmL5wbx6a" x1="3.879" x2="20.121" y1="3.879" y2="20.121" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"/><stop offset="1" stopColor="#fff" stopOpacity=".3"/></linearGradient><path fill="url(#6irOewKBnXDcWQmL5wbx6a)" d="M19,20H5c-1.657,0-3-1.343-3-3V7c0-1.657,1.343-3,3-3h14c1.657,0,3,1.343,3,3v10 C22,18.657,20.657,20,19,20z"/><linearGradient id="6irOewKBnXDcWQmL5wbx6b" x1="3.879" x2="20.121" y1="3.879" y2="20.121" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"/><stop offset=".493" stopColor="#fff" stopOpacity="0"/><stop offset=".997" stopColor="#fff" stopOpacity=".3"/></linearGradient><path fill="url(#6irOewKBnXDcWQmL5wbx6b)" d="M19,4.5c1.379,0,2.5,1.122,2.5,2.5v10 c0,1.378-1.121,2.5-2.5,2.5H5c-1.379,0-2.5-1.122-2.5-2.5V7c0-1.378,1.121-2.5,2.5-2.5H19 M19,4H5C3.343,4,2,5.343,2,7v10 c0,1.657,1.343,3,3,3h14c1.657,0,3-1.343,3-3V7C22,5.343,20.657,4,19,4L19,4z"/><g><linearGradient id="6irOewKBnXDcWQmL5wbx6c" x1="8.293" x2="13.707" y1="9.293" y2="14.707" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".7"/><stop offset=".519" stopColor="#fff" stopOpacity=".45"/><stop offset="1" stopColor="#fff" stopOpacity=".55"/></linearGradient><path fill="url(#6irOewKBnXDcWQmL5wbx6c)" d="M15.515,11.143l-5-3 C10.206,7.957,9.82,7.952,9.507,8.13C9.194,8.307,9,8.64,9,9v6c0,0.36,0.194,0.693,0.507,0.87C9.66,15.957,9.83,16,10,16 c0.178,0,0.356-0.047,0.515-0.143l5-3C15.816,12.677,16,12.351,16,12S15.816,11.323,15.515,11.143z"/></g>
            </svg>
        </IconWrapper>
    )
}
