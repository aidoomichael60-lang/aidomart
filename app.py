import os
from datetime import datetime
import uuid
from flask import Flask, render_template, redirect, url_for, flash, request, jsonify, abort, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'aidomart-default-secret')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///aidomart.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

UPLOAD_FOLDER = 'static/uploads/products'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'mp4', 'mov', 'avi'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ==================== DATABASE MODELS ====================
class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), default='customer')
    
    is_email_verified = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    seller_profile = db.relationship('SellerProfile', backref='user', uselist=False, cascade='all, delete-orphan')
    notifications = db.relationship('Notification', backref='user', cascade='all, delete-orphan')
    orders = db.relationship('Order', backref='customer', cascade='all, delete-orphan')
    support_requests = db.relationship('SupportRequest', backref='customer', cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class SellerProfile(db.Model):
    __tablename__ = 'seller_profiles'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    business_name = db.Column(db.String(150), nullable=False)
    business_description = db.Column(db.Text, nullable=True)
    whatsapp_number = db.Column(db.String(30), nullable=False)
    shop_location = db.Column(db.String(255), nullable=True)
    what_they_sell = db.Column(db.String(255), nullable=True)
    social_handles = db.Column(db.String(255), nullable=True)
    profile_image = db.Column(db.String(255), nullable=True, default='image/branding/favicon.png')
    application_status = db.Column(db.String(30), default='Pending Review')
    is_verified = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    momo_provider = db.Column(db.String(50), nullable=True)
    momo_account_name = db.Column(db.String(150), nullable=True)
    momo_number = db.Column(db.String(30), nullable=True)
    momo_instructions = db.Column(db.Text, nullable=True)
    
    bank_name = db.Column(db.String(150), nullable=True)
    bank_account_name = db.Column(db.String(150), nullable=True)
    bank_account_number = db.Column(db.String(50), nullable=True)
    bank_branch = db.Column(db.String(150), nullable=True)
    bank_instructions = db.Column(db.Text, nullable=True)
    
    other_payment_info = db.Column(db.Text, nullable=True)
    is_payment_active = db.Column(db.Boolean, default=True)

    products = db.relationship('Product', backref='seller_profile_ref', cascade='all, delete-orphan')


class Product(db.Model):
    __tablename__ = 'products'
    id = db.Column(db.Integer, primary_key=True)
    seller_id = db.Column(db.Integer, db.ForeignKey('seller_profiles.id'), nullable=False)
    name = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    price = db.Column(db.Float, nullable=False)
    stock = db.Column(db.Integer, default=0)
    image_filename = db.Column(db.String(200), nullable=True)
    is_published = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    images = db.relationship('ProductImage', backref='product', cascade='all, delete-orphan')


class ProductImage(db.Model):
    __tablename__ = 'product_images'
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    image_filename = db.Column(db.String(255), nullable=False)


class Order(db.Model):
    __tablename__ = 'orders'
    id = db.Column(db.Integer, primary_key=True)
    order_reference = db.Column(db.String(50), unique=True, nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    total_amount = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(50), default='Order Placed — Awaiting Processing')
    payment_status = db.Column(db.String(50), default='Not Reported')
    delivery_address = db.Column(db.Text, nullable=False)
    delivery_method = db.Column(db.String(50), default='Standard Delivery')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    items = db.relationship('OrderItem', backref='order', cascade='all, delete-orphan')
    payment_records = db.relationship('PaymentRecord', backref='order_ref', cascade='all, delete-orphan')


class OrderItem(db.Model):
    __tablename__ = 'order_items'
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('orders.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Float, nullable=False)

    product = db.relationship('Product', backref='order_items') # <--- FIXED HERE


class PaymentRecord(db.Model):
    __tablename__ = 'payment_records'
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('orders.id'), nullable=False)
    seller_id = db.Column(db.Integer, db.ForeignKey('seller_profiles.id'), nullable=True)
    amount_due = db.Column(db.Float, nullable=False)
    amount_reported = db.Column(db.Float, nullable=True)
    amount_confirmed = db.Column(db.Float, nullable=True)
    payment_method = db.Column(db.String(100), nullable=True)
    recipient_snapshot = db.Column(db.Text, nullable=True)
    reference = db.Column(db.String(100), nullable=True)
    status = db.Column(db.String(50), default='Not Reported')
    verification_notes = db.Column(db.Text, nullable=True)
    reported_at = db.Column(db.DateTime, nullable=True)
    verified_at = db.Column(db.DateTime, nullable=True)
    verified_by_user_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    seller = db.relationship('SellerProfile', backref='payment_records')


class SupportRequest(db.Model):
    __tablename__ = 'support_requests'
    id = db.Column(db.Integer, primary_key=True)
    reference_number = db.Column(db.String(32), unique=True, nullable=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    full_name = db.Column(db.String(100), nullable=True)
    email = db.Column(db.String(120), nullable=True)
    issue_category = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(50), default='New')
    admin_notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Notification(db.Model):
    __tablename__ = 'notifications'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(150), nullable=False)
    message = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


