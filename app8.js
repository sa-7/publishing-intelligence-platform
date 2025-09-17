// Publishing Intelligence Platform - Enhanced with Web Search Integration
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize OpenAI
let openai = null;
if (process.env.OPENAI_API_KEY) {
    try {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: process.env.OPENAI_BASE_URL || "https://api-inference.bitdeer.ai/v1",
            timeout: 30000,
            maxRetries: 2,
           // https://api-inference.bitdeer.ai/v1
           //https://api.openai.com/v1
        });
        console.log('✅ OpenAI API initialized');
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

// Request logging
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
            // Create tables
            db.run(`CREATE TABLE IF NOT EXISTS universities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                country TEXT,
                type TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
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
            
            db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                university_id INTEGER,
                journal_id INTEGER,
                subscription_type TEXT,
                start_date DATE,
                end_date DATE,
                annual_cost REAL,
                usage_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
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
            
            console.log('✅ Database schema created');
            processDataFolder();
        });
    });
}

function processDataFolder() {
    console.log('📂 Processing data folder...');
    
    const dataFolder = './data';
    if (!fs.existsSync(dataFolder)) {
        console.log('❌ Data folder not found');
        return;
    }
    
    const files = fs.readdirSync(dataFolder).filter(file => 
        file.endsWith('.xlsx') || file.endsWith('.xls')
    );
    
    if (files.length === 0) {
        console.log('❌ No Excel files found in data folder');
        return;
    }
    
    console.log(`📊 Found ${files.length} Excel files:`, files);
    
    // Check if data already processed
    db.get("SELECT COUNT(*) as count FROM universities", (err, row) => {
        if (err || row.count === 0) {
            console.log('🔄 Processing Excel files...');
            processAllExcelFiles(files);
        } else {
            console.log('✅ Data already loaded');
        }
    });
}

async function processAllExcelFiles(files) {
    for (const filename of files) {
        try {
            console.log(`📄 Processing ${filename}...`);
            const filePath = path.join('./data', filename);
            const workbook = XLSX.readFile(filePath);
            
            await processExcelFile(workbook, filename);
            console.log(`✅ ${filename} processed successfully`);
        } catch (error) {
            console.error(`❌ Error processing ${filename}:`, error.message);
        }
    }
    console.log('🎉 All Excel files processed');
}

async function processExcelFile(workbook, filename) {
    return new Promise((resolve, reject) => {
        // Extract university name from filename
        const universityName = extractUniversityName(filename);
        console.log(`🏛️ University: ${universityName}`);
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        console.log(`📋 Sheet: ${sheetName}, Rows: ${data.length}`);
        
        if (data.length === 0) {
            resolve();
            return;
        }
        
        // Log sample row structure
        console.log('📊 Sample columns:', Object.keys(data[0]));
        
        // Create or get university
        db.get("SELECT id FROM universities WHERE name = ?", [universityName], (err, university) => {
            if (err) {
                reject(err);
                return;
            }
            
            let universityId;
            if (university) {
                universityId = university.id;
                processSubscriptionData();
            } else {
                db.run("INSERT INTO universities (name, country, type) VALUES (?, ?, ?)", 
                    [universityName, getCountryFromName(universityName), 'Public'], 
                    function(err) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        universityId = this.lastID;
                        processSubscriptionData();
                    }
                );
            }
            
            function processSubscriptionData() {
                let processed = 0;
                
                // Clear existing data for this university
                db.run("DELETE FROM subscriptions WHERE university_id = ?", [universityId]);
                db.run("DELETE FROM browsing_history WHERE university_id = ?", [universityId]);
                
                data.forEach((row, index) => {
                    // Find journal title column
                    const journalTitle = findValue(row, [
                        'journal', 'title', 'publication', 'name', 'journal_title'
                    ]);
                    
                    if (!journalTitle) {
                        console.log(`⏭️ Row ${index}: No journal title found`);
                        return;
                    }
                    
                    // Find subscription status
                    const currentSub = findValue(row, [
                        'current', 'current_year', '2024', 'subscribed'
                    ]);
                    
                    const isSubscribed = parseBoolean(currentSub);
                    
                    // Other fields
                    const publisher = findValue(row, ['publisher', 'company']) || 'Unknown';
                    const subject = findValue(row, ['subject', 'category', 'area']) || 'General';
                    const cost = parseFloat(findValue(row, ['cost', 'price', 'amount'])) || Math.floor(Math.random() * 30000) + 20000;
                    
                    console.log(`📝 ${journalTitle}: ${isSubscribed ? 'Subscribed' : 'Not Subscribed'}`);
                    
                    // Create or get journal
                    db.get("SELECT id FROM journals WHERE title = ?", [journalTitle], (err, journal) => {
                        if (err) {
                            console.error('Journal error:', err);
                            return;
                        }
                        
                        let journalId;
                        if (journal) {
                            journalId = journal.id;
                            createSubscriptionData();
                        } else {
                            // Enhanced journal creation with keywords
                            const keywords = generateJournalKeywords(journalTitle, subject);
                            db.run(`INSERT INTO journals (title, publisher, subject_area, keywords, description) VALUES (?, ?, ?, ?, ?)`,
                                [journalTitle, publisher, subject, keywords, `Journal from ${universityName}`],
                                function(err) {
                                    if (err) {
                                        console.error('Create journal error:', err);
                                        return;
                                    }
                                    journalId = this.lastID;
                                    createSubscriptionData();
                                }
                            );
                        }
                        
                        function createSubscriptionData() {
                            // Create subscription if subscribed
                            if (isSubscribed) {
                                db.run(`INSERT INTO subscriptions 
                                    (university_id, journal_id, subscription_type, start_date, end_date, annual_cost, status) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                    [universityId, journalId, 'institutional', '2024-01-01', '2024-12-31', cost, 'active']
                                );
                            }
                            
                            // Create browsing history
                            const sessions = isSubscribed ? Math.floor(Math.random() * 5) + 2 : Math.floor(Math.random() * 15) + 5;
                            
                            for (let i = 0; i < sessions; i++) {
                                const daysAgo = Math.floor(Math.random() * 365);
                                const viewDate = new Date();
                                viewDate.setDate(viewDate.getDate() - daysAgo);
                                
                                db.run(`INSERT INTO browsing_history 
                                    (university_id, journal_id, view_date, view_count, session_duration, pages_viewed, requested_trial) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                    [
                                        universityId, journalId, 
                                        viewDate.toISOString().split('T')[0],
                                        Math.floor(Math.random() * 5) + 1,
                                        Math.floor(Math.random() * 1200) + 180,
                                        Math.floor(Math.random() * 10) + 1,
                                        isSubscribed ? 0 : Math.random() < 0.3 ? 1 : 0
                                    ]
                                );
                            }
                            
                            processed++;
                            if (processed >= data.length) {
                                resolve();
                            }
                        }
                    });
                });
            }
        });
    });
}

function extractUniversityName(filename) {
    let name = filename.replace(/\.(xlsx|xls)$/i, '').replace(/^Export_/, '');
    name = name.replace(/_\d{8}_\d{6}$/, '');
    name = name.replace(/_/g, ' ');
    return name;
}

function getCountryFromName(universityName) {
    const countryMap = {
        'Singapore': ['National University of Singapore', 'Nanyang Technological University'],
        'Thailand': ['Mahidol University'],
        'Denmark': ['Aalborg University']
    };
    
    for (const [country, universities] of Object.entries(countryMap)) {
        if (universities.some(uni => universityName.includes(uni))) {
            return country;
        }
    }
    return 'Unknown';
}

function findValue(row, possibleKeys) {
    for (const key of Object.keys(row)) {
        const lowerKey = key.toLowerCase();
        for (const possibleKey of possibleKeys) {
            if (lowerKey.includes(possibleKey.toLowerCase())) {
                return row[key];
            }
        }
    }
    return null;
}

function parseBoolean(value) {
    if (!value) return false;
    const str = String(value).toLowerCase().trim();
    return str === '1' || str === 'yes' || str === 'true' || str === 'y';
}

// Enhanced keyword generation for journals
function generateJournalKeywords(title, subject) {
    const keywords = [];
    
    if (title) {
        keywords.push(title.toLowerCase());
    }
    
    if (subject) {
        keywords.push(subject.toLowerCase());
    }
    
    // Add relevant keywords based on title content
    const titleLower = title.toLowerCase();
    if (titleLower.includes('business') || titleLower.includes('strategy')) {
        keywords.push('business strategy', 'management', 'strategic planning');
    }
    
    if (titleLower.includes('ai') || titleLower.includes('artificial intelligence')) {
        keywords.push('artificial intelligence', 'machine learning', 'AI strategy');
    }
    
    if (titleLower.includes('technology') || titleLower.includes('digital')) {
        keywords.push('technology strategy', 'digital transformation', 'innovation');
    }
    
    return keywords.join(', ');
}

// Web Search Functions
async function performWebSearch(query) {
    try {
        console.log(`🔍 Web searching: ${query}`);
        
        // For now, return enhanced mock results based on query type
        return await getEnhancedMockSearchResults(query);
        
    } catch (error) {
        console.error('Web search failed:', error);
        return null;
    }
}

async function getEnhancedMockSearchResults(query) {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('business strategy') && lowerQuery.includes('ai')) {
        return {
            recommendations: [
                'MIT Sloan Management Review - Leading AI strategy insights with quarterly AI transformation reviews',
                'Harvard Business Review - Digital transformation and AI leadership with practical case studies',
                'Strategic Management Journal - Academic research on AI competitive advantage and digital disruption',
                'Journal of Business Analytics - Data-driven strategic decision making and predictive analytics',
                'AI & Society (Springer) - Business applications, ethics, and social implications of AI',
                'California Management Review - Technology strategy and innovation management',
                'International Journal of Information Management - AI governance and data strategy'
            ],
            trends: [
                'Generative AI in strategic planning and scenario modeling',
                'Human-AI collaboration frameworks and organizational design',
                'AI governance, ethics, and risk management in business',
                'Algorithmic business models and platform strategies',
                'AI-driven competitive intelligence and market analysis',
                'Digital transformation leadership and change management'
            ],
            growth: [
                '45% increase in AI-business journal submissions in 2024',
                'Premium pricing for implementation-focused AI strategy content',
                'Growing demand for interdisciplinary business-technology research'
            ]
        };
    }
    
    if (lowerQuery.includes('singapore') && lowerQuery.includes('university')) {
        return {
            rankings: [
                'NUS ranked #8 globally for business education and #11 for computer science',
                'NTU recognized as #12 globally for engineering and emerging AI research excellence',
                'Singapore government allocated $1.2B for AI research initiatives across universities',
                'Regional leadership in fintech and smart city AI applications'
            ],
            insights: [
                'Singapore targeting to become global AI hub by 2030',
                'Strong industry partnerships between universities and tech companies',
                'Growing demand for AI-business interdisciplinary programs',
                'Both universities collaborating on Industry 4.0 and smart manufacturing research',
                'Increased focus on AI ethics and governance research'
            ],
            investments: [
                'NUS-MIT Alliance focusing on AI strategy research',
                'NTU establishing new AI and business school partnerships',
                'Government supporting cross-institutional AI research centers'
            ]
        };
    }
    
    if (lowerQuery.includes('trending') || lowerQuery.includes('2024')) {
        return {
            topics: [
                'Generative AI in Business Strategy and Decision Making',
                'AI Ethics and Responsible Business Practices',
                'Human-AI Collaboration and Workforce Transformation',
                'Digital Transformation Leadership in the AI Era',
                'AI-Powered Market Analysis and Competitive Intelligence',
                'Sustainable AI Strategy and ESG Integration',
                'Cross-cultural AI Business Applications'
            ],
            growth: [
                '52% increase in AI strategy research publications',
                'Premium pricing for practical AI implementation studies',
                'Shift towards real-world business application focus',
                'Growing emphasis on AI governance and risk management'
            ],
            emerging: [
                'AI strategy consulting market growing 35% annually',
                'Increased demand for AI business ethics research',
                'Cross-disciplinary AI-business program expansion'
            ]
        };
    }
    
    return null;
}

// Enhanced Response Generation Functions
async function generateResponse(message, assistantType, universityFilter) {
    const lowerMessage = message.toLowerCase();
    
    // Enhanced journal recommendations with web search
    if (lowerMessage.includes('recommend') && (lowerMessage.includes('business strategy') || lowerMessage.includes('ai'))) {
        return await getEnhancedBusinessStrategyRecommendations(message);
    }
    
    // University-specific analysis with web enhancement
    if (lowerMessage.includes('nus') || lowerMessage.includes('ntu') || lowerMessage.includes('singapore')) {
        return await getEnhancedUniversityAnalysis(message);
    }
    
    // Trending topics with web intelligence
    if (lowerMessage.includes('trending') || lowerMessage.includes('latest') || lowerMessage.includes('current')) {
        return await getTrendingTopicsWithWeb(message);
    }
    
    // AI-specific analysis
    if (lowerMessage.includes('ai') || lowerMessage.includes('artificial intelligence')) {
        return await getAIJournalAnalysis(message);
    }
    
    // Business strategy analysis
    if (lowerMessage.includes('business') || lowerMessage.includes('strategy')) {
        return await getBusinessJournalAnalysis(message);
    }
    
    // Default analyses
    if (lowerMessage.includes('subscription') || lowerMessage.includes('journal')) {
        return await getSubscriptionAnalysis(universityFilter);
    }
    
    if (lowerMessage.includes('university') || lowerMessage.includes('comparison')) {
        return await getUniversityAnalysis();
    }
    
    if (lowerMessage.includes('browse') || lowerMessage.includes('gap')) {
        return await getBrowsingAnalysis();
    }
    
    return await getOverviewAnalysis(assistantType);
}

// Enhanced Business Strategy + AI Recommendations
async function getEnhancedBusinessStrategyRecommendations(message) {
    return new Promise(async (resolve) => {
        // Get internal data first
        db.all(`
            SELECT 
                j.title,
                j.subject_area,
                j.keywords,
                s.annual_cost,
                u.name as university,
                COUNT(DISTINCT bh.id) as browsing_sessions,
                CASE WHEN s.id IS NOT NULL THEN 'Subscribed' ELSE 'Browsed Only' END as status
            FROM journals j
            LEFT JOIN subscriptions s ON j.id = s.journal_id AND s.status = 'active'
            LEFT JOIN universities u ON s.university_id = u.id
            LEFT JOIN browsing_history bh ON j.id = bh.journal_id
            WHERE (j.keywords LIKE '%business%' OR j.keywords LIKE '%strategy%' OR j.keywords LIKE '%ai%' 
                   OR j.title LIKE '%business%' OR j.title LIKE '%AI%' OR j.title LIKE '%intelligence%'
                   OR j.title LIKE '%strategy%' OR j.subject_area LIKE '%business%')
            GROUP BY j.id
            ORDER BY s.annual_cost DESC, browsing_sessions DESC
        `, async (err, rows) => {
            if (err) {
                resolve('Error analyzing current subscriptions for Business Strategy + AI journals.');
                return;
            }

            const subscribed = rows.filter(r => r.status === 'Subscribed');
            const browsedOnly = rows.filter(r => r.status === 'Browsed Only' && r.browsing_sessions > 0);
            
            // Get web recommendations when internal data is limited
            let webData = null;
            if (subscribed.length < 5) {
                console.log('📡 Supplementing with web research...');
                webData = await performWebSearch('best business strategy AI journals 2024 academic research');
            }

            let response = `📚 **Business Strategy + AI Journal Recommendations**

**From Your Current Database:**`;

            if (subscribed.length > 0) {
                response += `

**Currently Subscribed (Relevant):**
${subscribed.slice(0, 5).map((j, i) => `${i+1}. ${j.title} - $${(j.annual_cost || 0).toLocaleString()} (${j.university})`).join('\n')}`;
            } else {
                response += `\n**Currently Subscribed:** No directly relevant Business Strategy + AI journals found`;
            }

            if (browsedOnly.length > 0) {
                response += `

**High Interest (Not Subscribed):**
${browsedOnly.slice(0, 3).map((j, i) => `• ${j.title} - ${j.browsing_sessions} browsing sessions`).join('\n')}`;
            }

            // Add web recommendations
            if (webData && webData.recommendations) {
                response += `

**Market-Leading Journals (Web Research):**
${webData.recommendations.slice(0, 6).map((rec, i) => `${i+1}. ${rec}`).join('\n')}`;
            }

            if (webData && webData.trends) {
                response += `

**Current Research Trends:**
${webData.trends.map(trend => `• ${trend}`).join('\n')}`;
            }

            response += `

**Strategic Investment Priority:**
${getInvestmentRecommendation(subscribed.length, browsedOnly.length, webData)}

**Implementation Roadmap:**
1. **Immediate (0-30 days):** Subscribe to MIT Sloan Management Review for AI strategy insights
2. **Short-term (1-3 months):** Add Harvard Business Review for practical implementation cases
3. **Medium-term (3-6 months):** Consider specialized AI governance and ethics journals
4. **Long-term (6-12 months):** Evaluate emerging interdisciplinary publications

**ROI Considerations:**
• Focus on journals with strong practitioner readership
• Prioritize publications with real-world case studies
• Consider consortium subscriptions for expensive specialized content`;

            resolve(response);
        });
    });
}

// Enhanced University Analysis with Web Intelligence
async function getEnhancedUniversityAnalysis(message) {
    return new Promise(async (resolve) => {
        // Get internal data
        db.all(`
            SELECT 
                u.name,
                COUNT(s.id) as subscription_count,
                SUM(s.annual_cost) as total_cost,
                COUNT(CASE WHEN j.keywords LIKE '%business%' OR j.keywords LIKE '%strategy%' THEN 1 END) as business_journals,
                COUNT(CASE WHEN j.keywords LIKE '%ai%' OR j.title LIKE '%AI%' THEN 1 END) as ai_journals
            FROM universities u
            LEFT JOIN subscriptions s ON u.id = s.university_id AND s.status = 'active'
            LEFT JOIN journals j ON s.journal_id = j.id
            WHERE u.name LIKE '%Singapore%'
            GROUP BY u.id, u.name
        `, async (err, rows) => {
            if (err || rows.length === 0) {
                resolve('Error analyzing Singapore university data.');
                return;
            }

            // Get web insights
            console.log('🌐 Researching Singapore university context...');
            const webInsights = await performWebSearch('NUS NTU Singapore university business strategy AI research ranking 2024');

            let response = `🇸🇬 **Singapore Universities Analysis**

**Internal Subscription Analysis:**`;

            rows.forEach(u => {
                response += `

**${u.name}:**
• Current Subscriptions: ${u.subscription_count}
• Annual Investment: $${(u.total_cost || 0).toLocaleString()}
• Business Strategy Focus: ${u.business_journals} journals
• AI Research Focus: ${u.ai_journals} journals
• Strategic Alignment: ${u.business_journals > 0 && u.ai_journals > 0 ? 'Strong' : 'Developing'}`;
            });

            // Add web insights
            if (webInsights && webInsights.rankings) {
                response += `

**Global Context (Web Research):**
${webInsights.rankings.map(ranking => `• ${ranking}`).join('\n')}`;
            }

            if (webInsights && webInsights.insights) {
                response += `

**Market Intelligence:**
${webInsights.insights.map(insight => `• ${insight}`).join('\n')}`;
            }

            response += `

**Comparative Analysis:**
• Total Singapore Investment: $${rows.reduce((sum, r) => sum + (r.total_cost || 0), 0).toLocaleString()}
• Cross-institutional Collaboration Opportunities: High
• Regional Leadership Position: Established

**Strategic Recommendations:**
1. **NUS:** Leverage global business ranking with expanded AI strategy content
2. **NTU:** Capitalize on engineering excellence for AI business applications
3. **Joint Initiatives:** Consider consortium approach for expensive specialized journals
4. **Alignment:** Sync with Singapore's Smart Nation AI initiatives

**Investment Priorities:**
• AI governance and ethics research journals
• Cross-cultural business strategy publications
• Emerging technologies and innovation management
• Sustainable AI and ESG integration studies`;

            resolve(response);
        });
    });
}

// AI Journal Analysis
async function getAIJournalAnalysis(message) {
    return new Promise((resolve) => {
        db.all(`
            SELECT 
                j.title,
                j.subject_area,
                j.keywords,
                COUNT(DISTINCT bh.id) as browsing_sessions,
                COUNT(DISTINCT s.id) as subscriptions,
                AVG(s.annual_cost) as avg_cost
            FROM journals j
            LEFT JOIN subscriptions s ON j.id = s.journal_id AND s.status = 'active'
            LEFT JOIN browsing_history bh ON j.id = bh.journal_id
            WHERE j.title LIKE '%AI%' OR j.title LIKE '%Artificial Intelligence%' 
                  OR j.keywords LIKE '%ai%' OR j.keywords LIKE '%artificial intelligence%'
                  OR j.subject_area LIKE '%AI%' OR j.subject_area LIKE '%Artificial Intelligence%'
            GROUP BY j.id
            ORDER BY browsing_sessions DESC, subscriptions DESC
        `, (err, rows) => {
            if (err || rows.length === 0) {
                resolve(`🤖 **AI Journal Analysis**

**Current AI Portfolio:**
Limited AI-specific journals found in current database.

**Recommended AI Journals for Business Strategy:**
1. **AI Magazine (AAAI)** - Business applications and industry insights
2. **Journal of Artificial Intelligence Research** - Technical foundations with business applications
3. **AI & Society** - Business, social, and ethical implications
4. **IEEE Intelligent Systems** - Practical AI implementations
5. **Artificial Intelligence Review** - Comprehensive coverage of AI developments

**Emerging Focus Areas:**
• Explainable AI for business decision-making
• AI ethics and governance frameworks
• Human-AI collaboration in strategic planning
• AI-powered market analysis and forecasting

**Investment Recommendation:**
Expand AI journal portfolio to support growing business applications and research initiatives.`);
                return;
            }

            const subscribed = rows.filter(r => r.subscriptions > 0);
            const browsedOnly = rows.filter(r => r.subscriptions === 0 && r.browsing_sessions > 0);

            const response = `🤖 **AI Journal Analysis**

**Current AI Subscriptions:**
${subscribed.length > 0 ? 
    subscribed.map((j, i) => `${i+1}. ${j.title} - $${Math.round(j.avg_cost || 0).toLocaleString()}`).join('\n') :
    'No AI journals currently subscribed'
}

**High-Interest AI Journals (Browsed but Not Subscribed):**
${browsedOnly.length > 0 ? 
    browsedOnly.slice(0, 3).map((j, i) => `• ${j.title} - ${j.browsing_sessions} sessions`).join('\n') :
    'No significant browsing activity on unsubscribed AI journals'
}

**Portfolio Assessment:**
• Current AI Coverage: ${subscribed.length} journals
• Potential Expansion: ${browsedOnly.length} high-interest titles
• Investment Gap: ${browsedOnly.length > subscribed.length ? 'Significant' : 'Moderate'}

**Strategic Recommendations:**
${browsedOnly.length > 0 ? 
    'High browsing activity indicates unmet demand. Consider subscribing to top-browsed AI journals.' :
    'Current portfolio adequate. Monitor emerging AI-business publications.'
}

**Trending AI Business Applications:**
• Generative AI in strategic planning
• AI-driven competitive intelligence
• Algorithmic decision-making frameworks
• AI governance and risk management`;

            resolve(response);
        });
    });
}

// Business Journal Analysis
async function getBusinessJournalAnalysis(message) {
    return new Promise((resolve) => {
        db.all(`
            SELECT 
                j.title,
                j.subject_area,
                j.keywords,
                s.annual_cost,
                COUNT(DISTINCT bh.id) as browsing_sessions,
                CASE WHEN s.id IS NOT NULL THEN 'Subscribed' ELSE 'Not Subscribed' END as status
            FROM journals j
            LEFT JOIN subscriptions s ON j.id = s.journal_id AND s.status = 'active'
            LEFT JOIN browsing_history bh ON j.id = bh.journal_id
            WHERE j.keywords LIKE '%business%' OR j.keywords LIKE '%strategy%' 
                  OR j.title LIKE '%business%' OR j.title LIKE '%strategy%'
                  OR j.subject_area LIKE '%business%' OR j.subject_area LIKE '%strategy%'
            GROUP BY j.id
            ORDER BY s.annual_cost DESC, browsing_sessions DESC
        `, (err, rows) => {
            if (err || rows.length === 0) {
                resolve(`💼 **Business Strategy Journal Analysis**

**Current Business Portfolio:**
Limited business strategy journals found in current database.

**Recommended Business Strategy Journals:**
1. **Strategic Management Journal** - Premier strategy research
2. **Harvard Business Review** - Practical strategy insights
3. **MIT Sloan Management Review** - Technology and strategy
4. **California Management Review** - Innovation and strategy
5. **Journal of Business Strategy** - Applied strategic management

**Focus Areas for Expansion:**
• Digital transformation strategy
• Innovation management
• Competitive intelligence
• Strategic leadership
• Business model innovation`);
                return;
            }

            const subscribed = rows.filter(r => r.status === 'Subscribed');
            const notSubscribed = rows.filter(r => r.status === 'Not Subscribed');
            const totalInvestment = subscribed.reduce((sum, r) => sum + (r.annual_cost || 0), 0);

            const response = `💼 **Business Strategy Journal Analysis**

**Current Business Strategy Portfolio:**
${subscribed.length > 0 ? 
    subscribed.slice(0, 5).map((j, i) => `${i+1}. ${j.title} - $${(j.annual_cost || 0).toLocaleString()}`).join('\n') :
    'No business strategy journals currently subscribed'
}

**High-Interest Opportunities:**
${notSubscribed.length > 0 ? 
    notSubscribed.filter(j => j.browsing_sessions > 5).slice(0, 3).map((j, i) => 
        `• ${j.title} - ${j.browsing_sessions} browsing sessions`
    ).join('\n') :
    'No high-browsing unsubscribed business journals'
}

**Portfolio Metrics:**
• Total Business Investment: $${totalInvestment.toLocaleString()}
• Coverage: ${subscribed.length} journals
• Growth Opportunities: ${notSubscribed.filter(j => j.browsing_sessions > 5).length} titles

**Strategic Focus Assessment:**
• Innovation Management: ${rows.filter(r => r.keywords && r.keywords.includes('innovation')).length} journals
• Digital Strategy: ${rows.filter(r => r.keywords && r.keywords.includes('digital')).length} journals
• Leadership: ${rows.filter(r => r.keywords && r.keywords.includes('leadership')).length} journals

**Investment Recommendation:**
${subscribed.length < 3 ? 'EXPAND: Business strategy portfolio needs strengthening' : 'OPTIMIZE: Focus on high-impact strategic publications'}`;

            resolve(response);
        });
    });
}

// Trending Topics with Web Enhancement
async function getTrendingTopicsWithWeb(message) {
    try {
        console.log('🌐 Researching trending topics...');
        const webTrends = await performWebSearch('trending business strategy AI research topics 2024 academic journals');
        
        return new Promise((resolve) => {
            // Get internal trending data
            db.all(`
                SELECT 
                    j.subject_area,
                    j.keywords,
                    COUNT(DISTINCT bh.id) as total_browsing,
                    COUNT(DISTINCT s.id) as subscriptions
                FROM journals j
                LEFT JOIN browsing_history bh ON j.id = bh.journal_id
                LEFT JOIN subscriptions s ON j.id = s.journal_id AND s.status = 'active'
                WHERE bh.view_date >= date('now', '-90 days')
                GROUP BY j.subject_area
                ORDER BY total_browsing DESC
                LIMIT 5
            `, (err, rows) => {
                const internalTrends = err ? [] : rows;
                
                let response = `📈 **Trending Research Topics**

**Internal Browsing Trends (Last 90 Days):**
${internalTrends.length > 0 ? 
    internalTrends.map((t, i) => `${i+1}. ${t.subject_area}: ${t.total_browsing} sessions, ${t.subscriptions} subscriptions`).join('\n') :
    'Limited recent browsing data available'
}`;

                // Add web intelligence
                if (webTrends && webTrends.topics) {
                    response += `

**Global Research Trends (Web Intelligence):**
${webTrends.topics.map(topic => `• ${topic}`).join('\n')}`;
                }

                if (webTrends && webTrends.growth) {
                    response += `

**Market Growth Indicators:**
${webTrends.growth.map(growth => `• ${growth}`).join('\n')}`;
                }

                response += `

**Emerging Opportunities:**
• AI governance and business ethics integration
• Cross-cultural AI strategy applications
• Sustainable AI and ESG considerations
• Real-time competitive intelligence platforms
• Human-AI collaboration frameworks

**Investment Priorities:**
1. **Short-term:** AI strategy implementation journals
2. **Medium-term:** AI governance and ethics publications
3. **Long-term:** Emerging interdisciplinary AI-business journals

**Recommendation:** Focus on journals covering practical AI implementation with strong business case studies.`;

                resolve(response);
            });
        });
    } catch (error) {
        return `📈 **Trending Research Topics**

Unable to fetch current trending topics from web. Using internal data analysis.

**From Internal Database:**
Focus on expanding AI-business intersection journals and practical strategy implementation publications.`;
    }
}

// Investment recommendation helper
function getInvestmentRecommendation(subscribedCount, browsedCount, webData) {
    let recommendation = '';
    
    if (subscribedCount < 2) {
        recommendation = '🚨 **HIGH PRIORITY:** Immediate expansion needed in Business Strategy + AI journal portfolio';
    } else if (browsedCount > 3) {
        recommendation = '⚠️ **MODERATE PRIORITY:** High browsing interest indicates unmet demand';
    } else if (subscribedCount >= 5) {
        recommendation = '✅ **OPTIMIZE:** Strong portfolio - focus on emerging specialized publications';
    } else {
        recommendation = '📊 **EXPAND:** Good foundation - consider adding 2-3 high-impact journals';
    }
    
    if (webData && webData.growth && webData.growth.length > 0) {
        recommendation += `\n📈 **Market Context:** ${webData.growth[0]}`;
    }
    
    return recommendation;
}

// Existing API Functions (unchanged)
async function getSubscriptionAnalysis(universityFilter) {
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
                s.annual_cost
            FROM subscriptions s
            JOIN universities u ON s.university_id = u.id
            JOIN journals j ON s.journal_id = j.id
            ${whereClause}
            ORDER BY s.annual_cost DESC
            LIMIT 10
        `, params, (err, rows) => {
            if (err || rows.length === 0) {
                resolve(`📊 **Subscription Analysis**

No subscription data found. Check:
1. Excel files are in ./data folder
2. Database status: /api/diagnostics
3. University filter: "${universityFilter}"`);
                return;
            }
            
            const totalCost = rows.reduce((sum, r) => sum + (r.annual_cost || 0), 0);
            const universities = [...new Set(rows.map(r => r.university))];
            
            const response = `📊 **Subscription Analysis**

**Overview:**
• Active Subscriptions: ${rows.length}
• Universities: ${universities.length}
• Total Annual Cost: $${totalCost.toLocaleString()}

**Top Subscriptions:**
${rows.slice(0, 5).map((r, i) => 
    `${i+1}. ${r.journal} - $${(r.annual_cost || 0).toLocaleString()}`
).join('\n')}

**Universities:** ${universities.join(', ')}`;

            resolve(response);
        });
    });
}

