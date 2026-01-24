


export function encodeCursor(cursor: { createdAt: Date; id: string } | null): string | null {
    if (!cursor) return null;
    return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

export function decodeCursor(cursorString?: string): { createdAt: Date; id: string } | undefined {
    if (!cursorString) return undefined;
    try {
        const decoded = Buffer.from(cursorString, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);
        return { createdAt: new Date(parsed.createdAt), id: parsed.id };
    } catch (e) {
        return undefined;
    }
}