def generate_order_reference():
    while True:
        ref = f"AID-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        if not Order.query.filter_by(order_reference=ref).first():
            return ref


# ==================== APPLICATION ROUTES ====================
@app.route('/')
def index():
    products = Product.query.filter_by(is_published=True).order_by(Product.created_at.desc()).limit(8).all()
    sellers = SellerProfile.query.filter_by(is_verified=True).limit(6).all()
    return render_template('index.html', products=products, sellers=sellers)


@app.route('/shop')
def shop():
    category = request.args.get('category')
    query = request.args.get('q')
    products_query = Product.query.filter_by(is_published=True)
    if category:
        products_query = products_query.filter_by(category=category)
    if query:
        products_query = products_query.filter(Product.name.ilike(f"%{query}%"))
    products = products_query.all()
    return render_template('shop.html', products=products, selected_category=category)


@app.route('/product/<int:product_id>')
def product_detail(product_id):
    product = Product.query.get_or_404(product_id)
    return render_template('product_detail.html', product=product)


@app.route('/terms')
def terms():
    return render_template('terms.html')


@app.route('/privacy')
def privacy():
    return render_template('privacy.html')


@app.route('/contact-admin', methods=['GET', 'POST'])
def contact_admin():
    admin_info = {
        "display_name": "AIDOMART Marketplace Administrator",
        "name": "Michael Aidoo",
        "phone": "0205283752",
        "whatsapp_number": "+233205283752",
        "email": "aidoomichael60@gmail.com"
    }
    if request.method == 'POST':
        full_name = request.form.get('full_name') or (current_user.name if current_user.is_authenticated else 'Guest')
        email = request.form.get('email') or (current_user.email if current_user.is_authenticated else 'guest@aidomart.com')
        issue_category = request.form.get('issue_category')
        description = request.form.get('description')

        if not issue_category or not description:
            flash('Please select an issue category and provide a description.', 'danger')
            return redirect(url_for('contact_admin'))

        ref_no = 'AID-SUP-' + uuid.uuid4().hex[:8].upper()
        support = SupportRequest(
            reference_number=ref_no,
            customer_id=current_user.id if current_user.is_authenticated else None,
            full_name=full_name,
            email=email,
            issue_category=issue_category,
            description=description,
            status='New'
        )
        db.session.add(support)
        db.session.commit()
        flash(f'Support request submitted successfully! Your reference number is {ref_no}.', 'success')
        return redirect(url_for('contact_admin'))

    return render_template('contact_admin.html', admin=admin_info)


