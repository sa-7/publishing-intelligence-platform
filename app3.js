// Publishing Intelligence Platform - Updated Backend Server
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

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Request body:', req.body);
    }
    next();
});

// Configure multer for file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Initialize OpenAI
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
}) : null;

// Database initialization
const db = new sqlite3.Database('./publishing_data.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

function initializeDatabase() {
    const tables = [
        `CREATE TABLE IF NOT EXISTS universities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            country TEXT,
            type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS journals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            issn TEXT,
            publisher TEXT,
            subject_area TEXT,
            impact_factor REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS subscriptions (
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (university_id) REFERENCES universities (id),
            FOREIGN KEY (journal_id) REFERENCES journals (id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS usage_analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subscription_id INTEGER,
            month TEXT,
            downloads INTEGER DEFAULT 0,
            views INTEGER DEFAULT 0,
            searches INTEGER DEFAULT 0,
            unique_users INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subscription_id) REFERENCES subscriptions (id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS publications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            university_id INTEGER,
            journal_id INTEGER,
            title TEXT,
            authors TEXT,
            publish_date DATE,
            citation_count INTEGER DEFAULT 0,
            doi TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (university_id) REFERENCES universities (id),
            FOREIGN KEY (journal_id) REFERENCES journals (id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS chat_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE,
            messages TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    tables.forEach(tableSQL => {
        db.run(tableSQL, (err) => {
            if (err) {
                console.error('Error creating table:', err);
            }
        });
    });
    
    // Insert sample data if tables are empty
    insertSampleData();
}

function insertSampleData() {
    // Check if data already exists
    db.get("SELECT COUNT(*) as count FROM universities", (err, row) => {
        if (err) {
            console.error('Error checking universities:', err);
            return;
        }
        
        if (row.count === 0) {
            console.log('Inserting sample data...');
            
            // Sample universities
            const universities = [
                ['National University of Singapore', 'Singapore', 'Public'],
                ['Nanyang Technological University', 'Singapore', 'Public'],
                ['Mahidol University', 'Thailand', 'Public'],
                ['Aalborg University', 'Denmark', 'Public'],
                ['University of Melbourne', 'Australia', 'Public'],
                ['Tokyo Institute of Technology', 'Japan', 'Public']
            ];
            
            const universityStmt = db.prepare("INSERT INTO universities (name, country, type) VALUES (?, ?, ?)");
            universities.forEach(uni => universityStmt.run(uni));
            universityStmt.finalize();
            
            // Sample journals
            const journals = [
                ['Nature', '0028-0836', 'Nature Publishing Group', 'Multidisciplinary', 49.962],
                ['Science', '0036-8075', 'American Association for the Advancement of Science', 'Multidisciplinary', 47.728],
                ['Cell', '0092-8674', 'Elsevier', 'Cell Biology', 38.637],
                ['The Lancet', '0140-6736', 'Elsevier', 'Medicine', 79.321],
                ['New England Journal of Medicine', '0028-4793', 'Massachusetts Medical Society', 'Medicine', 91.245],
                ['Journal of Machine Learning Research', '1532-4435', 'MIT Press', 'Computer Science', 4.994],
                ['IEEE Transactions on Pattern Analysis', '0162-8828', 'IEEE', 'Computer Science', 17.861]
            ];
            
            const journalStmt = db.prepare("INSERT INTO journals (title, issn, publisher, subject_area, impact_factor) VALUES (?, ?, ?, ?, ?)");
            journals.forEach(journal => journalStmt.run(journal));
            journalStmt.finalize();
            
            // Generate sample subscriptions and usage data
            generateSampleSubscriptions();
        }
    });
}

function insertSampleData() {
    // Check if data already exists
    db.get("SELECT COUNT(*) as count FROM universities", (err, row) => {
        if (err) {
            console.error('Error checking universities:', err);
            return;
        }
        
        if (row.count === 0) {
            console.log('📊 Inserting enhanced sample data...');
            
            // Sample universities
            const universities = [
                ['National University of Singapore', 'Singapore', 'Public'],
                ['Nanyang Technological University', 'Singapore', 'Public'],
                ['Mahidol University', 'Thailand', 'Public'],
                ['Aalborg University', 'Denmark', 'Public'],
                ['University of Melbourne', 'Australia', 'Public'],
                ['Tokyo Institute of Technology', 'Japan', 'Public']
            ];
            
            const universityStmt = db.prepare("INSERT INTO universities (name, country, type) VALUES (?, ?, ?)");
            universities.forEach(uni => universityStmt.run(uni));
            universityStmt.finalize();
            
            // Enhanced journals with keywords and descriptions
            const journals = [
                ['Nature', '0028-0836', 'Nature Publishing Group', 'Multidisciplinary', 49.962, 
                 'science, research, innovation, breakthrough, discovery', 
                 'Premier multidisciplinary science journal publishing cutting-edge research across all scientific fields'],
                
                ['Science', '0036-8075', 'American Association for the Advancement of Science', 'Multidisciplinary', 47.728,
                 'scientific research, innovation, technology, discovery',
                 'Leading journal for original scientific research, reviews, and news'],
                
                ['Harvard Business Review', '0017-8012', 'Harvard Business Review Press', 'Business Strategy', 25.234,
                 'business strategy, management, leadership, innovation, AI in business, digital transformation',
                 'Premier management magazine focusing on business strategy and leadership'],
                
                ['Strategic Management Journal', '0143-2095', 'Wiley', 'Business Strategy', 8.456,
                 'strategic management, competitive strategy, AI strategy, business models, digital strategy',
                 'Leading academic journal in strategic management and business strategy'],
                
                ['MIT Sloan Management Review', '1532-9194', 'MIT Press', 'Business Strategy', 6.789,
                 'business strategy, AI implementation, management innovation, digital transformation',
                 'Bridge between management research and practice'],
                
                ['Journal of Business Strategy', '0275-6668', 'Emerald Publishing', 'Business Strategy', 3.245,
                 'business strategy, competitive analysis, AI adoption, strategic planning',
                 'Practical insights for business strategy and competitive advantage'],
                
                ['Cell', '0092-8674', 'Elsevier', 'Cell Biology', 38.637,
                 'cell biology, molecular biology, genetics, biotechnology',
                 'Premier journal in cell and molecular biology'],
                
                ['The Lancet', '0140-6736', 'Elsevier', 'Medicine', 79.321,
                 'medicine, healthcare, clinical research, medical innovation',
                 'Leading general medical journal'],
                
                ['New England Journal of Medicine', '0028-4793', 'Massachusetts Medical Society', 'Medicine', 91.245,
                 'medicine, clinical trials, healthcare innovation, medical research',
                 'Most prestigious medical journal worldwide'],
                
                ['Journal of Machine Learning Research', '1532-4435', 'MIT Press', 'Computer Science', 4.994,
                 'machine learning, artificial intelligence, data science, algorithms',
                 'Premier venue for machine learning research'],
                
                ['IEEE Transactions on Pattern Analysis', '0162-8828', 'IEEE', 'Computer Science', 17.861,
                 'computer vision, pattern recognition, AI, machine learning',
                 'Leading journal in computer vision and pattern analysis'],
                
                ['AI Magazine', '0738-4602', 'AAAI Press', 'Artificial Intelligence', 2.456,
                 'artificial intelligence, AI applications, business AI, AI strategy',
                 'Magazine covering AI research and applications'],
                
                ['Journal of Strategic Information Systems', '0963-8687', 'Elsevier', 'Information Systems', 6.123,
                 'information systems, digital strategy, AI in business, technology strategy',
                 'Strategic aspects of information systems in organizations'],
                
                ['California Management Review', '0008-1256', 'UC Berkeley', 'Management', 4.567,
                 'management innovation, business strategy, AI adoption, digital transformation',
                 'Innovative ideas for business management and strategy'],
                
                ['Technology Analysis & Strategic Management', '0953-7325', 'Taylor & Francis', 'Technology Strategy', 3.891,
                 'technology strategy, innovation management, AI strategy, digital innovation',
                 'Strategic management of technology and innovation']
            ];
            
            const journalStmt = db.prepare(`
                INSERT INTO journals (title, issn, publisher, subject_area, impact_factor, keywords, description) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            journals.forEach(journal => journalStmt.run(journal));
            journalStmt.finalize();
            
            // Generate comprehensive sample data
            setTimeout(() => {
                generateEnhancedSampleData();
            }, 1000);
        }
    });
}

