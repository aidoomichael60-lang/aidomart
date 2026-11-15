# Netlify Python Serverless Entry Point
from flask import Flask, jsonify
import serverless_wsgi

app = Flask(__name__)

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'running on Netlify serverless!'}), 200

def handler(event, context):
    return serverless_wsgi.handle_request(app, event, context)
