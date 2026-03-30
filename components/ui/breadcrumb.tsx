import Link from "next/link";
import { Folder, HardDrive } from "../icons/liquid-glass"

interface BreadcrumbProps {
    breadcrumbs: string[];
}

export const Breadcrumb = ({ breadcrumbs }: BreadcrumbProps) => {
    return (
        <div className="breadcrumbs text-sm">
            <ul>
                <li>
                    <Link href="/dashboard" >
                        <HardDrive />
                        <span>Bucket Root</span>
                    </Link>
                </li>
                {breadcrumbs.map((crumb, idx) => {
                    const prefix = breadcrumbs.slice(0, idx + 1).join("/") + "/";
                    return (
                        <li key={idx}>
                            <Link href={`/dashboard?prefix=${encodeURIComponent(prefix)}`} className="inline-flex items-center gap-2">
                                <Folder />
                                <span>{crumb}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </div>
    )
}