/**
 * API Client for SkyQuery Frontend
 */

const BASE_URL = 'http://localhost:8000/api/v1';

async function fetchWithHandler(url, options = {}) {
    console.log(`[API Request] ${options.method || 'GET'} ${url}`, options.body ? JSON.parse(options.body) : '');
    const response = await fetch(url, {
        credentials: 'include', // Needed for cookies
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => null);
    console.log(`[API Response] ${response.status} ${url}`, data);

    if (!response.ok) {
        // For structured error responses (from /test-connection, /connect)
        // the detail may be an object with {message, steps, schemas}
        const detail = data?.detail;
        if (detail && typeof detail === 'object') {
            const error = new Error(detail.message || `HTTP Error ${response.status}`);
            error.steps = detail.steps || [];
            error.schemas = detail.schemas || [];
            throw error;
        }
        const errorMsg = detail || `HTTP Error ${response.status}`;
        throw new Error(errorMsg);
    }
    return data;
}

export const apiClient = {
    /**
     * Test connection with full JDBC-style validation.
     * Returns { status, message, steps[], tables[], schemas[] }
     */
    testConnection: async (params) => {
        return fetchWithHandler(`${BASE_URL}/connections/test-connection`, {
            method: 'POST',
            body: JSON.stringify(params)
        });
    },

    /**
     * Full connect workflow: validate + save + discover metadata.
     * Returns { status, message, connection, metadata, steps[] }
     */
    connect: async (params) => {
        return fetchWithHandler(`${BASE_URL}/connections/connect`, {
            method: 'POST',
            body: JSON.stringify(params)
        });
    },

    /**
     * Disconnect: deactivate connection and clear metadata cache.
     */
    disconnect: async () => {
        return fetchWithHandler(`${BASE_URL}/connections/disconnect`, {
            method: 'POST'
        });
    },

    saveConnection: async (params) => {
        return fetchWithHandler(`${BASE_URL}/connections/save-connection`, {
            method: 'POST',
            body: JSON.stringify(params)
        });
    },

    getActiveConnection: async () => {
        try {
            return await fetchWithHandler(`${BASE_URL}/connections/active-connection`);
        } catch (e) {
            if (e.message.includes('404')) return null;
            throw e;
        }
    },

    discoverMetadata: async () => {
        return fetchWithHandler(`${BASE_URL}/metadata/discover`, {
            method: 'POST'
        });
    },

    getMetadataSchema: async () => {
        try {
            return await fetchWithHandler(`${BASE_URL}/metadata/schema`);
        } catch (e) {
            if (e.message.includes('404')) return null;
            throw e;
        }
    },

    getCurrentUser: async () => {
        try {
            console.log('[Auth] Fetching /auth/me to detect session...');
            const user = await fetchWithHandler(`${BASE_URL}/auth/me`);
            console.log('[Auth] /auth/me response:', user);
            return user;
        } catch (e) {
            console.log('[Auth] Session detection failed (invalid/expired):', e.message);
            if (e.message.includes('401')) return null;
            throw e;
        }
    },

    logout: async () => {
        return fetchWithHandler(`${BASE_URL}/auth/logout`, {
            method: 'POST'
        });
    },

    query: async (params) => {
        return fetchWithHandler(`http://localhost:8000/query`, {
            method: 'POST',
            body: JSON.stringify(params)
        });
    }
};
