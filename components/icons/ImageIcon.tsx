import { IconStyle } from "./constants";
import { IconProps, defaultSize } from "./iconprops";
import { IconWrapper } from "./liquid-glass/wrapper";
import Image from "next/image";


interface ImageIconProps {
  size: number;
  className?: string;
  style: IconStyle;
  icon: string;
}

export function ImageIcon({
  size = defaultSize,
  className,
  style,
  icon,
}: ImageIconProps) {
  return (
    <IconWrapper className={className}>
      <Image
        src={`/icons/${style}/${icon}.svg`}
        width={size}
        height={size}
        alt={`${icon} icon`}
      />
    </IconWrapper>
  );
}
