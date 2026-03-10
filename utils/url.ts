

export function resolveUrl(u?: string): string {
    if (!u) return '';
    if (/^(https?:|blob:|data:)/i.test(u)) return u;

    const base = process.env.BACKEND_URL || '';
    // remove trailing slash from base
    const normalizedBase = base.replace(/\/+$/, '');
    // remove leading slash from u
    const normalizedPath = u.replace(/^\/+/, '');

    return `${normalizedBase}/${normalizedPath}`;
}

export const geNotificationtLink = (relatedEntityType, relatedEntityId, subType, userRole) => {
    if (relatedEntityType === 'proposal') {
        if (userRole === 'buyer')
            return `/my-jobs/${relatedEntityId}/proposals`;
        else if (userRole === 'seller')
            return `/jobs/proposals`;//// need edit page to show detials
    } else if (relatedEntityType === 'service') {
        return `/services/id/${relatedEntityId}`;
    }
    else if (relatedEntityType === 'job') {
        if (userRole === 'buyer')
            return `/my-jobs?job=${relatedEntityId}`;
        else
            return `/jobs?job=${relatedEntityId}`;
    }
    else if (relatedEntityType === 'dispute') {
        if (userRole === 'admin') {
            return `/dashboard/disputes`; //// need edit page to show detials
        }
        return `/my-disputes?dispute=${relatedEntityId}`;
    }
    else if (relatedEntityType === 'order') {
        if (subType === 'rating') {
            return `/my-orders?orderId=${relatedEntityId}&mode=give-feedback`;
        }
        else if (subType === 'rating_published') {
            return `/my-orders?orderId=${relatedEntityId}&mode=view-feedback`;
        }
        else if (userRole === 'admin')
            return `/dashboard/orders`; //// need edit page to show detials
        else
            return `/my-orders?orderId=${relatedEntityId}`;
    }
    else if (relatedEntityType === 'transaction') {
        if (userRole === 'admin') {
            return `/dashboard/finance`; //// need edit page to show detials
        }
        return `/my-billing?tab=billing-history`;
    }
    else {
        return null;
    }
};