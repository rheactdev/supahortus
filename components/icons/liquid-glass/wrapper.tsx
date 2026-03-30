import { IconWrapperProps } from "../iconprops";

export function IconWrapper({ className, children }: IconWrapperProps) {
    return (
        <span className={className}>
            {children}
        </span>
    )
}