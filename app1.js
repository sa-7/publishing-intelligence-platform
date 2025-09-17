// app.js - Fixed backend server with all API routes
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// File upload configuration
const upload = multer({ dest: 'uploads/' });

// Database setup
const db = new sqlite3.Database('./publishing_data.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    const tables = [
        `CREATE TABLE IF NOT EXISTS universities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS journal_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            university_id INTEGER,
            journal_title TEXT NOT NULL,
            journal_abbreviation TEXT,
            current_year INTEGER DEFAULT 0,
            previous_year INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (university_id) REFERENCES universities (id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS journal_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            university_id INTEGER,
            journal_title TEXT NOT NULL,
            publisher TEXT,
            usage_date TEXT,
            total_requests INTEGER DEFAULT 0,
            unique_requests INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (university_id) REFERENCES universities (id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS books_purchased (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            university_id INTEGER,
            book_code TEXT,
            book_title TEXT NOT NULL,
            year INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (university_id) REFERENCES universities (id)
        )`
    ];

    tables.forEach(sql => {
        db.run(sql, (err) => {
            if (err) console.error('Error creating table:', err);
        });
    });
    
    // Insert default universities
    insertDefaultUniversities();
}

function insertDefaultUniversities() {
    const universities = [
        { code: 'nus', name: 'National University of Singapore' },
        { code: 'ntu', name: 'Nanyang Technological University' },
        { code: 'mahidol', name: 'Mahidol University' },
        { code: 'aalborg', name: 'Aalborg University' }
    ];

    universities.forEach(uni => {
        db.run(
            'INSERT OR IGNORE INTO universities (code, name) VALUES (?, ?)',
            [uni.code, uni.name],
            function(err) {
                if (err) console.error('Error inserting university:', err);
            }
        );
    });
}

// API Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        database: 'Connected'
    });
});

// API root endpoint - this was missing
app.get('/api', (req, res) => {
    res.json({
        message: 'Publishing Intelligence Platform API',
        version: '1.0.0',
        status: 'Active',
        endpoints: {
            health: '/health',
            dashboard: '/api/dashboard',
            universities: '/api/universities',
            subscriptions: '/api/subscriptions',
            usage: '/api/usage',
            chat: '/api/chat (POST)',
            upload: '/api/upload (POST)'
        }
    });
});