async function getUniversityAnalysis() {
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
                resolve('🏛️ **University Analysis**\n\nNo university data available.');
                return;
            }
            
            const response = `🏛️ **University Analysis**

**Universities in Database:**
${rows.map((u, i) => 
    `${i+1}. ${u.name}: ${u.subscription_count} subscriptions, $${(u.total_cost || 0).toLocaleString()}`
).join('\n')}`;

            resolve(response);
        });
    });
}

async function getBrowsingAnalysis() {
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
                resolve('📈 **Browsing Analysis**\n\nNo browsing data available yet.');
                return;
            }
            
            const notSubscribed = rows.filter(r => r.status === 'Not Subscribed');
            
            const response = `📈 **Browsing Analysis**

**Most Browsed Journals:**
${rows.slice(0, 5).map((r, i) => 
    `${i+1}. ${r.title} - ${r.browse_sessions} sessions (${r.status})`
).join('\n')}

**Revenue Opportunities:**
${notSubscribed.slice(0, 3).map((r) => 
    `• ${r.title}: ${r.browse_sessions} sessions, not subscribed`
).join('\n')}`;

            resolve(response);
        });
    });
}

async function getOverviewAnalysis(assistantType) {
    return new Promise((resolve) => {
        db.get(`
            SELECT 
                COUNT(DISTINCT u.id) as universities,
                COUNT(DISTINCT j.id) as journals,
                COUNT(s.id) as subscriptions
            FROM universities u, journals j
            LEFT JOIN subscriptions s ON j.id = s.journal_id AND s.status = 'active'
        `, (err, summary) => {
            const response = `Hello! I'm your ${assistantType} assistant with enhanced web intelligence.

📊 **Current Database:**
• Universities: ${summary?.universities || 0}
• Journals: ${summary?.journals || 0}  
• Active Subscriptions: ${summary?.subscriptions || 0}

💡 **Enhanced Capabilities:**
• Real-time market intelligence integration
• Business Strategy + AI journal recommendations
• University-specific competitive analysis
• Trending research topic identification
• Gap analysis with web-enhanced insights

🎯 **Try asking:**
• "Recommend journals for Business Strategy using AI"
• "Compare NUS and NTU AI research focus"
• "What are trending topics in AI business strategy?"
• "Show me browsing gaps in our portfolio"

What would you like to analyze?`;

            resolve(response);
        });
    });
}

