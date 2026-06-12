import Link from "next/link";
import { Folder, HardDrive } from "../icons/liquid-glass"

interface BreadcrumbItem {
    id: string;
    name: string;
}

interface BreadcrumbProps {
    breadcrumbs: BreadcrumbItem[];
    basePath: string;
}

export const Breadcrumb = ({ breadcrumbs, basePath }: BreadcrumbProps) => {
    return (
        <div className="breadcrumbs text-sm">
            <ul>
                <li>
                    <Link href={basePath} >
                        <HardDrive />
                        <span>Root</span>
                    </Link>
                </li>
                {breadcrumbs.map((crumb) => (
                    <li key={crumb.id}>
                        <Link href={`${basePath}/${crumb.id}`} className="inline-flex items-center gap-2">
                            <Folder />
                            <span>{crumb.name}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    )
}
