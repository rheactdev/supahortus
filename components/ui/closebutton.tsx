import { Close } from "../icons/liquid-glass";

export const CloseButton = ({ onClick }: { onClick: () => void }) => {
    return (
        <button
            onClick={onClick}
            className="btn btn-square btn-soft btn-error absolute right-5 top-5 z-50"
        >
            <Close size={24} />
        </button>
    )
}