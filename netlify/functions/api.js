exports.handler = async function(event, context) {
    const path = event.path.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '');
    const method = event.httpMethod;

    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Content-Type': 'application/json'
    };

    if (method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Health check endpoint
    if (path === '/health' || path === '/health/' || path === '') {
        if (method === 'GET') {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ status: 'running on Netlify native serverless!', version: '1.0.0' })
            };
        }
    }

    // Login endpoint
    if (path === '/auth/login' || path === '/auth/login/') {
        if (method === 'POST') {
            let data = {};
            try {
                data = event.body ? JSON.parse(event.body) : {};
            } catch (e) {
                data = {};
            }

            const email = data.email;
            const password = data.password;
            const adminEmail = process.env.ADMIN_EMAIL || 'aidoomichael60@gmail.com';

            if (email === adminEmail && password === 'MichaelAID60@') {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Admin login successful',
                        user: {
                            id: 'admin-01',
                            email: email,
                            role: 'admin',
                            name: 'Aidoo Michael'
                        },
                        token: 'mock-netlify-jwt-token-admin'
                    })
                };
            }

            if (email && password) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Login successful',
                        user: {
                            id: 'user-01',
                            email: email,
                            role: 'buyer',
                            name: 'Customer'
                        },
                        token: 'mock-netlify-jwt-token-user'
                    })
                };
            }

            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'Invalid email or password' })
            };
        }
    }

    // Current user endpoint
    if (path === '/auth/user' || path === '/auth/user/') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                user: {
                    id: 'admin-01',
                    email: process.env.ADMIN_EMAIL || 'aidoomichael60@gmail.com',
                    role: 'admin',
                    name: 'Aidoo Michael'
                }
            })
        };
    }

    return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Endpoint not found', path: path })
    };
};
