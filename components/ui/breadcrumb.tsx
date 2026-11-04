import Link from "next/link";
import { Folder, HardDrive, Home } from "../icons/liquid-glass"

interface BreadcrumbItem {
    id: string;
    name: string;
}

interface BreadcrumbProps {
    breadcrumbs: BreadcrumbItem[];
    basePath: string;
    gardenName: string;
}

export const Breadcrumb = ({ breadcrumbs, basePath, gardenName }: BreadcrumbProps) => {
    return (
        <div className="breadcrumbs text-sm">
            <ul>
                <li>
                    <Link href="/" className="inline-flex items-center gap-2">
                        <Home />
                        <span>Home</span>
                    </Link>
                </li>
                <li>
                    <Link href={basePath} >
                        <HardDrive />
                        <span>{gardenName}</span>
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
