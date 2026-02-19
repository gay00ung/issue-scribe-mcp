import { z } from "zod";

export const PaginationSchema = z.object({
    page: z.number().int().min(1).optional(),
    per_page: z.number().int().min(1).max(100).optional(),
    fetch_all: z.boolean().optional(),
});

export interface PaginationOptions {
    page: number;
    perPage: number;
    fetchAll: boolean;
}

export interface PaginationResult<T> {
    items: T[];
    page: number;
    per_page: number;
    fetch_all: boolean;
    pages_fetched: number;
}

export function resolvePagination(
    pagination: { page?: number; per_page?: number; fetch_all?: boolean },
    defaults?: Partial<PaginationOptions>
): PaginationOptions {
    return {
        page: pagination.page ?? defaults?.page ?? 1,
        perPage: pagination.per_page ?? defaults?.perPage ?? 30,
        fetchAll: pagination.fetch_all ?? defaults?.fetchAll ?? false,
    };
}

export async function collectPaginated<T>(
    options: PaginationOptions,
    fetchPage: (page: number, perPage: number) => Promise<T[]>
): Promise<PaginationResult<T>> {
    if (!options.fetchAll) {
        const items = await fetchPage(options.page, options.perPage);
        return {
            items,
            page: options.page,
            per_page: options.perPage,
            fetch_all: false,
            pages_fetched: 1,
        };
    }

    const allItems: T[] = [];
    let currentPage = options.page;
    let pagesFetched = 0;

    while (true) {
        const pageItems = await fetchPage(currentPage, options.perPage);
        allItems.push(...pageItems);
        pagesFetched += 1;

        if (pageItems.length < options.perPage) {
            break;
        }

        currentPage += 1;
    }

    return {
        items: allItems,
        page: options.page,
        per_page: options.perPage,
        fetch_all: true,
        pages_fetched: pagesFetched,
    };
}