// Get all universities
app.get('/api/universities', (req, res) => {
    db.all('SELECT * FROM universities ORDER BY name', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get dashboard data
app.get('/api/dashboard', (req, res) => {
    const queries = [
        'SELECT COUNT(*) as total_universities FROM universities',
        'SELECT COUNT(*) as total_subscriptions FROM journal_subscriptions WHERE current_year = 1',
        'SELECT COUNT(*) as total_usage_records FROM journal_usage',
        'SELECT university_id, COUNT(*) as subscription_count FROM journal_subscriptions WHERE current_year = 1 GROUP BY university_id'
    ];

    Promise.all(queries.map(query => 
        new Promise((resolve, reject) => {
            db.all(query, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        })
    )).then(results => {
        const [universities, subscriptions, usage, universityBreakdown] = results;
        
        res.json({
            totalUniversities: universities[0].total_universities,
            totalSubscriptions: subscriptions[0].total_subscriptions,
            totalUsage: usage[0].total_usage_records,
            universityBreakdown: universityBreakdown,
            revenuePotential: calculateRevenuePotential(universityBreakdown)
        });
    }).catch(err => {
        res.status(500).json({ error: err.message });
    });
});

// Get subscriptions data
app.get('/api/subscriptions', (req, res) => {
    const university = req.query.university;
    let query = `
        SELECT js.*, u.name as university_name, u.code as university_code
        FROM journal_subscriptions js
        JOIN universities u ON js.university_id = u.id
    `;
    
    const params = [];
    if (university && university !== 'all') {
        query += ' WHERE u.code = ?';
        params.push(university);
    }
    
    query += ' ORDER BY u.name, js.journal_title';

    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get usage analytics
app.get('/api/usage', (req, res) => {
    const query = `
        SELECT ju.*, u.name as university_name
        FROM journal_usage ju
        JOIN universities u ON ju.university_id = u.id
        ORDER BY ju.usage_date DESC
        LIMIT 1000
    `;

    db.all(query, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// AI Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, context } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        // Get data context from database
        const dataContext = await getDatabaseContext();
        
        // Generate AI response
        let response;
        if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
            response = await generateOpenAIResponse(message, dataContext);
        } else {
            response = generateRuleBasedResponse(message, dataContext);
        }
        
        res.json({ response, context: dataContext });
        
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ 
            error: 'Error generating response',
            response: 'I apologize, but I encountered an error processing your request. Please try again.'
        });
    }
});

// Upload Excel file and process data
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { university } = req.body;
        const filePath = req.file.path;
        
        // Process Excel file
        const result = await processExcelFile(filePath, university);
        
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        
        res.json({ 
            message: 'File processed successfully', 
            university,
            recordsProcessed: result.recordsProcessed
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Error processing file' });
    }
});

// Helper functions
function calculateRevenuePotential(universityBreakdown) {
    if (!universityBreakdown || universityBreakdown.length === 0) return 0;
    
    const averageSubscriptions = universityBreakdown.reduce((sum, uni) => sum + uni.subscription_count, 0) / universityBreakdown.length;
    const potentialGap = Math.max(0, 150 - averageSubscriptions);
    return Math.round(potentialGap * universityBreakdown.length * 5000);
}

async function getDatabaseContext() {
    return new Promise((resolve, reject) => {
        const queries = [
            'SELECT COUNT(*) as count FROM universities',
            'SELECT COUNT(*) as count FROM journal_subscriptions WHERE current_year = 1',
            'SELECT u.name, COUNT(js.id) as subscription_count FROM universities u LEFT JOIN journal_subscriptions js ON u.id = js.university_id AND js.current_year = 1 GROUP BY u.id, u.name'
        ];

        Promise.all(queries.map(query => 
            new Promise((resolve, reject) => {
                db.all(query, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            })
        )).then(results => {
            const [universities, subscriptions, breakdown] = results;
            resolve({
                totalUniversities: universities[0].count,
                totalSubscriptions: subscriptions[0].count,
                universityBreakdown: breakdown
            });
        }).catch(reject);
    });
}

async function generateOpenAIResponse(message, context) {
    try {
        const { OpenAI } = require('openai');
        
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const prompt = `You are an AI assistant for World Scientific Publishing. 
        
Current data context:
- Total universities: ${context.totalUniversities}
- Active subscriptions: ${context.totalSubscriptions}
- University breakdown: ${JSON.stringify(context.universityBreakdown)}

User question: ${message}

Provide a helpful, specific answer based on the publishing data. Focus on actionable insights for revenue opportunities, subscription patterns, and market gaps.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 500,
            temperature: 0.7,
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI API error:', error);
        return generateRuleBasedResponse(message, context);
    }
}

function generateRuleBasedResponse(message, context) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('revenue') || lowerMessage.includes('opportunity')) {
        const potential = calculateRevenuePotential(context.universityBreakdown);
        return `Based on current subscription patterns across ${context.totalUniversities} universities, I've identified approximately $${potential.toLocaleString()} in revenue opportunities. Key areas for expansion include AI/ML journals, Climate Science, and Digital Humanities collections.`;
    }
    
    if (lowerMessage.includes('subscription') || lowerMessage.includes('journal')) {
        const breakdown = context.universityBreakdown.map(u => `${u.name}: ${u.subscription_count} subscriptions`).join(', ');
        return `Currently tracking ${context.totalSubscriptions} active subscriptions across ${context.totalUniversities} universities. Distribution: ${breakdown}.`;
    }
    
    if (lowerMessage.includes('gap') || lowerMessage.includes('missing')) {
        return `Gap analysis shows opportunities in emerging fields like AI & Machine Learning, Quantum Computing, and Climate Science. Universities with fewer than 100 subscriptions have the highest expansion potential.`;
    }
    
    if (lowerMessage.includes('usage') || lowerMessage.includes('trend')) {
        return `Usage analytics indicate seasonal patterns with peak activity during academic terms. Digital access dominates with approximately 85% of total usage. Consider targeted campaigns during high-usage periods.`;
    }
    
    return `I can help analyze your publishing data covering ${context.totalUniversities} universities and ${context.totalSubscriptions} active subscriptions. Ask about revenue opportunities, subscription patterns, gap analysis, or specific universities.`;
}

async function processExcelFile(filePath, universityCode) {
    return new Promise((resolve, reject) => {
        try {
            const workbook = XLSX.readFile(filePath);
            let recordsProcessed = 0;

            db.get('SELECT id FROM universities WHERE code = ?', [universityCode], (err, university) => {
                if (err || !university) {
                    reject(new Error('University not found'));
                    return;
                }

                const universityId = university.id;

                workbook.SheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    const data = XLSX.utils.sheet_to_json(sheet);

                    if (sheetName.includes('Subscription')) {
                        processSubscriptionData(data, universityId);
                        recordsProcessed += data.length;
                    } else if (sheetName.includes('Usage')) {
                        processUsageData(data, universityId);
                        recordsProcessed += data.length;
                    } else if (sheetName.includes('Book')) {
                        processBookData(data, universityId);
                        recordsProcessed += data.length;
                    }
                });

                resolve({ recordsProcessed });
            });
        } catch (error) {
            reject(error);
        }
    });
}

function processSubscriptionData(data, universityId) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO journal_subscriptions 
        (university_id, journal_title, journal_abbreviation, current_year, previous_year)
        VALUES (?, ?, ?, ?, ?)
    `);

    data.forEach(row => {
        stmt.run([
            universityId,
            row.journal_title || '',
            row.journal_abbreviation || '',
            row.current_year || 0,
            row.previous_year || 0
        ]);
    });

    stmt.finalize();
}

function processUsageData(data, universityId) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO journal_usage 
        (university_id, journal_title, publisher, usage_date, total_requests, unique_requests)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    data.forEach(row => {
        Object.keys(row).forEach(key => {
            if (key.includes('_Total_Item_Requests')) {
                const date = key.split('_')[0] + '_' + key.split('_')[1];
                stmt.run([
                    universityId,
                    row.Title || '',
                    row.Publisher || '',
                    date,
                    row[key] || 0,
                    row[key.replace('Total', 'Unique')] || 0
                ]);
            }
        });
    });

    stmt.finalize();
}

function processBookData(data, universityId) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO books_purchased 
        (university_id, book_code, book_title, year)
        VALUES (?, ?, ?, ?)
    `);

    data.forEach(row => {
        stmt.run([
            universityId,
            row.bookcode || '',
            row.book_title || '',
            row.year || new Date().getFullYear()
        ]);
    });

    stmt.finalize();
}

// Serve the main application
//app.get('/', (req, res) => {
  //  res.sendFile(path.join(__dirname, 'public', 'index.html'));
//});

//--------------------
// API Routes MUST come before the catch-all route
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api', (req, res) => {
    res.json({
        message: 'Publishing Intelligence Platform API',
        version: '1.0.0',
        status: 'Active'
    });
});

app.get('/api/dashboard', (req, res) => {
    // Your dashboard route code
});

app.get('/api/universities', (req, res) => {
    // Your universities route code
});

app.get('/api/subscriptions', (req, res) => {
    // Your subscriptions route code
});

// This catch-all route MUST be at the end
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
//----------

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Publishing Intelligence Platform running on port ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
    console.log(`API: http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});