import Link from "next/link";
import { Folder, HardDrive } from "../icons/liquid-glass"

interface BreadcrumbItem {
    id: string;
    name: string;
}

interface BreadcrumbProps {
    breadcrumbs: BreadcrumbItem[];
    gardenSlug: string;
}

export const Breadcrumb = ({ breadcrumbs, gardenSlug }: BreadcrumbProps) => {
    return (
        <div className="breadcrumbs text-sm">
            <ul>
                <li>
                    <Link href={`/my-gardens/${gardenSlug}`} >
                        <HardDrive />
                        <span>Root</span>
                    </Link>
                </li>
                {breadcrumbs.map((crumb) => (
                    <li key={crumb.id}>
                        <Link href={`/my-gardens/${gardenSlug}/${crumb.id}`} className="inline-flex items-center gap-2">
                            <Folder />
                            <span>{crumb.name}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    )
}