function generateEnhancedSampleData() {
    db.all("SELECT id, name FROM universities", (err, universities) => {
        if (err) return console.error(err);
        
        db.all("SELECT id, title, subject_area FROM journals", (err, journals) => {
            if (err) return console.error(err);
            
            // Generate subscriptions (only some journals are subscribed)
            const subscriptionStmt = db.prepare(`
                INSERT INTO subscriptions (university_id, journal_id, subscription_type, start_date, end_date, annual_cost, usage_count, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            // Generate browsing history (many more journals are browsed than subscribed)
            const browsingStmt = db.prepare(`
                INSERT INTO browsing_history (university_id, journal_id, view_date, view_count, session_duration, pages_viewed, downloaded_samples, requested_trial) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            // Generate research trends
            const trendsStmt = db.prepare(`
                INSERT INTO research_trends (university_id, subject_area, keyword, trend_score, year, publication_count, citation_count) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            universities.forEach((uni, uniIndex) => {
                // Each university subscribes to 40-60% of available journals
                const subscriptionRate = 0.4 + Math.random() * 0.2;
                const numSubscriptions = Math.floor(journals.length * subscriptionRate);
                const subscribedJournals = journals.sort(() => 0.5 - Math.random()).slice(0, numSubscriptions);
                
                // Generate subscriptions
                subscribedJournals.forEach((journal, subIndex) => {
                    const subscriptionId = uniIndex * 20 + subIndex + 1;
                    const cost = Math.floor(Math.random() * 50000) + 10000;
                    const usageCount = Math.floor(Math.random() * 1000) + 100;
                    
                    subscriptionStmt.run([
                        uni.id, 
                        journal.id, 
                        'institutional',
                        '2020-01-01',
                        '2025-12-31',
                        cost,
                        usageCount,
                        'active'
                    ]);
                });
                
                // Generate browsing history for ALL journals (including non-subscribed)
                journals.forEach(journal => {
                    // Generate random browsing events over the past 2 years
                    const numBrowsingEvents = Math.floor(Math.random() * 20) + 5; // 5-25 browsing events per journal
                    
                    for (let i = 0; i < numBrowsingEvents; i++) {
                        const daysAgo = Math.floor(Math.random() * 730); // Past 2 years
                        const viewDate = new Date();
                        viewDate.setDate(viewDate.getDate() - daysAgo);
                        
                        const isSubscribed = subscribedJournals.some(sub => sub.id === journal.id);
                        const baseEngagement = isSubscribed ? 2 : 1; // Subscribed journals get more engagement
                        
                        browsingStmt.run([
                            uni.id,
                            journal.id,
                            viewDate.toISOString().split('T')[0],
                            Math.floor(Math.random() * 10 * baseEngagement) + 1,
                            Math.floor(Math.random() * 1800 * baseEngagement) + 30, // 30 seconds to 30 minutes
                            Math.floor(Math.random() * 20 * baseEngagement) + 1,
                            Math.floor(Math.random() * 5 * baseEngagement), // Downloads
                            Math.random() < (isSubscribed ? 0.1 : 0.3) ? 1 : 0 // Trial requests more likely for non-subscribed
                        ]);
                    }
                });
                
                // Generate research trends for each university
                const subjectAreas = ['Business Strategy', 'Artificial Intelligence', 'Medicine', 'Computer Science', 'Multidisciplinary'];
                const keywords = [
                    'AI strategy', 'digital transformation', 'machine learning', 'business intelligence',
                    'competitive advantage', 'innovation management', 'data analytics', 'automation',
                    'strategic planning', 'technology adoption', 'AI implementation', 'business models'
                ];
                
                subjectAreas.forEach(subject => {
                    keywords.forEach(keyword => {
                        for (let year = 2020; year <= 2024; year++) {
                            const relevanceScore = Math.random();
                            if (relevanceScore > 0.3) { // Only include relevant trends
                                trendsStmt.run([
                                    uni.id,
                                    subject,
                                    keyword,
                                    relevanceScore,
                                    year,
                                    Math.floor(Math.random() * 50) + 1,
                                    Math.floor(Math.random() * 500) + 10
                                ]);
                            }
                        }
                    });
                });
            });
            
            subscriptionStmt.finalize();
            browsingStmt.finalize();
            trendsStmt.finalize();
            
            console.log('✅ Enhanced sample data with browsing history and trends inserted successfully');
        });
    });
}

// API Routes

// Debug route to list all endpoints
app.get('/api/routes', (req, res) => {
    const routes = [];
    app._router.stack.forEach((middleware) => {
        if (middleware.route) {
            routes.push({
                path: middleware.route.path,
                methods: Object.keys(middleware.route.methods)
            });
        }
    });
    res.json(routes);
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        database: 'connected'
    });
});

// Get all universities
app.get('/api/universities', (req, res) => {
    db.all("SELECT * FROM universities ORDER BY name", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get dashboard summary
app.get('/api/dashboard/summary', (req, res) => {
    const universityFilter = req.query.university;
    
    let whereClause = '';
    let params = [];
    
    if (universityFilter && universityFilter !== 'all') {
        whereClause = 'WHERE u.name = ?';
        params = [universityFilter];
    }
    
    const query = `
        SELECT 
            COUNT(DISTINCT s.id) as total_subscriptions,
            COUNT(DISTINCT u.id) as total_universities,
            COUNT(DISTINCT j.id) as total_journals,
            SUM(s.annual_cost) as total_cost,
            AVG(s.usage_count) as avg_usage,
            SUM(ua.downloads) as total_downloads,
            SUM(ua.views) as total_views
        FROM subscriptions s
        JOIN universities u ON s.university_id = u.id
        JOIN journals j ON s.journal_id = j.id
        LEFT JOIN usage_analytics ua ON s.id = ua.subscription_id
        ${whereClause}
    `;
    
    db.get(query, params, (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({
            totalSubscriptions: row.total_subscriptions || 0,
            totalUniversities: row.total_universities || 0,
            totalJournals: row.total_journals || 0,
            totalCost: row.total_cost || 0,
            avgUsage: Math.round(row.avg_usage) || 0,
            totalDownloads: row.total_downloads || 0,
            totalViews: row.total_views || 0
        });
    });
});

// Get subscriptions with details
app.get('/api/subscriptions', (req, res) => {
    const universityFilter = req.query.university;
    const limit = req.query.limit || 50;
    const offset = req.query.offset || 0;
    
    let whereClause = '';
    let params = [];
    
    if (universityFilter && universityFilter !== 'all') {
        whereClause = 'WHERE u.name = ?';
        params = [universityFilter];
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
            COALESCE(SUM(ua.downloads), 0) as total_downloads,
            COALESCE(SUM(ua.views), 0) as total_views,
            COALESCE(AVG(ua.unique_users), 0) as avg_users,
            CASE 
                WHEN s.annual_cost > 0 THEN COALESCE(SUM(ua.downloads), 0) / s.annual_cost * 1000
                ELSE 0 
            END as cost_per_thousand_downloads
        FROM subscriptions s
        JOIN universities u ON s.university_id = u.id
        JOIN journals j ON s.journal_id = j.id
        LEFT JOIN usage_analytics ua ON s.id = ua.subscription_id
        ${whereClause}
        GROUP BY s.id, u.name, j.title
        ORDER BY s.annual_cost DESC, total_downloads DESC
        LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get usage analytics
app.get('/api/analytics/usage', (req, res) => {
    const universityFilter = req.query.university;
    const timeRange = req.query.range || '12'; // months
    
    let whereClause = '';
    let params = [timeRange];
    
    if (universityFilter && universityFilter !== 'all') {
        whereClause = 'AND u.name = ?';
        params.push(universityFilter);
    }
    
    const query = `
        SELECT 
            ua.month,
            SUM(ua.downloads) as downloads,
            SUM(ua.views) as views,
            SUM(ua.searches) as searches,
            SUM(ua.unique_users) as unique_users,
            COUNT(DISTINCT s.id) as active_subscriptions
        FROM usage_analytics ua
        JOIN subscriptions s ON ua.subscription_id = s.id
        JOIN universities u ON s.university_id = u.id
        WHERE ua.month >= date('now', '-' || ? || ' months')
        ${whereClause}
        GROUP BY ua.month
        ORDER BY ua.month
    `;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get top journals by usage
app.get('/api/analytics/top-journals', (req, res) => {
    const universityFilter = req.query.university;
    const limit = req.query.limit || 10;
    
    let whereClause = '';
    let params = [limit];
    
    if (universityFilter && universityFilter !== 'all') {
        whereClause = 'WHERE u.name = ?';
        params.unshift(universityFilter);
    }
    
    const query = `
        SELECT 
            j.title,
            j.publisher,
            j.subject_area,
            j.impact_factor,
            COUNT(DISTINCT s.university_id) as subscribing_universities,
            SUM(s.annual_cost) as total_revenue,
            SUM(ua.downloads) as total_downloads,
            SUM(ua.views) as total_views,
            AVG(ua.unique_users) as avg_unique_users
        FROM journals j
        JOIN subscriptions s ON j.id = s.journal_id
        JOIN universities u ON s.university_id = u.id
        LEFT JOIN usage_analytics ua ON s.id = ua.subscription_id
        ${whereClause}
        GROUP BY j.id, j.title
        ORDER BY total_downloads DESC, total_revenue DESC
        LIMIT ?
    `;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get university performance
app.get('/api/analytics/universities', (req, res) => {
    const query = `
        SELECT 
            u.name,
            u.country,
            u.type,
            COUNT(s.id) as total_subscriptions,
            SUM(s.annual_cost) as total_spending,
            AVG(s.annual_cost) as avg_subscription_cost,
            SUM(ua.downloads) as total_downloads,
            SUM(ua.views) as total_views,
            SUM(ua.unique_users) as total_unique_users,
            CASE 
                WHEN SUM(s.annual_cost) > 0 THEN SUM(ua.downloads) / SUM(s.annual_cost) * 1000
                ELSE 0 
            END as downloads_per_thousand_dollars
        FROM universities u
        LEFT JOIN subscriptions s ON u.id = s.university_id
        LEFT JOIN usage_analytics ua ON s.id = ua.subscription_id
        GROUP BY u.id, u.name
        ORDER BY total_spending DESC
    `;
    
    db.all(query, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// AI Chat endpoints
app.post('/api/chat/send', async (req, res) => {
    console.log('Chat request received:', req.body);
    
    try {
        const { message, sessionId, assistantType = 'general' } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        // Get relevant data context
        const context = await getRelevantContext(message, assistantType);
        console.log('Context retrieved:', context);
        
        let aiResponse;
        
        if (!openai) {
            // Fallback to rule-based responses when OpenAI is not available
            console.log('OpenAI not configured, using fallback responses');
            aiResponse = generateFallbackResponse(message, context, assistantType);
        } else {
            try {
                // Define system prompts for different assistant types
                const systemPrompts = {
                    sales: `You are a Sales Assistant for a scientific publishing platform. You help identify revenue opportunities, analyze subscription patterns, and prioritize leads. Use the provided data to give specific, actionable insights about potential sales opportunities.`,
                    
                    marketing: `You are a Marketing Assistant for a scientific publishing platform. You analyze market trends, competitive positioning, and help optimize marketing campaigns. Focus on data-driven marketing insights and strategies.`,
                    
                    research: `You are a Research Assistant for a scientific publishing platform. You analyze publication trends, author collaborations, and research patterns. Provide insights about academic publishing trends and research opportunities.`,
                    
                    general: `You are an AI assistant for a scientific publishing intelligence platform. You help analyze subscription data, usage patterns, and provide insights about academic publishing trends. Be specific and data-driven in your responses.`
                };
                
                const systemPrompt = systemPrompts[assistantType] || systemPrompts.general;
                
                // Prepare the conversation context
                const conversationContext = `
Context Data:
${JSON.stringify(context, null, 2)}

User Query: ${message}
                `;
                
                const completion = await openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: conversationContext }
                    ],
                    max_tokens: 1000,
                    temperature: 0.7
                });
                
                aiResponse = completion.choices[0].message.content;
            } catch (openaiError) {
                console.error('OpenAI API error, falling back to rule-based response:', openaiError);
                aiResponse = generateFallbackResponse(message, context, assistantType);
            }
        }
        
        // Save conversation to database
        try {
            await saveChatMessage(sessionId, message, aiResponse, assistantType);
        } catch (dbError) {
            console.error('Error saving chat message:', dbError);
        }
        
        console.log('Sending response:', aiResponse);
        
        res.json({
            response: aiResponse,
            sessionId: sessionId || `session_${Date.now()}`,
            assistantType: assistantType,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Chat endpoint error:', error);
        res.status(500).json({ 
            error: 'Failed to generate response',
            details: error.message,
            response: 'Sorry, I encountered an error processing your request. Please try again.'
        });
    }
});

// Fallback response generator when OpenAI is not available
function generateFallbackResponse(message, context, assistantType) {
    const lowerMessage = message.toLowerCase();
    
    // NUS-specific queries
    if (lowerMessage.includes('nus') || lowerMessage.includes('national university singapore')) {
        if (lowerMessage.includes('author') || lowerMessage.includes('researcher')) {
            return `Based on our publishing data, here are insights about NUS authors:

📊 **Publication Analysis:**
• NUS has active subscriptions to ${context.subscriptions ? context.subscriptions.filter(s => s.university.includes('National University')).length : 'several'} major journals
• Strong presence in multidisciplinary and medical research publications
• High usage patterns indicating active research community

🔬 **Research Strengths:**
• Medicine & Health Sciences
• Engineering & Technology  
• Physical Sciences
• Computer Science & AI

💡 **Recommendations:**
• Focus on journals with high impact factors in these areas
• Consider bundled subscriptions for related subject areas
• Monitor usage analytics to optimize renewals

*Note: For detailed author analytics, I'd need access to publication databases or researcher profiles.*`;
        }
        
        if (lowerMessage.includes('subscription') || lowerMessage.includes('journal')) {
            const nusSubscriptions = context.subscriptions ? context.subscriptions.filter(s => 
                s.university && s.university.includes('National University')
            ) : [];
            
            return `📊 **NUS Subscription Overview:**

Current Status: ${nusSubscriptions.length} active subscriptions
Total Annual Investment: ${nusSubscriptions.reduce((sum, s) => sum + (s.annual_cost || 0), 0).toLocaleString()}

**Top Performing Journals:**
${nusSubscriptions.slice(0, 3).map((s, i) => 
    `${i+1}. ${s.journal} - ${s.annual_cost?.toLocaleString() || 'N/A'}/year`
).join('\n')}

**Opportunities:**
• High-usage journals show strong ROI
• Consider multi-year contracts for discounts
• Bundle complementary titles for better rates`;
        }
        
        return `🏛️ **National University of Singapore (NUS) Overview:**

NUS is one of Asia's leading research universities with strong international collaboration and high research output.

**Key Metrics:**
• World ranking: Top 15 globally
• Strong in: Medicine, Engineering, Sciences, Business
• Active research community with high journal usage

**Publishing Insights:**
• High subscription utilization rates
• Strong preference for high-impact journals
• Growing interest in open access models

How can I help you analyze specific aspects of NUS's publishing activities?`;
    }
    
    // Market trends queries
    if (lowerMessage.includes('market') || lowerMessage.includes('trend')) {
        return `📈 **Academic Publishing Market Trends:**

**Current Market Dynamics:**
• Open Access growth: 20-25% annually
• Digital-first publishing becoming standard
• AI/ML integration in research workflows
• Sustainability focus driving policy changes

**Regional Trends (Asia-Pacific):**
• Rapid research output growth
• Government mandates for open access
• Increased international collaboration
• Growing investment in STEM fields

**Key Opportunities:**
• Hybrid subscription models
• Institutional consortiums
• Data analytics services
• Research collaboration platforms

${assistantType === 'sales' ? '**Sales Focus:** Target growing universities with bundled offerings' : ''}
${assistantType === 'marketing' ? '**Marketing Focus:** Emphasize digital transformation and collaboration tools' : ''}
${assistantType === 'research' ? '**Research Focus:** Monitor citation patterns and emerging research areas' : ''}`;
    }
    
    // General usage and analytics
    if (lowerMessage.includes('usage') || lowerMessage.includes('download') || lowerMessage.includes('analytics')) {
        const totalDownloads = context.usage ? context.usage.reduce((sum, u) => sum + (u.downloads || 0), 0) : 0;
        const totalViews = context.usage ? context.usage.reduce((sum, u) => sum + (u.views || 0), 0) : 0;
        
        return `📊 **Usage Analytics Summary:**

**Current Period Performance:**
• Total Downloads: ${totalDownloads.toLocaleString()}
• Total Views: ${totalViews.toLocaleString()}
• Active Subscriptions: ${context.summary?.total_subscriptions || 'N/A'}

**Key Insights:**
• Peak usage typically in academic months (Sep-Nov, Feb-May)
• Medical and engineering journals show highest usage
• Mobile access growing 15% year-over-year

**Recommendations:**
• Monitor low-usage subscriptions for renewal decisions
• Promote underutilized high-value content
• Consider usage-based pricing models`;
    }
    
    // Revenue and cost analysis
    if (lowerMessage.includes('revenue') || lowerMessage.includes('cost') || lowerMessage.includes('roi')) {
        const totalCost = context.summary?.total_cost || 0;
        const totalSubscriptions = context.summary?.total_subscriptions || 0;
        const avgCost = totalSubscriptions > 0 ? totalCost / totalSubscriptions : 0;
        
        return `💰 **Revenue & Cost Analysis:**

**Financial Overview:**
• Total Revenue: ${totalCost.toLocaleString()}
• Average Subscription: ${avgCost.toLocaleString()}
• Active Subscriptions: ${totalSubscriptions}

**ROI Indicators:**
• Cost per download varies by subject area
• Premium journals show higher engagement
• Bundle discounts averaging 15-20%

**Optimization Opportunities:**
• Renegotiate underperforming subscriptions
• Promote high-value, low-usage content
• Consider consortial purchasing power`;
    }
    
    // Default response
    return `Hello! I'm your ${assistantType === 'sales' ? 'Sales' : assistantType === 'marketing' ? 'Marketing' : assistantType === 'research' ? 'Research' : 'Publishing Intelligence'} Assistant. 

I can help you analyze:
• University subscription patterns
• Journal performance metrics  
• Usage trends and analytics
• Market opportunities
• Revenue optimization

Try asking about:
• "NUS subscription analysis"
• "Top performing journals"
• "Usage trends by subject area"
• "Revenue opportunities"
• "Market trends in academic publishing"

What would you like to explore?`;
}

// Get relevant context for AI responses
async function getRelevantContext(message, assistantType) {
    return new Promise((resolve) => {
        const lowerMessage = message.toLowerCase();
        
        // Determine what data to fetch based on the message content
        const queries = [];
        
        if (lowerMessage.includes('university') || lowerMessage.includes('nus') || lowerMessage.includes('ntu')) {
            queries.push('universities');
        }
        
        if (lowerMessage.includes('journal') || lowerMessage.includes('publication')) {
            queries.push('journals');
        }
        
        if (lowerMessage.includes('usage') || lowerMessage.includes('download') || lowerMessage.includes('view')) {
            queries.push('usage');
        }
        
        if (lowerMessage.includes('cost') || lowerMessage.includes('revenue') || lowerMessage.includes('subscription')) {
            queries.push('subscriptions');
        }
        
        // Default to getting summary data
        if (queries.length === 0) {
            queries.push('summary');
        }
        
        const context = {};
        let completed = 0;
        const total = queries.length;
        
        queries.forEach(queryType => {
            switch (queryType) {
                case 'universities':
                    db.all("SELECT name, country, type FROM universities LIMIT 10", (err, rows) => {
                        if (!err) context.universities = rows;
                        completed++;
                        if (completed === total) resolve(context);
                    });
                    break;
                    
                case 'journals':
                    db.all("SELECT title, publisher, subject_area, impact_factor FROM journals LIMIT 10", (err, rows) => {
                        if (!err) context.journals = rows;
                        completed++;
                        if (completed === total) resolve(context);
                    });
                    break;
                    
                case 'usage':
                    db.all(`
                        SELECT month, SUM(downloads) as downloads, SUM(views) as views 
                        FROM usage_analytics 
                        WHERE month >= date('now', '-6 months')
                        GROUP BY month ORDER BY month DESC
                    `, (err, rows) => {
                        if (!err) context.usage = rows;
                        completed++;
                        if (completed === total) resolve(context);
                    });
                    break;
                    
                case 'subscriptions':
                    db.all(`
                        SELECT u.name as university, j.title as journal, s.annual_cost, s.usage_count
                        FROM subscriptions s
                        JOIN universities u ON s.university_id = u.id
                        JOIN journals j ON s.journal_id = j.id
                        ORDER BY s.annual_cost DESC LIMIT 20
                    `, (err, rows) => {
                        if (!err) context.subscriptions = rows;
                        completed++;
                        if (completed === total) resolve(context);
                    });
                    break;
                    
                default:
                    db.get(`
                        SELECT 
                            COUNT(DISTINCT s.id) as total_subscriptions,
                            COUNT(DISTINCT u.id) as total_universities,
                            SUM(s.annual_cost) as total_cost,
                            SUM(ua.downloads) as total_downloads
                        FROM subscriptions s
                        JOIN universities u ON s.university_id = u.id
                        LEFT JOIN usage_analytics ua ON s.id = ua.subscription_id
                    `, (err, row) => {
                        if (!err) context.summary = row;
                        completed++;
                        if (completed === total) resolve(context);
                    });
            }
        });
    });
}

// Save chat messages
async function saveChatMessage(sessionId, userMessage, aiResponse, assistantType) {
    const session_id = sessionId || `session_${Date.now()}`;
    
    return new Promise((resolve, reject) => {
        db.get("SELECT messages FROM chat_sessions WHERE session_id = ?", [session_id], (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            const messages = row ? JSON.parse(row.messages) : [];
            messages.push({
                timestamp: new Date().toISOString(),
                user: userMessage,
                assistant: aiResponse,
                assistantType: assistantType
            });
            
            if (row) {
                // Update existing session
                db.run(
                    "UPDATE chat_sessions SET messages = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?",
                    [JSON.stringify(messages), session_id],
                    (err) => {
                        if (err) reject(err);
                        else resolve(session_id);
                    }
                );
            } else {
                // Create new session
                db.run(
                    "INSERT INTO chat_sessions (session_id, messages) VALUES (?, ?)",
                    [session_id, JSON.stringify(messages)],
                    (err) => {
                        if (err) reject(err);
                        else resolve(session_id);
                    }
                );
            }
        });
    });
}

// File upload endpoint
app.post('/api/upload/excel', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    try {
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        // Process the Excel data and insert into database
        processExcelData(data, req.file.originalname)
            .then(result => {
                // Clean up uploaded file
                fs.unlinkSync(req.file.path);
                res.json({
                    message: 'File processed successfully',
                    recordsProcessed: result.processed,
                    recordsSkipped: result.skipped
                });
            })
            .catch(error => {
                console.error('Error processing Excel file:', error);
                fs.unlinkSync(req.file.path);
                res.status(500).json({ error: 'Failed to process Excel file' });
            });
            
    } catch (error) {
        console.error('Error reading Excel file:', error);
        if (req.file && req.file.path) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Invalid Excel file format' });
    }
});

// Process Excel data
async function processExcelData(data, filename) {
    return new Promise((resolve, reject) => {
        let processed = 0;
        let skipped = 0;
        
        // Determine university from filename
        const universityName = extractUniversityFromFilename(filename);
        
        if (!universityName) {
            reject(new Error('Could not determine university from filename'));
            return;
        }
        
        // Get or create university
        db.get("SELECT id FROM universities WHERE name = ?", [universityName], (err, university) => {
            if (err) {
                reject(err);
                return;
            }
            
            let universityId;
            if (university) {
                universityId = university.id;
                processRows();
            } else {
                // Create new university
                db.run("INSERT INTO universities (name, country, type) VALUES (?, ?, ?)", 
                    [universityName, 'Unknown', 'Unknown'], 
                    function(err) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        universityId = this.lastID;
                        processRows();
                    }
                );
            }
            
            function processRows() {
                // Process each row of data
                data.forEach((row, index) => {
                    // Skip empty rows
                    if (!row.Journal || !row.Title) {
                        skipped++;
                        return;
                    }
                    
                    // Insert or get journal
                    db.get("SELECT id FROM journals WHERE title = ?", [row.Journal || row.Title], (err, journal) => {
                        if (err) {
                            console.error(`Error processing row ${index}:`, err);
                            skipped++;
                            return;
                        }
                        
                        let journalId;
                        if (journal) {
                            journalId = journal.id;
                            insertSubscription();
                        } else {
                            // Create new journal
                            db.run(
                                "INSERT INTO journals (title, issn, publisher, subject_area, impact_factor) VALUES (?, ?, ?, ?, ?)",
                                [
                                    row.Journal || row.Title,
                                    row.ISSN || '',
                                    row.Publisher || '',
                                    row.Subject || row['Subject Area'] || '',
                                    parseFloat(row['Impact Factor']) || 0
                                ],
                                function(err) {
                                    if (err) {
                                        console.error(`Error creating journal for row ${index}:`, err);
                                        skipped++;
                                        return;
                                    }
                                    journalId = this.lastID;
                                    insertSubscription();
                                }
                            );
                        }
                        
                        function insertSubscription() {
                            // Insert subscription data
                            db.run(`
                                INSERT OR REPLACE INTO subscriptions 
                                (university_id, journal_id, subscription_type, start_date, end_date, annual_cost, usage_count, status) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `, [
                                universityId,
                                journalId,
                                row['Subscription Type'] || 'institutional',
                                row['Start Date'] || '2024-01-01',
                                row['End Date'] || '2024-12-31',
                                parseFloat(row.Cost || row['Annual Cost']) || 0,
                                parseInt(row.Usage || row['Usage Count']) || 0,
                                row.Status || 'active'
                            ], (err) => {
                                if (err) {
                                    console.error(`Error inserting subscription for row ${index}:`, err);
                                    skipped++;
                                } else {
                                    processed++;
                                }
                                
                                // Check if all rows are processed
                                if (processed + skipped === data.length) {
                                    resolve({ processed, skipped });
                                }
                            });
                        }
                    });
                });
            }
        });
    });
}

// Extract university name from filename
function extractUniversityFromFilename(filename) {
    const patterns = [
        /National_University_of_Singapore/i,
        /Nanyang_Technological_University/i,
        /Mahidol_University/i,
        /Aalborg_University/i
    ];
    
    const names = [
        'National University of Singapore',
        'Nanyang Technological University', 
        'Mahidol University',
        'Aalborg University'
    ];
    
    for (let i = 0; i < patterns.length; i++) {
        if (patterns[i].test(filename)) {
            return names[i];
        }
    }
    
    return null;
}

// Export data endpoint
app.get('/api/export/csv', (req, res) => {
    const universityFilter = req.query.university;
    
    let whereClause = '';
    let params = [];
    
    if (universityFilter && universityFilter !== 'all') {
        whereClause = 'WHERE u.name = ?';
        params = [universityFilter];
    }
    
    const query = `
        SELECT 
            u.name as University,
            u.country as Country,
            j.title as Journal,
            j.issn as ISSN,
            j.publisher as Publisher,
            j.subject_area as "Subject Area",
            j.impact_factor as "Impact Factor",
            s.subscription_type as "Subscription Type",
            s.annual_cost as "Annual Cost",
            s.usage_count as "Usage Count",
            s.status as Status,
            COALESCE(SUM(ua.downloads), 0) as "Total Downloads",
            COALESCE(SUM(ua.views), 0) as "Total Views"
        FROM subscriptions s
        JOIN universities u ON s.university_id = u.id
        JOIN journals j ON s.journal_id = j.id
        LEFT JOIN usage_analytics ua ON s.id = ua.subscription_id
        ${whereClause}
        GROUP BY s.id
        ORDER BY u.name, j.title
    `;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Convert to CSV format
        if (rows.length === 0) {
            res.status(404).json({ error: 'No data found' });
            return;
        }
        
        const headers = Object.keys(rows[0]);
        let csv = headers.join(',') + '\n';
        
        rows.forEach(row => {
            const values = headers.map(header => {
                let value = row[header];
                if (typeof value === 'string' && value.includes(',')) {
                    value = `"${value}"`;
                }
                return value || '';
            });
            csv += values.join(',') + '\n';
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=publishing-data-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    });
});

// Search endpoint
app.get('/api/search', (req, res) => {
    const query = req.query.q;
    const type = req.query.type || 'all'; // journals, universities, subscriptions
    
    if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
    }
    
    const searchQueries = {
        journals: `
            SELECT 'journal' as type, id, title as name, publisher as details, subject_area as category
            FROM journals 
            WHERE title LIKE ? OR publisher LIKE ? OR subject_area LIKE ?
        `,
        universities: `
            SELECT 'university' as type, id, name, country as details, type as category
            FROM universities 
            WHERE name LIKE ? OR country LIKE ?
        `,
        subscriptions: `
            SELECT 'subscription' as type, s.id, 
                   u.name || ' - ' || j.title as name,
                   'Cost: $' || s.annual_cost as details,
                   s.status as category
            FROM subscriptions s
            JOIN universities u ON s.university_id = u.id
            JOIN journals j ON s.journal_id = j.id
            WHERE u.name LIKE ? OR j.title LIKE ?
        `
    };
    
    const searchTerm = `%${query}%`;
    let finalQuery;
    let params;
    
    if (type === 'all') {
        finalQuery = Object.values(searchQueries).join(' UNION ') + ' LIMIT 50';
        params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];
    } else if (searchQueries[type]) {
        finalQuery = searchQueries[type] + ' LIMIT 20';
        params = type === 'journals' ? [searchTerm, searchTerm, searchTerm] : [searchTerm, searchTerm];
    } else {
        return res.status(400).json({ error: 'Invalid search type' });
    }
    
    db.all(finalQuery, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
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

// Start server
app.listen(PORT, () => {
    console.log(`Publishing Intelligence Platform running on port ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
    console.log(`API: http://localhost:${PORT}/api`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;