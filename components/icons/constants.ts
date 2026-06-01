export const LIQUID_GLASS = "lg";
export const LIQUID_GLASS_COLOR = "lg-color";

export type IconStyle = typeof LIQUID_GLASS | typeof LIQUID_GLASS_COLOR;

export interface ExtensionIcon {
  [ext: string]: ExtensionIconProps
}

export interface ExtensionIconProps {
  style: IconStyle;
  icon: string;
}

export const EXTENSION_ICONS: ExtensionIcon = {
  zip: {
    style: LIQUID_GLASS_COLOR,
    icon: "icons8-archive-folder",
  },
  psd: {
    style: LIQUID_GLASS_COLOR,
    icon: "icons8-adobe-photoshop",
  },
  rpy: {
    style: LIQUID_GLASS_COLOR,
    icon: "icons8-python",
  },
  py: {
    style: LIQUID_GLASS_COLOR,
    icon: "icons8-python",
  },
};