const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 1. SERVE IMAGES STATICALLY
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 2. CONFIGURE STORAGE
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); 
    }
});
const upload = multer({ storage: storage });

// 3. DATABASE CONNECTION
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
});

db.connect(err => {
    if (err) console.error('❌ Error connecting to MySQL:', err);
    else console.log('✅ Connected to MySQL Database');
});

// =================================================
//                 PRODUCT ROUTES
// =================================================

// GET: Fetch All Products
app.get('/api/products', (req, res) => {
    const sql = 'SELECT * FROM products ORDER BY id DESC';
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// GET: Fetch Single Product by ID
app.get('/api/products/:id', (req, res) => {
    const sql = 'SELECT * FROM products WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.length === 0) return res.status(404).json({ error: 'Product not found' });
        res.json(result[0]);
    });
});

// POST: Add Product (Supports Multiple Images)
// Important: 'images' matches the formData.append('images', ...) in admin.html
app.post('/api/products', upload.array('images', 6), (req, res) => {
    console.log("📥 Receiving Product Data with Multiple Images...");
    
    const { name, type, price, old_price, stock, description } = req.body;
    
    // Handle Images
    let mainImage = '';
    let galleryJSON = '[]';

    if (req.files && req.files.length > 0) {
        // The first image becomes the Main Thumbnail
        mainImage = `http://localhost:3000/uploads/${req.files[0].filename}`;
        
        // All images go into the gallery list
        const galleryPaths = req.files.map(file => `http://localhost:3000/uploads/${file.filename}`);
        galleryJSON = JSON.stringify(galleryPaths);
    }

    // Handle empty old_price
    const finalOldPrice = (old_price === "" || old_price === undefined) ? null : old_price;

    const sql = 'INSERT INTO products (name, type, price, old_price, stock, description, image_url, gallery) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    
    db.query(sql, [name, type, price, finalOldPrice, stock, description, mainImage, galleryJSON], (err, result) => {
        if (err) {
            console.error("❌ Insert Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        console.log("✅ Product Added. ID:", result.insertId);
        res.json({ message: 'Product added successfully!' });
    });
});

// DELETE: Delete Product
app.delete('/api/products/:id', (req, res) => {
    const sql = 'DELETE FROM products WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted' });
    });
});

// =================================================
//                 HERO SECTION ROUTES
// =================================================

// GET: Fetch Hero Data
app.get('/api/hero', (req, res) => {
    db.query('SELECT * FROM hero_sections', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// POST: Update Hero Section
// Note: Hero only needs 1 image, so we use upload.single('image')
app.post('/api/hero/:id', upload.single('image'), (req, res) => {
    const id = req.params.id;
    const { title, subtitle, currentImage } = req.body;
    
    const image_url = req.file ? `http://localhost:3000/uploads/${req.file.filename}` : currentImage;

    const sql = 'UPDATE hero_sections SET title = ?, subtitle = ?, image_url = ? WHERE id = ?';
    db.query(sql, [title, subtitle, image_url, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Hero updated successfully!', newImage: image_url });
    });
});


// --- ORDER APIs ---

// POST: Create a New Order
app.post('/api/orders', (req, res) => {
    const { customer_name, phone, address, product_name, total_price } = req.body;
    
    const sql = 'INSERT INTO orders (customer_name, phone, address, product_name, total_price) VALUES (?, ?, ?, ?, ?)';
    
    db.query(sql, [customer_name, phone, address, product_name, total_price], (err, result) => {
        if (err) {
            console.error("❌ Order Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        console.log("✅ New Order Received! ID:", result.insertId);
        res.json({ message: 'Order placed successfully!', orderId: result.insertId });
    });
});

// GET: Fetch All Orders (For Admin Panel later)
app.get('/api/orders', (req, res) => {
    db.query('SELECT * FROM orders ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});


// --- NEW: UPDATE ORDER STATUS ---
app.put('/api/orders/:id', (req, res) => {
    const { status } = req.body;
    // Update the status in the database
    const sql = 'UPDATE orders SET status = ? WHERE id = ?';
    
    db.query(sql, [status, req.params.id], (err, result) => {
        if (err) {
            console.error("❌ Status Update Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Order status updated successfully' });
    });
});

// =================================================
//                 ADMIN AUTH ROUTE
// =================================================

// POST: Login Check
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    // Check if user exists with that password
    const sql = 'SELECT * FROM admin_users WHERE username = ? AND password = ?';
    db.query(sql, [username, password], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (results.length > 0) {
            res.json({ success: true, message: 'Login Successful' });
        } else {
            res.status(401).json({ success: false, message: 'Invalid Credentials' });
        }
    });
});

// POST: Change Password
app.post('/api/admin/password', (req, res) => {
    const { newPassword } = req.body;
    
    // Update the password for the 'admin' user
    const sql = 'UPDATE admin_users SET password = ? WHERE username = "admin"';
    db.query(sql, [newPassword], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Password updated successfully' });
    });
});

// =================================================
//                 START SERVER
// =================================================
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);

});
