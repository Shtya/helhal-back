/**
 * Processes a search string for PostgreSQL Full-Text Search.
 * Handles trimming, sanitization, and prefix formatting for English/Arabic.
 */
export const formatSearchTerm = (search: string) => {
    if (!search || !search.trim()) {
        return { formattedSearch: null, rawSearch: null };
    }

    // 1. TRIM and SANITIZE (Remove symbols, keep letters/numbers/spaces)
    const trimmed = search.trim();
    const sanitized = trimmed.replace(/[^\p{L}\p{N}\s]/gu, '');

    // 2. SPLIT and FILTER
    const words = sanitized
        .split(/\s+/)
        .filter((word) => word.length > 0);

    if (words.length === 0) {
        return { formattedSearch: null, rawSearch: null };
    }

    // 3. FORMAT for English prefix matching: "word1:* & word2:*"
    const formattedSearch = words
        .map((word) => `${word.trim()}:*`)
        .join(' & ');

    return {
        formattedSearch,
        rawSearch: trimmed, // Returning the original trimmed search for Arabic normalization
    };
};