import { IconProps, defaultSize } from "../iconprops";
import { IconWrapper } from "./wrapper";

export function Add({ size = defaultSize, className }: IconProps) {
    return (
        <IconWrapper className={className}>
            <svg xmlns="http://www.w3.org/2000/svg" baseProfile="basic" viewBox="0 0 24 24" width={size} height={size}><linearGradient id="e9Iq6EDyl6FJMMvutqeRRa" x1="4.929" x2="19.071" y1="4.929" y2="19.071" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"/><stop offset="1" stopColor="#fff" stopOpacity=".3"/></linearGradient><circle cx="12" cy="12" r="10" fill="url(#e9Iq6EDyl6FJMMvutqeRRa)"/><linearGradient id="e9Iq6EDyl6FJMMvutqeRRb" x1="4.929" x2="19.071" y1="4.929" y2="19.071" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".6"/><stop offset=".493" stopColor="#fff" stopOpacity="0"/><stop offset=".997" stopColor="#fff" stopOpacity=".3"/></linearGradient><path fill="url(#e9Iq6EDyl6FJMMvutqeRRb)" d="M12,2.5c5.238,0,9.5,4.262,9.5,9.5s-4.262,9.5-9.5,9.5S2.5,17.238,2.5,12S6.762,2.5,12,2.5 M12,2C6.477,2,2,6.477,2,12s4.477,10,10,10s10-4.477,10-10S17.523,2,12,2L12,2z"/><linearGradient id="e9Iq6EDyl6FJMMvutqeRRc" x1="8.793" x2="15.207" y1="8.793" y2="15.207" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".7"/><stop offset=".519" stopColor="#fff" stopOpacity=".45"/><stop offset="1" stopColor="#fff" stopOpacity=".55"/></linearGradient><path fill="url(#e9Iq6EDyl6FJMMvutqeRRc)" d="M17,11h-3c-0.552,0-1-0.448-1-1V7c0-0.552-0.448-1-1-1s-1,0.448-1,1v3c0,0.552-0.448,1-1,1H7	c-0.552,0-1,0.448-1,1s0.448,1,1,1h3c0.552,0,1-0.448,1,1v3c0,0.552,0.448,1,1,1s1-0.448,1-1v-3c0-0.552,0.448-1,1-1h3	c0.552,0,1-0.448,1-1S17.552,11,17,11z"/></svg>
        </IconWrapper>
    )
}
