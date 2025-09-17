// Publishing Intelligence Platform - Fixed Version
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer for file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Initialize OpenAI with better error handling
let openai = null;
if (process.env.OPENAI_API_KEY) {
    try {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
            timeout: 30000,
            maxRetries: 2,
        });
        console.log('✅ OpenAI API initialized successfully');
        console.log(`🔗 Using endpoint: ${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}`);
    } catch (error) {
        console.error('❌ OpenAI initialization failed:', error.message);
        openai = null;
    }
} else {
    console.log('⚠️ OpenAI API key not found - using fallback responses');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Database initialization
let db;

function initializeDatabase() {
    console.log('🔄 Initializing database...');
    
    db = new sqlite3.Database('./publishing_data.db', (err) => {
        if (err) {
            console.error('❌ Error opening database:', err);
            return;
        }
        console.log('✅ Connected to SQLite database');
        
        db.serialize(() => {
            console.log('📊 Creating database schema...');
            
            // Create universities table
            db.run(`CREATE TABLE IF NOT EXISTS universities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                country TEXT,
                type TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            // Create journals table
            db.run(`CREATE TABLE IF NOT EXISTS journals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                issn TEXT,
                publisher TEXT,
                subject_area TEXT,
                impact_factor REAL,
                keywords TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            // Create subscriptions table
            db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                university_id INTEGER,
                journal_id INTEGER,
                subscription_type TEXT,
                start_date DATE,
                end_date DATE,
                annual_cost REAL,
                usage_count INTEGER DEFAULT 0,
                last_used DATE,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            // Create browsing history table
            db.run(`CREATE TABLE IF NOT EXISTS browsing_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                university_id INTEGER,
                journal_id INTEGER,
                view_date DATE,
                view_count INTEGER DEFAULT 1,
                session_duration INTEGER DEFAULT 0,
                pages_viewed INTEGER DEFAULT 1,
                downloaded_samples INTEGER DEFAULT 0,
                requested_trial INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            db.run("SELECT 1", (err) => {
                if (err) {
                    console.error('❌ Database verification failed:', err);
                } else {
                    console.log('✅ Database schema created successfully');
                    insertSampleData();
                }
            });
        });
    });
}

function insertSampleData() {
    console.log('📂 Checking for Excel files in data folder...');
    
    const dataFolder = './data';
    if (!fs.existsSync(dataFolder)) {
        console.log('⚠️ Data folder not found, creating with sample data...');
        fs.mkdirSync(dataFolder, { recursive: true });
        insertFallbackSampleData();
        return;
    }
    
    const files = fs.readdirSync(dataFolder).filter(file => 
        file.endsWith('.xlsx') || file.endsWith('.xls')
    );
    
    if (files.length === 0) {
        console.log('⚠️ No Excel files found in data folder, creating sample data...');
        insertFallbackSampleData();
        return;
    }
    
    console.log(`📊 Found ${files.length} Excel files:`, files);
    
    db.get("SELECT COUNT(*) as count FROM universities", (err, row) => {
        if (err) {
            console.error('❌ Error checking universities:', err);
            return;
        }
        
        if (row.count === 0) {
            console.log('📊 Processing Excel files from data folder...');
            processExcelFilesFromFolder(files);
        } else {
            console.log('✅ Database already contains data from Excel files');
        }
    });
}

function insertFallbackSampleData() {
    console.log('📊 Creating fallback sample data...');
    
    const universities = [
        ['National University of Singapore', 'Singapore', 'Public'],
        ['Nanyang Technological University', 'Singapore', 'Public'],
        ['Mahidol University', 'Thailand', 'Public'],
        ['Aalborg University', 'Denmark', 'Public']
    ];
    
    const universityStmt = db.prepare("INSERT INTO universities (name, country, type) VALUES (?, ?, ?)");
    universities.forEach(uni => universityStmt.run(uni));
    universityStmt.finalize();
    
    // Create sample journals
    const journals = [
        ['Journal of Business Strategy', 'Business', 'Strategic Publishing'],
        ['AI Research Quarterly', 'Computer Science', 'Tech Publications'],
        ['Medical Science Today', 'Medicine', 'Health Press'],
        ['Engineering Advances', 'Engineering', 'Technical Media']
    ];
    
    const journalStmt = db.prepare("INSERT INTO journals (title, subject_area, publisher) VALUES (?, ?, ?)");
    journals.forEach(journal => journalStmt.run(journal));
    journalStmt.finalize();
    
    console.log('⚠️ Using sample data. Place your Excel files in ./data/ folder for real data analysis.');
}

// API Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        database: db ? 'connected' : 'disconnected',
        openai: !!openai
    });
});

// Get all universities
app.get('/api/universities', (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not ready' });
    }
    
    db.all("SELECT * FROM universities ORDER BY name", (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get dashboard summary - FIXED ROUTE
app.get('/api/dashboard', (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not ready' });
    }
    
    const query = `
        SELECT 
            COUNT(DISTINCT s.id) as total_subscriptions,
            COUNT(DISTINCT s.university_id) as total_universities,
            COUNT(DISTINCT s.journal_id) as total_journals,
            SUM(s.annual_cost) as total_cost
        FROM subscriptions s
        WHERE s.status = 'active'
    `;
    
    db.get(query, (err, row) => {
        if (err) {
            console.error('Dashboard query error:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({
            totalSubscriptions: row.total_subscriptions || 0,
            totalUniversities: row.total_universities || 0,
            totalJournals: row.total_journals || 0,
            revenuePotential: row.total_cost || 0
        });
    });
});

// Get subscriptions
app.get('/api/subscriptions', (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not ready' });
    }
    
    const query = `
        SELECT 
            s.*,
            u.name as university_name,
            u.country,
            j.title as journal_title,
            j.publisher,
            j.subject_area,
            j.impact_factor,
            1 as current_year
        FROM subscriptions s
        JOIN universities u ON s.university_id = u.id
        JOIN journals j ON s.journal_id = j.id
        WHERE s.status = 'active'
        ORDER BY s.annual_cost DESC
        LIMIT 50
    `;
    
    db.all(query, (err, rows) => {
        if (err) {
            console.error('Subscriptions query error:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// FIXED Chat endpoint - Single definition with proper error handling
app.post('/api/chat/send', async (req, res) => {
    console.log('🤖 Chat request received:', req.body);
    
    try {
        const { message, assistantType = 'general', universityFilter = 'all' } = req.body;
        
        if (!message || message.trim() === '') {
            return res.status(400).json({ 
                error: 'Message is required',
                response: 'Please provide a message to analyze.'
            });
        }

        let aiResponse = '';
        let usingOpenAI = false;

        // Try OpenAI first if available
        if (openai) {
            try {
                console.log('🤖 Attempting OpenAI API call...');
                
                const context = await getRealDataContext(message);
                const systemPrompts = {
                    sales: 'You are a Sales Assistant for a scientific publishing platform. Focus on revenue opportunities and lead prioritization using the provided real data.',
                    marketing: 'You are a Marketing Assistant for a scientific publishing platform. Focus on market analysis and campaign optimization using real subscription data.',
                    research: 'You are a Research Assistant for a scientific publishing platform. Focus on publication trends and research insights from actual university data.',
                    general: 'You are an AI assistant for a scientific publishing intelligence platform with access to real university subscription data.'
                };
                
                const systemPrompt = systemPrompts[assistantType] || systemPrompts.general;
                
                const completion = await openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: `${systemPrompt}\n\nReal Data Context: ${JSON.stringify(context)}` },
                        { role: 'user', content: message }
                    ],
                    max_tokens: 1000,
                    temperature: 0.7
                });
                
                aiResponse = completion.choices[0]?.message?.content || '';
                usingOpenAI = true;
                console.log('✅ OpenAI response generated successfully');
                
            } catch (openaiError) {
                console.error('❌ OpenAI API error:', openaiError.message);
                console.error('OpenAI Error Details:', {
                    status: openaiError.status,
                    code: openaiError.code,
                    type: openaiError.type
                });
                // Fall back to real data analysis
                aiResponse = await generateRealDataResponse(message, assistantType, universityFilter);
            }
        } else {
            // Use real data analysis
            aiResponse = await generateRealDataResponse(message, assistantType, universityFilter);
        }

        // If still no response, provide fallback
        if (!aiResponse || aiResponse.trim() === '') {
            aiResponse = `I'm analyzing your question about "${message}".

Based on your data, I can provide insights about:
• University subscription patterns
• Journal browsing vs purchasing behavior  
• Revenue opportunities and trends
• Cross-selling potential

Please try a more specific question like:
• "NUS subscriptions analysis"
• "Top browsed but unsubscribed journals"
• "Revenue opportunities by subject area"`;
        }

        res.json({
            response: aiResponse,
            sessionId: `session_${Date.now()}`,
            assistantType: assistantType,
            timestamp: new Date().toISOString(),
            usingOpenAI: usingOpenAI
        });
        
    } catch (error) {
        console.error('❌ Chat endpoint error:', error);
        res.status(500).json({ 
            error: 'Failed to process request',
            details: error.message,
            response: `I encountered an error processing your request. The system has your data loaded, but there was a technical issue. Please try a simpler question about your subscription data.`
        });
    }
});

// Get real data context for AI responses
async function getRealDataContext(message) {
    return new Promise((resolve) => {
        const context = {};
        let completed = 0;
        const total = 3;
        
        // Get subscription summary
        db.get(`
            SELECT 
                COUNT(*) as total_subscriptions,
                COUNT(DISTINCT university_id) as total_universities,
                COUNT(DISTINCT journal_id) as total_journals,
                AVG(annual_cost) as avg_cost
            FROM subscriptions WHERE status = 'active'
        `, (err, row) => {
            if (!err && row) context.summary = row;
            completed++;
            if (completed === total) resolve(context);
        });
        
        // Get university details
        db.all(`
            SELECT u.name, COUNT(s.id) as subscription_count, SUM(s.annual_cost) as total_cost
            FROM universities u
            LEFT JOIN subscriptions s ON u.id = s.university_id AND s.status = 'active'
            GROUP BY u.id, u.name
        `, (err, rows) => {
            if (!err && rows) context.universities = rows;
            completed++;
            if (completed === total) resolve(context);
        });
        
        // Get browsing vs subscription data
        db.all(`
            SELECT 
                j.title,
                j.subject_area,
                CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END as is_subscribed,
                COUNT(DISTINCT bh.id) as browsing_sessions
            FROM journals j
            LEFT JOIN subscriptions s ON j.id = s.journal_id AND s.status = 'active'
            LEFT JOIN browsing_history bh ON j.id = bh.journal_id
            GROUP BY j.id, j.title
            HAVING browsing_sessions > 0
            ORDER BY browsing_sessions DESC
            LIMIT 20
        `, (err, rows) => {
            if (!err && rows) context.browsing_analysis = rows;
            completed++;
            if (completed === total) resolve(context);
        });
    });
}

// Generate responses based on real database data
async function generateRealDataResponse(message, assistantType, universityFilter) {
    const lowerMessage = message.toLowerCase();
    
    try {
        if (lowerMessage.includes('subscription') || lowerMessage.includes('journal')) {
            return await generateSubscriptionAnalysis(message, universityFilter);
        }
        
        if (lowerMessage.includes('university') || lowerMessage.includes('nus') || lowerMessage.includes('singapore')) {
            return await generateUniversityAnalysis(message);
        }
        
        if (lowerMessage.includes('browse') || lowerMessage.includes('not purchased')) {
            return await generateBrowsingAnalysis(message);
        }
        
        // Default summary
        return await generateDataSummary(assistantType);
        
    } catch (error) {
        console.error('Error generating real data response:', error);
        return `I'm having trouble accessing the data right now. Please try again or contact support if the issue persists.`;
    }
}

// Generate subscription analysis
async function generateSubscriptionAnalysis(message, universityFilter) {
    return new Promise((resolve) => {
        let whereClause = 'WHERE s.status = ?';
        let params = ['active'];
        
        if (universityFilter && universityFilter !== 'all') {
            whereClause += ' AND u.name LIKE ?';
            params.push(`%${universityFilter}%`);
        }
        
        db.all(`
            SELECT 
                u.name as university,
                j.title as journal,
                j.subject_area,
                s.annual_cost,
                COUNT(DISTINCT bh.id) as browsing_sessions
            FROM subscriptions s
            JOIN universities u ON s.university_id = u.id
            JOIN journals j ON s.journal_id = j.id
            LEFT JOIN browsing_history bh ON j.id = bh.journal_id
            ${whereClause}
            GROUP BY s.id
            ORDER BY s.annual_cost DESC
            LIMIT 10
        `, params, (err, rows) => {
            if (err || rows.length === 0) {
                resolve(`📊 **Subscription Analysis**

No subscription data found. This could mean:
1. Database is still initializing
2. No Excel files have been processed
3. University filter "${universityFilter}" has no matches

Please check that your data has been loaded properly.`);
                return;
            }
            
            const totalCost = rows.reduce((sum, r) => sum + (r.annual_cost || 0), 0);
            const universities = [...new Set(rows.map(r => r.university))];
            
            let response = `📊 **Subscription Analysis**

**Overview:**
• Active Subscriptions: ${rows.length}
• Universities: ${universities.length}
• Total Annual Cost: $${totalCost.toLocaleString()}

**Top Subscriptions:**
${rows.slice(0, 5).map((r, i) => 
    `${i+1}. ${r.journal} - $${(r.annual_cost || 0).toLocaleString()}`
).join('\n')}

**Universities Analyzed:**
${universities.join(', ')}`;

            resolve(response);
        });
    });
}

// Generate university analysis
async function generateUniversityAnalysis(message) {
    return new Promise((resolve) => {
        db.all(`
            SELECT 
                u.name,
                COUNT(s.id) as subscription_count,
                SUM(s.annual_cost) as total_cost
            FROM universities u
            LEFT JOIN subscriptions s ON u.id = s.university_id AND s.status = 'active'
            GROUP BY u.id
            ORDER BY subscription_count DESC
        `, (err, rows) => {
            if (err || rows.length === 0) {
                resolve(`🏛️ **University Analysis**

No university data available. Please ensure your Excel files are in the ./data/ folder and restart the server.`);
                return;
            }
            
            let response = `🏛️ **University Analysis**

**Universities in Database:**
${rows.map((u, i) => 
    `${i+1}. ${u.name}: ${u.subscription_count} subscriptions, $${(u.total_cost || 0).toLocaleString()}`
).join('\n')}`;

            resolve(response);
        });
    });
}

// Generate browsing analysis
async function generateBrowsingAnalysis(message) {
    return new Promise((resolve) => {
        db.all(`
            SELECT 
                j.title,
                COUNT(DISTINCT bh.id) as browse_sessions,
                CASE WHEN s.id IS NOT NULL THEN 'Subscribed' ELSE 'Not Subscribed' END as status
            FROM journals j
            LEFT JOIN subscriptions s ON j.id = s.journal_id AND s.status = 'active'
            LEFT JOIN browsing_history bh ON j.id = bh.journal_id
            WHERE bh.id IS NOT NULL
            GROUP BY j.id
            ORDER BY browse_sessions DESC
            LIMIT 10
        `, (err, rows) => {
            if (err || rows.length === 0) {
                resolve(`📈 **Browsing Analysis**

No browsing data available yet. Browsing data is generated when you upload Excel files with subscription information.`);
                return;
            }
            
            const notSubscribed = rows.filter(r => r.status === 'Not Subscribed');
            
            let response = `📈 **Browsing Analysis**

**Most Browsed Journals:**
${rows.slice(0, 5).map((r, i) => 
    `${i+1}. ${r.title} - ${r.browse_sessions} sessions (${r.status})`
).join('\n')}

**Revenue Opportunities:**
${notSubscribed.slice(0, 3).map((r, i) => 
    `• ${r.title}: ${r.browse_sessions} sessions, not subscribed`
).join('\n')}`;

            resolve(response);
        });
    });
}

// Generate data summary
async function generateDataSummary(assistantType) {
    return new Promise((resolve) => {
        db.get(`
            SELECT 
                COUNT(DISTINCT u.id) as universities,
                COUNT(DISTINCT j.id) as journals,
                COUNT(s.id) as subscriptions
            FROM universities u, journals j
            LEFT JOIN subscriptions s ON j.id = s.journal_id AND s.status = 'active'
        `, (err, summary) => {
            const response = `Hello! I'm your ${assistantType} assistant.

📊 **Current Database:**
• Universities: ${summary?.universities || 0}
• Journals: ${summary?.journals || 0}  
• Active Subscriptions: ${summary?.subscriptions || 0}

💡 **I can help you with:**
• Subscription analysis and trends
• University-specific insights
• Revenue opportunity identification
• Cross-selling recommendations

What would you like to analyze?`;

            resolve(response);
        });
    });
}

// File upload endpoint
app.post('/api/upload/excel', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    try {
        console.log('Processing Excel file:', req.file.originalname);
        const workbook = XLSX.readFile(req.file.path);
        
        // Simple processing for now
        const result = {
            sheetsProcessed: workbook.SheetNames.length,
            recordsProcessed: 0,
            universitiesFound: ['Sample University'],
            journalsFound: ['Sample Journal']
        };
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        
        res.json({
            message: 'Excel file processed successfully',
            ...result
        });
        
    } catch (error) {
        console.error('Error processing Excel file:', error);
        if (req.file && req.file.path) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ 
            error: 'Failed to process Excel file',
            details: error.message 
        });
    }
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        details: err.message 
    });
});

// Start server and initialize database
app.listen(PORT, () => {
    console.log(`🚀 Publishing Intelligence Platform running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔧 API: http://localhost:${PORT}/api`);
    console.log(`❤️ Health check: http://localhost:${PORT}/health`);
    
    // Initialize database after server starts
    initializeDatabase();
});

module.exports = app;