@app.route('/admin/enquiries')
@login_required
def admin_enquiries():
    if current_user.role != 'admin':
        flash('Unauthorized access.', 'danger')
        return redirect(url_for('index'))
    status_filter = request.args.get('status', 'All')
    if status_filter != 'All':
        tickets = SupportRequest.query.filter_by(status=status_filter).order_by(SupportRequest.created_at.desc()).all()
    else:
        tickets = SupportRequest.query.order_by(SupportRequest.created_at.desc()).all()
    return render_template('admin_enquiries.html', tickets=tickets, current_status=status_filter)


@app.route('/admin/enquiry/<int:ticket_id>/update', methods=['POST'])
@login_required
def update_enquiry(ticket_id):
    if current_user.role != 'admin':
        flash('Unauthorized access.', 'danger')
        return redirect(url_for('index'))
    ticket = SupportRequest.query.get_or_404(ticket_id)
    ticket.status = request.form.get('status')
    ticket.admin_notes = request.form.get('admin_notes')
    db.session.commit()
    flash(f'Enquiry {ticket.reference_number} updated successfully.', 'success')
    return redirect(url_for('admin_enquiries'))


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        confirm_password = request.form.get('confirm_password', '')
        role = request.form.get('role', 'customer')
        
        if not name or not email or not password:
            flash('All required fields must be completed.', 'danger')
            return redirect(url_for('register'))
            
        if password != confirm_password:
            flash('Passwords do not match.', 'danger')
            return redirect(url_for('register'))
            
        if User.query.filter_by(email=email).first():
            flash('Email address is already registered.', 'danger')
            return redirect(url_for('register'))
            
        business_name = request.form.get('business_name', '').strip()
        whatsapp_number = request.form.get('whatsapp_number', '').strip()
        business_description = request.form.get('business_description', '').strip()

        user = User(name=name, email=email, role=role)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        
        if role == 'seller':
            profile_img_path = 'image/branding/favicon.png'
            profile_file = request.files.get('profile_image')
            if profile_file and allowed_file(profile_file.filename):
                filename = secure_filename(f"seller_{user.id}_{uuid.uuid4().hex[:6]}_{profile_file.filename}")
                os.makedirs(UPLOAD_FOLDER, exist_ok=True)
                profile_file.save(os.path.join(UPLOAD_FOLDER, filename))
                profile_img_path = f"uploads/products/{filename}"

            seller = SellerProfile(
                user_id=user.id,
                business_name=business_name,
                whatsapp_number=whatsapp_number,
                business_description=business_description,
                profile_image=profile_img_path,
                application_status='Pending Review',
                is_verified=False
            )
            db.session.add(seller)
            db.session.commit()
            
        flash('Account created successfully! Please log in.', 'success')
        return redirect(url_for('login'))
        
    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        user = User.query.filter_by(email=email).first()
        
        if user and user.check_password(password):
            login_user(user)
            flash(f'Welcome back, {user.name}!', 'success')
            if user.role == 'admin':
                return redirect(url_for('admin_dashboard'))
            elif user.role == 'seller':
                return redirect(url_for('seller_dashboard'))
            return redirect(url_for('customer_dashboard'))
            
        flash('Invalid email address or password.', 'danger')
    return render_template('login.html')


@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Logged out successfully.', 'info')
    return redirect(url_for('index'))


@app.route('/customer/dashboard')
@login_required
def customer_dashboard():
    if current_user.role != 'customer':
        return redirect(url_for('index'))
    orders = Order.query.filter_by(customer_id=current_user.id).order_by(Order.created_at.desc()).all()
    return render_template('customer_dashboard.html', orders=orders)


