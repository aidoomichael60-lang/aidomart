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
        # Strip the prefix so Flask routes match correctly
        path = request.path[len('/.netlify/functions/api'):]
        if not path.startswith('/'):
            path = '/' + path
        request.environ['PATH_INFO'] = path

@app.route('/api/health', methods=['GET'])
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'running on Netlify serverless!',
        'marketplace': 'AIDOMART',
        'version': '1.0.0'
    }), 200

@app.route('/api/auth/login', methods=['POST'])
@app.route('/auth/login', methods=['POST'])
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
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
        'message': 'Invalid email or password'
    }), 401

@app.route('/api/auth/user', methods=['GET'])
@app.route('/auth/user', methods=['GET'])
@app.route('/user', methods=['GET'])
def get_current_user():
    return jsonify({
        'user': {
            'id': 'admin-01',
            'email': os.environ.get('ADMIN_EMAIL', 'aidoomichael60@gmail.com'),
            'role': 'admin',
            'name': 'Aidoo Michael'
        }
    }), 200

def handler(event, context):
    return serverless_wsgi.handle_request(app, event, context)