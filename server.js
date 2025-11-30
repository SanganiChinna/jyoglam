const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 1. SERVE FRONTEND FILES (Render hosts both)
app.use(express.static(__dirname)); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 2. TiDB DATABASE CONNECTION
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    user: process.env.DB_USER || '3Mj4FGNQXLxC3wd.root',
    password: process.env.DB_PASSWORD || 'VlUMBWuYbgwri6up',
    database: process.env.DB_NAME || 'test',
    port: process.env.DB_PORT || 4000,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    }
});

function handleDisconnect() {
    db.connect(err => {
        if (err) {
            console.error('❌ DB Connect Error:', err);
            setTimeout(handleDisconnect, 2000);
        } else {
            console.log('✅ Connected to TiDB Cloud');
        }
    });
    db.on('error', err => {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') handleDisconnect();
        else throw err;
    });
}
handleDisconnect();

// 3. MULTER STORAGE
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); 
    }
});
const upload = multer({ storage: storage });

// ================= API ROUTES =================

// PRODUCTS
app.get('/api/products', (req, res) => {
    db.query('SELECT * FROM products ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.get('/api/products/:id', (req, res) => {
    db.query('SELECT * FROM products WHERE id = ?', [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(result[0] || {});
    });
});

// POST PRODUCT (Supports Multiple Images)
app.post('/api/products', upload.array('images', 6), (req, res) => {
    const { name, type, price, old_price, stock, description } = req.body;
    let mainImage = '', galleryJSON = '[]';

    if (req.files && req.files.length > 0) {
        // Use relative path for production
        mainImage = `uploads/${req.files[0].filename}`; 
        const galleryPaths = req.files.map(file => `uploads/${file.filename}`);
        galleryJSON = JSON.stringify(galleryPaths);
    }
    
    const finalOldPrice = (old_price === "" || old_price === undefined) ? null : old_price;
    const sql = 'INSERT INTO products (name, type, price, old_price, stock, description, image_url, gallery) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    db.query(sql, [name, type, price, finalOldPrice, stock, description, mainImage, galleryJSON], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Saved' });
    });
});

app.delete('/api/products/:id', (req, res) => {
    db.query('DELETE FROM products WHERE id = ?', [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted' });
    });
});

// HERO SECTIONS
app.get('/api/hero', (req, res) => {
    db.query('SELECT * FROM hero_sections', (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(result);
    });
});

app.post('/api/hero/:id', upload.single('image'), (req, res) => {
    const { title, subtitle, currentImage } = req.body;
    const image_url = req.file ? `uploads/${req.file.filename}` : currentImage;
    const sql = 'UPDATE hero_sections SET title = ?, subtitle = ?, image_url = ? WHERE id = ?';
    db.query(sql, [title, subtitle, image_url, req.params.id], (err, resDB) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Updated', newImage: image_url });
    });
});

// ORDERS
app.post('/api/orders', (req, res) => {
    const { customer_name, phone, address, product_name, total_price } = req.body;
    const sql = 'INSERT INTO orders (customer_name, phone, address, product_name, total_price) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [customer_name, phone, address, product_name, total_price], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Order Placed' });
    });
});

app.get('/api/orders', (req, res) => {
    db.query('SELECT * FROM orders ORDER BY id DESC', (err, resDB) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(resDB);
    });
});

app.put('/api/orders/:id', (req, res) => {
    db.query('UPDATE orders SET status = ? WHERE id = ?', [req.body.status, req.params.id], (err) => res.json({ message: 'Updated' }));
});

// AUTH
app.post('/api/login', (req, res) => {
    db.query('SELECT * FROM admin_users WHERE username = ? AND password = ?', [req.body.username, req.body.password], (err, results) => {
        if (results.length > 0) res.json({ success: true });
        else res.status(401).json({ success: false });
    });
});

app.post('/api/admin/password', (req, res) => {
    db.query('UPDATE admin_users SET password = ? WHERE username = "admin"', [req.body.newPassword], (err) => res.json({ success: true }));
});

// 4. START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