@app.route('/seller/profile', methods=['GET', 'POST'])
@login_required
def seller_profile_settings():
    if current_user.role != 'seller' or not current_user.seller_profile:
        flash('Access denied.', 'warning')
        return redirect(url_for('index'))
        
    seller = current_user.seller_profile
    if request.method == 'POST':
        seller.business_name = request.form.get('business_name', '').strip()
        seller.whatsapp_number = request.form.get('whatsapp_number', '').strip()
        seller.shop_location = request.form.get('shop_location', '').strip()
        seller.what_they_sell = request.form.get('what_they_sell', '').strip()
        seller.social_handles = request.form.get('social_handles', '').strip()
        seller.business_description = request.form.get('business_description', '').strip()
        
        profile_file = request.files.get('profile_image')
        if profile_file and allowed_file(profile_file.filename):
            filename = secure_filename(f"seller_{current_user.id}_{uuid.uuid4().hex[:6]}_{profile_file.filename}")
            os.makedirs(UPLOAD_FOLDER, exist_ok=True)
            profile_file.save(os.path.join(UPLOAD_FOLDER, filename))
            seller.profile_image = f"uploads/products/{filename}"
            
        db.session.commit()
        flash('Store profile updated successfully!', 'success')
        return redirect(url_for('seller_profile_settings'))
        
    return render_template('seller_profile.html', seller=seller)


@app.route('/seller/payment-settings', methods=['GET', 'POST'])
@login_required
def seller_payment_settings():
    if current_user.role != 'seller' or not current_user.seller_profile:
        flash('Access denied.', 'warning')
        return redirect(url_for('index'))
        
    seller = current_user.seller_profile
    if request.method == 'POST':
        seller.momo_provider = request.form.get('momo_provider', '').strip()
        seller.momo_account_name = request.form.get('momo_account_name', '').strip()
        seller.momo_number = request.form.get('momo_number', '').strip()
        seller.momo_instructions = request.form.get('momo_instructions', '').strip()
        
        seller.bank_name = request.form.get('bank_name', '').strip()
        seller.bank_account_name = request.form.get('bank_account_name', '').strip()
        seller.bank_account_number = request.form.get('bank_account_number', '').strip()
        seller.bank_branch = request.form.get('bank_branch', '').strip()
        seller.bank_instructions = request.form.get('bank_instructions', '').strip()
        
        seller.other_payment_info = request.form.get('other_payment_info', '').strip()
        seller.is_payment_active = True if request.form.get('is_payment_active') else False
        
        db.session.commit()
        flash('Manual payment settings updated successfully!', 'success')
        return redirect(url_for('seller_payment_settings'))
        
    return render_template('seller_payment_settings.html', seller=seller)


