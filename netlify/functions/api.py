# Netlify Python Serverless Entry Point for AIDOMART
from flask import Flask, jsonify, request
import serverless_wsgi
import os

app = Flask(__name__)

app.config['SECRET_KEY'] = os.environ.get('SESSION_SECRET', 'aidomart-secure-secret-key')

# Health Check
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'running on Netlify serverless!',
        'marketplace': 'AIDOMART',
        'version': '1.0.0'
    }), 200

# Authentication & Login Route
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')

    admin_email = os.environ.get('ADMIN_EMAIL', 'aidoomichael60@gmail.com')
    
    # Check admin credentials
    if email == admin_email and password == 'MichaelAID60@':
        return jsonify({
            'success': True,
            'message': 'Admin login successful',
            'user': {
                'id': 'admin-01',
                'email': email,
                'role': 'admin',
                'name': 'Aidoo Michael'
            },
            'token': 'mock-netlify-jwt-token-admin'
        }), 200
    
    # Standard user fallback or rejection
    if email and password:
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'user': {
                'id': 'user-01',
                'email': email,
                'role': 'buyer',
                'name': 'Customer'
            },
            'token': 'mock-netlify-jwt-token-user'
        }), 200

    return jsonify({
        'success': False,
        'message': 'Invalid email or password'
    }), 401

# Get Current User Session Route
@app.route('/api/auth/user', methods=['GET'])
def get_current_user():
    # Returns active session state for frontend AuthContext
    return jsonify({
        'user': {
            'id': 'admin-01',
            'email': os.environ.get('ADMIN_EMAIL', 'aidoomichael60@gmail.com'),
            'role': 'admin',
            'name': 'Aidoo Michael'
        }
    }), 200

# Marketplace Products Route
@app.route('/api/marketplace/products', methods=['GET'])
def get_products():
    products = [
        {
            'id': 'p1',
            'title': 'iPhone 15 Pro Max',
            'category': 'Electronics',
            'price': 1200.00,
            'image': '/static/image/categories/electronics/photo_2026-09-30_18-01-20.jpg'
        },
        {
            'id': 'p2',
            'title': 'Designer Men\'s Wear Outfit',
            'category': 'Clothing',
            'price': 150.00,
            'image': '/static/image/categories/clothing/photo_2026-09-30_17-57-11.jpg'
        },
        {
            'id': 'p3',
            'title': 'High-Performance Laptop',
            'category': 'Electronics',
            'price': 950.00,
            'image': '/static/image/categories/electronics/photo_2026-09-30_18-01-23.jpg'
        }
    ]
    return jsonify({'products': products}), 200

# Netlify serverless handler
def handler(event, context):
    return serverless_wsgi.handle_request(app, event, context)