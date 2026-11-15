# Netlify Python Serverless Entry Point for AIDOMART
from flask import Flask, jsonify, request
import serverless_wsgi
import os

app = Flask(__name__)

# Basic configuration
app.config['SECRET_KEY'] = os.environ.get('SESSION_SECRET', 'aidomart-secure-secret-key')

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'running on Netlify serverless!',
        'marketplace': 'AIDOMART',
        'version': '1.0.0'
    }), 200

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')

    # Admin credentials verification
    admin_email = os.environ.get('ADMIN_EMAIL', 'aidoomichael60@gmail.com')
    
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
    
    return jsonify({
        'success': False,
        'message': 'Invalid email or password'
    }), 401

@app.route('/api/marketplace/products', methods=['GET'])
def get_products():
    # Sample marketplace items (iPhones, laptops, apparel for Home Of Styles)
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

# Netlify serverless handler using serverless-wsgi
def handler(event, context):
    return serverless_wsgi.handle_request(app, event, context)