@app.route('/seller/dashboard', methods=['GET', 'POST'])
@login_required
def seller_dashboard():
    if current_user.role != 'seller' or not current_user.seller_profile:
        return redirect(url_for('index'))
        
    seller = current_user.seller_profile
    if request.method == 'POST':
        action = request.form.get('action')
        
        if action == 'update_order_status':
            order_id = request.form.get('order_id')
            new_status = request.form.get('new_status')
            order = Order.query.get_or_404(order_id)
            
            has_items = any(item.product.seller_id == seller.id for item in order.items)
            if not has_items:
                abort(403)
                
            order.status = new_status
            
            notif = Notification(
                user_id=order.customer_id,
                title=f"Order Update: {order.order_reference}",
                message=f"Your order status has been updated to: {new_status}"
            )
            db.session.add(notif)
            db.session.commit()
            
            flash(f'Order {order.order_reference} status updated to "{new_status}" successfully!', 'success')
            return redirect(url_for('seller_dashboard'))

        if action == 'verify_payment_report':
            payment_id = request.form.get('payment_id')
            verification_action = request.form.get('verification_action')
            verification_notes = request.form.get('verification_notes', '').strip()
            
            payment = PaymentRecord.query.get_or_404(payment_id)
            if payment.seller_id != seller.id:
                abort(403)
                
            payment.verified_at = datetime.utcnow()
            payment.verified_by_user_id = current_user.id
            payment.verification_notes = verification_notes
            
            if verification_action == 'confirm':
                payment.status = 'Payment Confirmed'
                payment.amount_confirmed = payment.amount_reported or payment.amount_due
                flash('Payment successfully confirmed!', 'success')
            elif verification_action == 'not_received':
                payment.status = 'Payment Not Received'
                flash('Payment marked as not received.', 'warning')
            elif verification_action == 'mismatch':
                payment.status = 'Payment Amount Mismatch'
                flash('Payment marked as amount mismatch.', 'warning')
            elif verification_action == 'review':
                payment.status = 'Payment Under Review'
                flash('Payment placed under review.', 'info')
                
            order = payment.order_ref
            all_records = order.payment_records
            if all(pr.status == 'Payment Confirmed' for pr in all_records):
                order.payment_status = 'Payment Confirmed'
                order.status = 'Processing / Paid'
            elif any(pr.status in ['Payment Not Received', 'Payment Amount Mismatch'] for pr in all_records):
                order.payment_status = 'Discrepancy Flagged'
            else:
                order.payment_status = 'Payment Reported — Awaiting Verification'
                
            notif = Notification(
                user_id=order.customer_id,
                title=f"Payment Update: {order.order_reference}",
                message=f"Your payment status has been updated: {payment.status}"
            )
            db.session.add(notif)
            db.session.commit()
            return redirect(url_for('seller_dashboard'))
            
        if not seller.is_verified and seller.application_status != 'Approved':
            flash('Your store must be approved before listing products.', 'warning')
            return redirect(url_for('seller_dashboard'))
            
        name = request.form.get('name')
        description = request.form.get('description')
        category = request.form.get('category')
        price = float(request.form.get('price'))
        stock = int(request.form.get('stock'))
        
        product = Product(
            seller_id=seller.id,
            name=name,
            description=description,
            category=category,
            price=price,
            stock=stock
        )
        db.session.add(product)
        db.session.flush()
        
        uploaded_files = request.files.getlist('product_images')
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        saved_image_paths = []
        for file in uploaded_files[:10]:
            if file and allowed_file(file.filename):
                filename = secure_filename(f"prod_{product.id}_{uuid.uuid4().hex[:6]}_{file.filename}")
                file.save(os.path.join(UPLOAD_FOLDER, filename))
                rel_path = f"uploads/products/{filename}"
                saved_image_paths.append(rel_path)
                db.session.add(ProductImage(product_id=product.id, image_filename=rel_path))
                
        selected_main_index = request.form.get('main_image_choice')
        if selected_main_index is not None and selected_main_index.isdigit():
            idx = int(selected_main_index)
            if idx < len(saved_image_paths):
                product.image_filename = saved_image_paths[idx]
        elif saved_image_paths:
            product.image_filename = saved_image_paths[0]
        else:
            product.image_filename = 'image/branding/favicon.png'
                
        db.session.commit()
        flash('Product listed successfully!', 'success')
        return redirect(url_for('seller_dashboard'))
        
    products = Product.query.filter_by(seller_id=seller.id).all()
    payment_reports = PaymentRecord.query.filter_by(seller_id=seller.id).order_by(PaymentRecord.created_at.desc()).all()
    
    seller_product_ids = [p.id for p in products]
    seller_order_items = OrderItem.query.filter(OrderItem.product_id.in_(seller_product_ids)).all() if seller_product_ids else []
    seller_order_ids = list(set([item.order_id for item in seller_order_items]))
    seller_orders = Order.query.filter(Order.id.in_(seller_order_ids)).order_by(Order.created_at.desc()).all() if seller_order_ids else []

    return render_template('seller_dashboard.html', seller=seller, products=products, payment_reports=payment_reports, seller_orders=seller_orders)


@app.route('/admin/dashboard', methods=['GET', 'POST'])
@login_required
def admin_dashboard():
    if current_user.role != 'admin':
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        action = request.form.get('action')
        target_id = request.form.get('target_id')
        if action == 'verify_seller':
            seller = SellerProfile.query.get(target_id)
            if seller:
                seller.is_verified = True
                seller.application_status = 'Approved'
                db.session.commit()
                flash(f'Seller "{seller.business_name}" approved!', 'success')
                
    users = User.query.all()
    sellers = SellerProfile.query.all()
    orders = Order.query.all()
    payments = PaymentRecord.query.all()
    support_requests = SupportRequest.query.all()
    return render_template('admin_dashboard.html', users=users, sellers=sellers, orders=orders, payments=payments, support_requests=support_requests)


