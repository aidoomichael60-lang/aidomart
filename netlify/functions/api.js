const express = require('express');
const serverless = require('serverless-http');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'running on Netlify Node serverless!', version: '1.0.0' });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const adminEmail = process.env.ADMIN_EMAIL || 'aidoomichael60@gmail.com';

  if (email === adminEmail && password === 'MichaelAID60@') {
    return res.json({
      success: true,
      message: 'Admin login successful',
      user: {
        id: 'admin-01',
        email: email,
        role: 'admin',
        name: 'Aidoo Michael'
      },
      token: 'mock-netlify-jwt-token-admin'
    });
  }

  if (email && password) {
    return res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: 'user-01',
        email: email,
        role: 'buyer',
        name: 'Customer'
      },
      token: 'mock-netlify-jwt-token-user'
    });
  }

  return res.status(401).json({ success: false, message: 'Invalid email or password' });
});

app.get('/api/auth/user', (req, res) => {
  res.json({
    user: {
      id: 'admin-01',
      email: process.env.ADMIN_EMAIL || 'aidoomichael60@gmail.com',
      role: 'admin',
      name: 'Aidoo Michael'
    }
  });
});

module.exports.handler = serverless(app);