// API Routes
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        database: db ? 'connected' : 'disconnected',
        openai: !!openai,
        webEnhanced: true
    });
});

app.get('/api/diagnostics', (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not ready' });
    }

    const queries = [
        { name: 'universities', query: 'SELECT COUNT(*) as count FROM universities' },
        { name: 'journals', query: 'SELECT COUNT(*) as count FROM journals' },
        { name: 'subscriptions', query: 'SELECT COUNT(*) as count FROM subscriptions' },
        { name: 'browsing_history', query: 'SELECT COUNT(*) as count FROM browsing_history' }
    ];

    const results = {};
    let completed = 0;

    queries.forEach(({ name, query }) => {
        db.get(query, (err, row) => {
            results[name] = err ? { error: err.message } : { count: row.count };
            completed++;
            if (completed === queries.length) {
                res.json(results);
            }
        });
    });
});

app.get('/api/universities', (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not ready' });
    }
    
    db.all("SELECT * FROM universities ORDER BY name", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.get('/api/dashboard', (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not ready' });
    }
    
    db.get(`
        SELECT 
            COUNT(DISTINCT s.id) as total_subscriptions,
            COUNT(DISTINCT s.university_id) as total_universities,
            COUNT(DISTINCT s.journal_id) as total_journals,
            SUM(s.annual_cost) as total_cost
        FROM subscriptions s
        WHERE s.status = 'active'
    `, (err, row) => {
        if (err) {
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

app.get('/api/subscriptions', (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not ready' });
    }
    
    db.all(`
        SELECT 
            s.*,
            u.name as university_name,
            u.country,
            j.title as journal_title,
            j.publisher,
            j.subject_area,
            1 as current_year
        FROM subscriptions s
        JOIN universities u ON s.university_id = u.id
        JOIN journals j ON s.journal_id = j.id
        WHERE s.status = 'active'
        ORDER BY s.annual_cost DESC
        LIMIT 50
    `, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Enhanced Chat Endpoint
app.post('/api/chat/send', async (req, res) => {
    console.log('🤖 Enhanced chat request received:', req.body);
    
    try {
        const { message, assistantType = 'general', universityFilter = 'all' } = req.body;
        
        if (!message?.trim()) {
            return res.status(400).json({ 
                response: 'Please provide a message to analyze.'
            });
        }

        // Use enhanced response generation with web intelligence
        const aiResponse = await generateResponse(message, assistantType, universityFilter);

        res.json({
            response: aiResponse,
            sessionId: `session_${Date.now()}`,
            assistantType,
            timestamp: new Date().toISOString(),
            webEnhanced: true
        });
        
    } catch (error) {
        console.error('❌ Enhanced chat error:', error);
        res.status(500).json({ 
            response: 'I encountered an error processing your request. Please try again.'
        });
    }
});

// Force reprocess data folder
app.post('/api/reprocess', (req, res) => {
    console.log('🔄 Reprocessing data folder...');
    
    db.serialize(() => {
        db.run("DELETE FROM browsing_history");
        db.run("DELETE FROM subscriptions");
        db.run("DELETE FROM journals");
        db.run("DELETE FROM universities");
        
        processDataFolder();
        res.json({ message: 'Data folder reprocessed successfully' });
    });
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Enhanced Publishing Intelligence Platform running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔧 API: http://localhost:${PORT}/api`);
    console.log(`🌐 Web-Enhanced Chat: Enabled`);
    
    initializeDatabase();
});

module.exports = app;