# ==================== CART & CHECKOUT ====================
@app.route('/cart')
def cart():
    cart_data = session.get('cart', {})
    cart_items = []
    total_amount = 0.0
    for prod_id_str, item_info in cart_data.items():
        product = Product.query.get(int(item_info['product_id']))
        if product:
            price = product.price
            subtotal = price * item_info['quantity']
            total_amount += subtotal
            cart_items.append({
                'product': product,
                'quantity': item_info['quantity'],
                'price': price,
                'subtotal': subtotal,
                'cart_key': prod_id_str
            })
    return render_template('cart.html', cart_items=cart_items, total_amount=total_amount)


@app.route('/cart/add/<int:product_id>', methods=['POST'])
def add_to_cart(product_id):
    product = Product.query.get_or_404(product_id)
    quantity = int(request.form.get('quantity', 1))
    
    if 'cart' not in session:
        session['cart'] = {}
        
    cart = session['cart']
    cart_key = str(product_id)
    
    if cart_key in cart:
        cart[cart_key]['quantity'] += quantity
    else:
        cart[cart_key] = {
            'product_id': product_id,
            'quantity': quantity
        }
        
    session.modified = True
    flash('Product added to your shopping cart 🛒 successfully!', 'success')
    return redirect(url_for('cart'))


@app.route('/cart/remove/<cart_key>', methods=['POST'])
def remove_from_cart(cart_key):
    cart = session.get('cart', {})
    if cart_key in cart:
        del cart[cart_key]
        session.modified = True
        flash('Item removed from cart.', 'info')
    return redirect(url_for('cart'))


@app.route('/checkout', methods=['GET', 'POST'])
@login_required
def checkout():
    if current_user.role != 'customer':
        flash('Only customers can place orders.', 'warning')
        return redirect(url_for('index'))
        
    cart_data = session.get('cart', {})
    if not cart_data:
        flash('Your cart is empty.', 'warning')
        return redirect(url_for('shop'))
        
    seller_totals = {}
    seller_items = {}
    total_amount = 0.0
    
    for prod_id_str, item_info in cart_data.items():
        product = Product.query.get(int(item_info['product_id']))
        if product:
            seller = product.seller_profile_ref
            subtotal = product.price * item_info['quantity']
            total_amount += subtotal
            
            if seller.id not in seller_totals:
                seller_totals[seller.id] = 0.0
                seller_items[seller.id] = []
            seller_totals[seller.id] += subtotal
            seller_items[seller.id].append({
                'product': product,
                'quantity': item_info['quantity'],
                'price': product.price,
                'subtotal': subtotal
            })

    if request.method == 'POST':
        delivery_address = request.form.get('delivery_address', '').strip()
        delivery_method = request.form.get('delivery_method', 'Standard Delivery')
        
        if not delivery_address:
            flash('Delivery address is required.', 'danger')
            return redirect(url_for('checkout'))
            
        order_ref = generate_order_reference()
        order = Order(
            order_reference=order_ref,
            customer_id=current_user.id,
            total_amount=total_amount,
            delivery_address=delivery_address,
            delivery_method=delivery_method,
            status='Order Placed — Awaiting Processing',
            payment_status='Not Reported'
        )
        db.session.add(order)
        db.session.flush()
        
        for seller_id, amt in seller_totals.items():
            seller = SellerProfile.query.get(seller_id)
            recipient_snapshot = f"Business: {seller.business_name} | MoMo: {seller.momo_provider} - {seller.momo_number} ({seller.momo_account_name}) | Bank: {seller.bank_name} - {seller.bank_account_number} ({seller.bank_account_name})"
            
            pay_record = PaymentRecord(
                order_id=order.id,
                seller_id=seller.id,
                amount_due=amt,
                payment_method='Mobile Money / Bank Transfer',
                recipient_snapshot=recipient_snapshot,
                status='Not Reported'
            )
            db.session.add(pay_record)
            
            for item in seller_items[seller_id]:
                oi = OrderItem(
                    order_id=order.id,
                    product_id=item['product'].id,
                    quantity=item['quantity'],
                    price=item['price']
                )
                db.session.add(oi)
                
            notif = Notification(
                user_id=seller.user_id,
                title=f"New Order Received! [{order_ref}]",
                message=f"You have a new order worth GH₵ {amt:.2f}. Please review and prepare fulfillment."
            )
            db.session.add(notif)
                
        db.session.commit()
        session.pop('cart', None)
        flash(f'Order placed successfully! Reference: {order_ref}.', 'success')
        return redirect(url_for('order_details', order_id=order.id))

    return render_template('checkout.html', seller_items=seller_items, seller_totals=seller_totals, total_amount=total_amount)


