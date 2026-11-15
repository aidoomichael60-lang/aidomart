# Netlify Python Serverless Entry Point for AIDOMART
from flask import Flask, jsonify, request
import serverless_wsgi
import os

app = Flask(__name__)

app.config['SECRET_KEY'] = os.environ.get('SESSION_SECRET', 'aidomart-secure-secret-key')

@app.before_request
def adjust_path():
    # Handle Netlify serverless function path prefix normalization
    if request.path.startswith('/.netlify/functions/api'):
        path = request.path[len('/.netlify/functions/api'):]
        if not path.startswith('/'):
            path = '/' + path
        request.environ['PATH_INFO'] = path

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    return response

@app.route('/api/health', methods=['GET', 'OPTIONS'])
@app.route('/health', methods=['GET', 'OPTIONS'])
def health():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
    return jsonify({
        'status': 'running on Netlify serverless!',
        'marketplace': 'AIDOMART',
        'version': '1.0.0'
    }), 200

@app.route('/api/auth/login', methods=['POST', 'GET', 'OPTIONS'])
@app.route('/auth/login', methods=['POST', 'GET', 'OPTIONS'])
@app.route('/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200

    # Handle both JSON payloads and form data gracefully
    data = request.get_json(silent=True) or request.form.to_dict() or {}
    email = data.get('email')
    password = data.get('password')

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
        'message': 'Invalid email or password',
        'received': data
    }), 401

@app.route('/api/auth/user', methods=['GET', 'OPTIONS'])
@app.route('/api/auth/me', methods=['GET', 'OPTIONS'])
@app.route('/auth/user', methods=['GET', 'OPTIONS'])
@app.route('/auth/me', methods=['GET', 'OPTIONS'])
@app.route('/user', methods=['GET', 'OPTIONS'])
@app.route('/me', methods=['GET', 'OPTIONS'])
def get_current_user():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
    return jsonify({
        'user': {
            'id': 'admin-01',
            'email': os.environ.get('ADMIN_EMAIL', 'aidoomichael60@gmail.com'),
            'role': 'admin',
            'name': 'Aidoo Michael'
        }
    }), 200

@app.route('/api/marketplace/home', methods=['GET', 'OPTIONS'])
@app.route('/marketplace/home', methods=['GET', 'OPTIONS'])
def marketplace_home():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'OK'}), 200
    return jsonify({
        'success': True,
        'categories': ['clothing', 'electronics', 'shoes', 'sneakers', 'watches', 'Accessories'],
        'featured': []
    }), 200

def handler(event, context):
    return serverless_wsgi.handle_request(app, event, context)