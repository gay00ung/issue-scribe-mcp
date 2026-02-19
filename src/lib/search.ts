export interface RepositorySearchQueryOptions {
    owner: string;
    repo: string;
    kind: "issue" | "pr";
    state?: "open" | "closed" | "all";
    query?: string;
    labels?: string[];
    qualifiers?: string[];
}

export function buildRepositorySearchQuery(options: RepositorySearchQueryOptions): string {
    const parts: string[] = [];

    if (options.query && options.query.trim()) {
        parts.push(options.query.trim());
    }

    parts.push(`repo:${options.owner}/${options.repo}`);
    parts.push(`is:${options.kind}`);

    if (options.state && options.state !== "all") {
        parts.push(`is:${options.state}`);
    }

    for (const label of options.labels ?? []) {
        parts.push(`label:\"${label}\"`);
    }

    for (const qualifier of options.qualifiers ?? []) {
        if (qualifier.trim()) {
            parts.push(qualifier.trim());
        }
    }

    return parts.join(" ");
}

export function normalizeSearchSort(sort: string | undefined): string | undefined {
    if (!sort || sort === "best-match") {
        return undefined;
    }

    if (sort === "popularity") {
        return "comments";
    }

    if (sort === "long-running") {
        return "updated";
    }

    return sort;
}