@app.route('/order/<int:order_id>')
@login_required
def order_details(order_id):
    order = Order.query.get_or_404(order_id)
    if current_user.role == 'customer' and order.customer_id != current_user.id:
        abort(403)
    return render_template('order_details.html', order=order)


@app.route('/order/report-payment/<int:payment_record_id>', methods=['POST'])
@login_required
def report_payment(payment_record_id):
    payment_record = PaymentRecord.query.get_or_404(payment_record_id)
    order = payment_record.order_ref
    
    if current_user.role != 'customer' or order.customer_id != current_user.id:
        abort(403)
        
    payment_method = request.form.get('payment_method')
    amount_reported = float(request.form.get('amount_reported', 0))
    reference = request.form.get('reference', '').strip()
    
    payment_record.payment_method = payment_method
    payment_record.amount_reported = amount_reported
    payment_record.reference = reference
    payment_record.status = 'Payment Reported — Awaiting Seller Verification'
    payment_record.reported_at = datetime.utcnow()
    
    order.payment_status = 'Payment Reported — Awaiting Verification'
    
    if payment_record.seller and payment_record.seller.user_id:
        notif = Notification(
            user_id=payment_record.seller.user_id,
            title=f"Payment Reported [{order.order_reference}]",
            message=f"Customer reported payment of GH₵ {amount_reported:.2f}. Please check your account."
        )
        db.session.add(notif)
        
    db.session.commit()
    flash('Payment reported successfully!', 'success')
    return redirect(url_for('order_details', order_id=order.id))


@app.route('/api/notifications')
@login_required
def get_notifications():
    notifications = Notification.query.filter_by(user_id=current_user.id).order_by(Notification.created_at.desc()).all()
    unread_count = Notification.query.filter_by(user_id=current_user.id, is_read=False).count()
    return jsonify({
        'unread_count': unread_count,
        'notifications': [{
            'id': n.id,
            'title': n.title,
            'message': n.message,
            'is_read': n.is_read,
            'created_at': n.created_at.strftime('%Y-%m-%d %H:%M')
        } for n in notifications]
    })


@app.route('/api/notifications/mark-read/<int:notif_id>', methods=['POST'])
@login_required
def mark_notification_read(notif_id):
    notif = Notification.query.filter_by(id=notif_id, user_id=current_user.id).first()
    if notif:
        notif.is_read = True
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'success': False}), 404


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        admin_email = 'aidoomichael60@gmail.com'
        if not User.query.filter_by(email=admin_email).first():
            admin_user = User(name='Michael Aidoo', email=admin_email, role='admin', is_email_verified=True)
            admin_user.set_password('MichaelAID60@')
            db.session.add(admin_user)
            db.session.commit()
    app.run(debug=True, threaded=True)