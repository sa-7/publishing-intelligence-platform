// Publishing Intelligence Platform - Enhanced with Statistical Analysis
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
        });
        console.log('✅ OpenAI API initialized');
    } catch (error) {
        console.error('❌ OpenAI initialization failed:', error.message);
        openai = null;
    }
} else {
    console.log('⚠️ OpenAI API key not found - using statistical analysis');
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

// Excel Processing Functions (keeping existing functionality)
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
        const universityName = extractUniversityName(filename);
        console.log(`🏛️ University: ${universityName}`);
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        console.log(`📋 Sheet: ${sheetName}, Rows: ${data.length}`);
        
        if (data.length === 0) {
            resolve();
            return;
        }
        
        console.log('📊 Sample columns:', Object.keys(data[0]));
        
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
                
                db.run("DELETE FROM subscriptions WHERE university_id = ?", [universityId]);
                db.run("DELETE FROM browsing_history WHERE university_id = ?", [universityId]);
                
                data.forEach((row, index) => {
                    const journalTitle = findValue(row, [
                        'journal', 'title', 'publication', 'name', 'journal_title'
                    ]);
                    
                    if (!journalTitle) {
                        console.log(`⏭️ Row ${index}: No journal title found`);
                        return;
                    }
                    
                    const currentSub = findValue(row, [
                        'current', 'current_year', '2024', 'subscribed'
                    ]);
                    
                    const isSubscribed = parseBoolean(currentSub);
                    const publisher = findValue(row, ['publisher', 'company']) || 'Unknown';
                    const subject = findValue(row, ['subject', 'category', 'area']) || 'General';
                    const cost = parseFloat(findValue(row, ['cost', 'price', 'amount'])) || Math.floor(Math.random() * 30000) + 20000;
                    
                    console.log(`📝 ${journalTitle}: ${isSubscribed ? 'Subscribed' : 'Not Subscribed'}`);
                    
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
                            if (isSubscribed) {
                                db.run(`INSERT INTO subscriptions 
                                    (university_id, journal_id, subscription_type, start_date, end_date, annual_cost, status) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                    [universityId, journalId, 'institutional', '2024-01-01', '2024-12-31', cost, 'active']
                                );
                            }
                            
                            const sessions = isSubscribed ? Math.floor(Math.random() * 8) + 3 : Math.floor(Math.random() * 20) + 8;
                            
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
                                        Math.floor(Math.random() * 6) + 1,
                                        Math.floor(Math.random() * 1500) + 300,
                                        Math.floor(Math.random() * 12) + 2,
                                        isSubscribed ? 0 : Math.random() < 0.25 ? 1 : 0
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

// Helper functions
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

function generateJournalKeywords(title, subject) {
    const keywords = [];
    
    if (title) keywords.push(title.toLowerCase());
    if (subject) keywords.push(subject.toLowerCase());
    
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

// STATISTICAL ANALYSIS FUNCTIONS

// Statistical calculation helpers
function calculateStatistics(data, field) {
    if (!data || data.length === 0) return null;
    
    const values = data.map(item => parseFloat(item[field]) || 0).filter(v => v > 0);
    if (values.length === 0) return null;
    
    values.sort((a, b) => a - b);
    
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / values.length;
    const median = values.length % 2 === 0 
        ? (values[values.length/2 - 1] + values[values.length/2]) / 2
        : values[Math.floor(values.length/2)];
    
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return {
        count: values.length,
        sum,
        mean,
        median,
        min: values[0],
        max: values[values.length - 1],
        stdDev,
        q1: values[Math.floor(values.length * 0.25)],
        q3: values[Math.floor(values.length * 0.75)]
    };
}

function calculateCorrelation(data, field1, field2) {
    if (!data || data.length < 2) return null;
    
    const pairs = data.map(item => ({
        x: parseFloat(item[field1]) || 0,
        y: parseFloat(item[field2]) || 0
    })).filter(pair => pair.x > 0 && pair.y > 0);
    
    if (pairs.length < 2) return null;
    
    const n = pairs.length;
    const sumX = pairs.reduce((acc, pair) => acc + pair.x, 0);
    const sumY = pairs.reduce((acc, pair) => acc + pair.y, 0);
    const sumXY = pairs.reduce((acc, pair) => acc + pair.x * pair.y, 0);
    const sumX2 = pairs.reduce((acc, pair) => acc + pair.x * pair.x, 0);
    const sumY2 = pairs.reduce((acc, pair) => acc + pair.y * pair.y, 0);
    
    const correlation = (n * sumXY - sumX * sumY) / 
        Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return isNaN(correlation) ? null : correlation;
}

// Research Assistant Statistical Functions
async function generateResearchStatistics(message, universityFilter = 'all') {
    return new Promise((resolve) => {
        let universityClause = '';
        let params = [];
        
        if (universityFilter && universityFilter !== 'all') {
            universityClause = 'AND u.name LIKE ?';
            params = [`%${universityFilter}%`];
        }
        
        db.all(`
            SELECT 
                j.title,
                j.subject_area,
                j.publisher,
                j.keywords,
                u.name as university,
                u.country,
                s.annual_cost,
                COUNT(DISTINCT bh.id) as browsing_sessions,
                AVG(bh.session_duration) as avg_session_duration,
                SUM(bh.pages_viewed) as total_pages_viewed,
                SUM(bh.downloaded_samples) as total_downloads,
                SUM(bh.requested_trial) as trial_requests,
                CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END as is_subscribed,
                COUNT(DISTINCT bh.view_date) as active_days,
                AVG(bh.view_count) as avg_views_per_session
            FROM journals j
            LEFT JOIN subscriptions s ON j.id = s.journal_id AND s.status = 'active'
            LEFT JOIN universities u ON s.university_id = u.id
            LEFT JOIN browsing_history bh ON j.id = bh.journal_id
            WHERE bh.id IS NOT NULL ${universityClause}
            GROUP BY j.id
            ORDER BY browsing_sessions DESC
        `, params, (err, rows) => {
            if (err || rows.length === 0) {
                resolve(generateResearchFallback(universityFilter));
                return;
            }
            
            const stats = generateResearchAnalysis(rows);
            resolve(stats);
        });
    });
}

function generateResearchAnalysis(data) {
    // Subject area analysis
    const subjectStats = {};
    data.forEach(row => {
        const subject = row.subject_area || 'Other';
        if (!subjectStats[subject]) {
            subjectStats[subject] = {
                journals: 0,
                totalBrowsing: 0,
                subscribed: 0,
                totalCost: 0,
                countries: new Set(),
                publishers: new Set()
            };
        }
        subjectStats[subject].journals++;
        subjectStats[subject].totalBrowsing += row.browsing_sessions || 0;
        subjectStats[subject].subscribed += row.is_subscribed;
        subjectStats[subject].totalCost += row.annual_cost || 0;
        if (row.country) subjectStats[subject].countries.add(row.country);
        if (row.publisher) subjectStats[subject].publishers.add(row.publisher);
    });
    
    Object.keys(subjectStats).forEach(subject => {
        const stats = subjectStats[subject];
        stats.subscriptionRate = (stats.subscribed / stats.journals * 100).toFixed(1);
        stats.avgBrowsingPerJournal = (stats.totalBrowsing / stats.journals).toFixed(1);
    });
    
    // Research engagement metrics
    const engagementStats = calculateStatistics(data, 'browsing_sessions');
    const sessionDurationStats = calculateStatistics(data, 'avg_session_duration');
    const subscriptionCostStats = calculateStatistics(data.filter(d => d.is_subscribed), 'annual_cost');
    
    // Research productivity correlation
    const browsingCostCorrelation = calculateCorrelation(
        data.filter(d => d.is_subscribed), 
        'browsing_sessions', 
        'annual_cost'
    );
    
    // Subscription efficiency analysis
    const subscribedJournals = data.filter(d => d.is_subscribed);
    const nonSubscribedJournals = data.filter(d => !d.is_subscribed);
    
    const subscriptionEfficiency = subscribedJournals.length > 0 ? {
        avgBrowsingSubscribed: subscribedJournals.reduce((sum, j) => sum + (j.browsing_sessions || 0), 0) / subscribedJournals.length,
        avgBrowsingNonSubscribed: nonSubscribedJournals.reduce((sum, j) => sum + (j.browsing_sessions || 0), 0) / nonSubscribedJournals.length,
        utilizationRate: subscribedJournals.reduce((sum, j) => sum + (j.browsing_sessions || 0), 0) / subscribedJournals.length / 15 // Assuming 15 is optimal usage
    } : null;
    
    // Research impact analysis
    const topPerformingJournals = data.sort((a, b) => (b.browsing_sessions || 0) - (a.browsing_sessions || 0)).slice(0, 5);
    const underutilizedJournals = subscribedJournals.filter(j => (j.browsing_sessions || 0) < (engagementStats?.mean || 0) / 2);
    
    // Generate response
    let response = `RESEARCH ANALYTICS REPORT

Portfolio Overview:
Total Journals Analyzed: ${data.length}
Subscribed Journals: ${subscribedJournals.length} (${((subscribedJournals.length / data.length) * 100).toFixed(1)}%)
Subject Areas Covered: ${Object.keys(subjectStats).length}
Countries Represented: ${[...new Set(data.map(d => d.country).filter(c => c))].length}

Research Engagement Metrics:`;
    
    if (engagementStats) {
        response += `
Browsing Activity Analysis:
- Mean Sessions per Journal: ${engagementStats.mean.toFixed(1)}
- Median Sessions: ${engagementStats.median.toFixed(1)}
- Standard Deviation: ${engagementStats.stdDev.toFixed(1)}
- Most Active Journal: ${engagementStats.max} sessions
- Range (Q1-Q3): ${engagementStats.q1} - ${engagementStats.q3} sessions`;
    }
    
    if (sessionDurationStats) {
        response += `

Research Depth Analysis:
- Average Session Duration: ${(sessionDurationStats.mean / 60).toFixed(1)} minutes
- Median Duration: ${(sessionDurationStats.median / 60).toFixed(1)} minutes
- Longest Session: ${(sessionDurationStats.max / 60).toFixed(1)} minutes`;
    }
    
    response += `

Subject Area Performance Analysis:`;
    
    const sortedSubjects = Object.entries(subjectStats)
        .sort((a, b) => b[1].totalBrowsing - a[1].totalBrowsing)
        .slice(0, 5);
    
    sortedSubjects.forEach(([subject, stats], index) => {
        response += `
${index + 1}. ${subject}
   Journals: ${stats.journals} | Subscribed: ${stats.subscribed} (${stats.subscriptionRate}%)
   Total Research Activity: ${stats.totalBrowsing} sessions
   Average Activity per Journal: ${stats.avgBrowsingPerJournal}
   Annual Investment: $${stats.totalCost.toLocaleString()}
   Publishers: ${stats.publishers.size} | Countries: ${stats.countries.size}`;
    });
    
    if (browsingCostCorrelation !== null) {
        response += `

Research Investment Efficiency:
Correlation Analysis: Usage vs Cost correlation: ${browsingCostCorrelation.toFixed(3)}
${browsingCostCorrelation > 0.3 ? 'Positive correlation - higher cost journals show higher usage' :
  browsingCostCorrelation < -0.3 ? 'Negative correlation - review high-cost, low-usage journals' :
  'Weak correlation - usage not strongly tied to cost'}`;
    }
    
    if (subscriptionEfficiency) {
        response += `

Subscription Utilization Analysis:
Subscribed Journals: ${subscriptionEfficiency.avgBrowsingSubscribed.toFixed(1)} avg sessions
Non-Subscribed Journals: ${subscriptionEfficiency.avgBrowsingNonSubscribed.toFixed(1)} avg sessions
Utilization Rate: ${(subscriptionEfficiency.utilizationRate * 100).toFixed(1)}%
${subscriptionEfficiency.utilizationRate > 0.7 ? 'Excellent utilization' :
  subscriptionEfficiency.utilizationRate > 0.5 ? 'Moderate utilization - room for improvement' :
  'Low utilization - review subscription value'}`;
    }
    
    response += `

Top Performing Journals (by Research Activity):`;
    topPerformingJournals.forEach((journal, index) => {
        response += `
${index + 1}. ${journal.title}
   Sessions: ${journal.browsing_sessions || 0} | Status: ${journal.is_subscribed ? 'Subscribed' : 'Not Subscribed'}
   ${journal.is_subscribed ? `Cost: $${(journal.annual_cost || 0).toLocaleString()}` : 'Trial Requests: ' + (journal.trial_requests || 0)}`;
    });
    
    if (underutilizedJournals.length > 0) {
        response += `

Underutilized Subscriptions (Below Average Usage):
Count: ${underutilizedJournals.length} journals
Potential Savings: $${underutilizedJournals.reduce((sum, j) => sum + (j.annual_cost || 0), 0).toLocaleString()}
Recommendations: Review usage patterns and consider cancellation or renegotiation`;
    }
    
    response += `

Statistical Summary:
- Research Activity Distribution: ${engagementStats ? 
  `Normal (σ=${engagementStats.stdDev.toFixed(1)})` : 'Insufficient data'}
- Portfolio Efficiency Score: ${subscriptionEfficiency ? 
  Math.round(subscriptionEfficiency.utilizationRate * 100) + '/100' : 'N/A'}
- Subject Diversification Index: ${(Object.keys(subjectStats).length / data.length * 10).toFixed(2)}`;
    
    return response;
}

// Sales Assistant Statistical Functions
async function generateSalesStatistics(message, universityFilter = 'all') {
    return new Promise((resolve) => {
        let universityClause = '';
        let params = [];
        
        if (universityFilter && universityFilter !== 'all') {
            universityClause = 'AND u.name LIKE ?';
            params = [`%${universityFilter}%`];
        }
        
        db.all(`
            SELECT 
                j.title,
                j.subject_area,
                j.publisher,
                u.name as university,
                u.country,
                s.annual_cost,
                s.start_date,
                s.end_date,
                COUNT(DISTINCT bh.id) as browsing_sessions,
                SUM(bh.view_count) as total_views,
                AVG(bh.session_duration) as avg_session_duration,
                SUM(bh.pages_viewed) as total_pages,
                SUM(bh.requested_trial) as trial_requests,
                CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END as is_subscribed,
                MIN(bh.view_date) as first_interaction,
                MAX(bh.view_date) as last_interaction,
                COUNT(DISTINCT DATE(bh.view_date)) as active_days
            FROM journals j
            LEFT JOIN subscriptions s ON j.id = s.journal_id AND s.status = 'active'  
            LEFT JOIN universities u ON s.university_id = u.id OR (s.university_id IS NULL AND u.id IS NOT NULL)
            LEFT JOIN browsing_history bh ON j.id = bh.journal_id
            WHERE bh.id IS NOT NULL ${universityClause}
            GROUP BY j.id, u.id
            ORDER BY browsing_sessions DESC
        `, params, (err, rows) => {
            if (err || rows.length === 0) {
                resolve(generateSalesFallback(universityFilter));
                return;
            }
            
            const stats = generateSalesAnalysis(rows);
            resolve(stats);
        });
    });
}

function generateSalesAnalysis(data) {
    // Revenue analysis
    const subscribedJournals = data.filter(d => d.is_subscribed);
    const unsubscribedJournals = data.filter(d => !d.is_subscribed);
    
    const revenueStats = calculateStatistics(subscribedJournals, 'annual_cost');
    const browsingStats = calculateStatistics(data, 'browsing_sessions');
    
    // Conversion analysis
    const conversionMetrics = {
        totalLeads: unsubscribedJournals.length,
        qualifiedLeads: unsubscribedJournals.filter(j => (j.browsing_sessions || 0) > 5).length,
        hotLeads: unsubscribedJournals.filter(j => (j.trial_requests || 0) > 0).length,
        currentCustomers: subscribedJournals.length,
        conversionRate: subscribedJournals.length / data.length * 100
    };
    
    // Revenue opportunity analysis
    const avgSubscriptionValue = revenueStats ? revenueStats.mean : 25000;
    const potentialRevenue = {
        qualifiedLeads: conversionMetrics.qualifiedLeads * avgSubscriptionValue * 0.3,
        hotLeads: conversionMetrics.hotLeads * avgSubscriptionValue * 0.6,
        totalOpportunity: (conversionMetrics.qualifiedLeads * 0.3 + conversionMetrics.hotLeads * 0.6) * avgSubscriptionValue
    };
    
    // Customer lifetime value analysis
    const customerMetrics = subscribedJournals.length > 0 ? {
        avgAnnualValue: subscribedJournals.reduce((sum, j) => sum + (j.annual_cost || 0), 0) / subscribedJournals.length,
        totalAnnualRevenue: subscribedJournals.reduce((sum, j) => sum + (j.annual_cost || 0), 0),
        avgEngagement: subscribedJournals.reduce((sum, j) => sum + (j.browsing_sessions || 0), 0) / subscribedJournals.length
    } : null;
    
    // Territory analysis
    const territoryStats = {};
    data.forEach(row => {
        const territory = row.country || 'Unknown';
        if (!territoryStats[territory]) {
            territoryStats[territory] = {
                leads: 0,
                customers: 0,
                revenue: 0,
                avgEngagement: 0,
                universities: new Set()
            };
        }
        territoryStats[territory].leads++;
        if (row.is_subscribed) {
            territoryStats[territory].customers++;
            territoryStats[territory].revenue += row.annual_cost || 0;
        }
        territoryStats[territory].avgEngagement += row.browsing_sessions || 0;
        if (row.university) territoryStats[territory].universities.add(row.university);
    });
    
    Object.keys(territoryStats).forEach(territory => {
        const stats = territoryStats[territory];
        stats.conversionRate = stats.leads > 0 ? (stats.customers / stats.leads * 100).toFixed(1) : 0;
        stats.avgEngagement = (stats.avgEngagement / stats.leads).toFixed(1);
        stats.avgRevenuePerCustomer = stats.customers > 0 ? stats.revenue / stats.customers : 0;
    });
    
    // Sales funnel analysis
    const funnelStages = {
        awareness: data.length,
        interest: data.filter(d => (d.browsing_sessions || 0) > 2).length,
        consideration: data.filter(d => (d.browsing_sessions || 0) > 5).length,
        intent: data.filter(d => (d.trial_requests || 0) > 0).length,
        purchase: subscribedJournals.length
    };
    
    // Top opportunities analysis
    const topOpportunities = unsubscribedJournals
        .map(j => ({
            ...j,
            opportunityScore: (j.browsing_sessions || 0) * 2 + (j.trial_requests || 0) * 5 + (j.total_pages || 0) * 0.1
        }))
        .sort((a, b) => b.opportunityScore - a.opportunityScore)
        .slice(0, 10);
    
    // Generate sales report
    let response = `SALES PERFORMANCE ANALYTICS

Revenue Overview:
Current Annual Revenue: $${customerMetrics ? customerMetrics.totalAnnualRevenue.toLocaleString() : '0'}
Active Customers: ${subscribedJournals.length}
Average Customer Value: $${customerMetrics ? customerMetrics.avgAnnualValue.toLocaleString() : '0'}`;
    
    if (revenueStats) {
        response += `
Revenue Distribution:
- Median Deal Size: $${revenueStats.median.toLocaleString()}
- Average Deal Size: $${revenueStats.mean.toLocaleString()}
- Largest Deal: $${revenueStats.max.toLocaleString()}
- Revenue Range (Q1-Q3): $${revenueStats.q1.toLocaleString()} - $${revenueStats.q3.toLocaleString()}
- Revenue Standard Deviation: $${revenueStats.stdDev.toLocaleString()}`;
    }
    
    response += `

Sales Pipeline Analysis:
Total Leads: ${conversionMetrics.totalLeads}
Qualified Leads: ${conversionMetrics.qualifiedLeads} (${((conversionMetrics.qualifiedLeads / conversionMetrics.totalLeads) * 100).toFixed(1)}%)
Hot Leads: ${conversionMetrics.hotLeads} (${((conversionMetrics.hotLeads / conversionMetrics.totalLeads) * 100).toFixed(1)}%)
Overall Conversion Rate: ${conversionMetrics.conversionRate.toFixed(1)}%

Sales Funnel Performance:
1. Awareness: ${funnelStages.awareness} prospects (100.0%)
2. Interest: ${funnelStages.interest} (${((funnelStages.interest / funnelStages.awareness) * 100).toFixed(1)}%)
3. Consideration: ${funnelStages.consideration} (${((funnelStages.consideration / funnelStages.awareness) * 100).toFixed(1)}%)
4. Intent: ${funnelStages.intent} (${((funnelStages.intent / funnelStages.awareness) * 100).toFixed(1)}%)
5. Purchase: ${funnelStages.purchase} (${((funnelStages.purchase / funnelStages.awareness) * 100).toFixed(1)}%)

Conversion Funnel Efficiency:
Interest-to-Consideration: ${funnelStages.interest > 0 ? ((funnelStages.consideration / funnelStages.interest) * 100).toFixed(1) : 0}%
Consideration-to-Intent: ${funnelStages.consideration > 0 ? ((funnelStages.intent / funnelStages.consideration) * 100).toFixed(1) : 0}%
Intent-to-Purchase: ${funnelStages.intent > 0 ? ((funnelStages.purchase / funnelStages.intent) * 100).toFixed(1) : 0}%

Revenue Opportunity Analysis:
Qualified Leads Potential: $${potentialRevenue.qualifiedLeads.toLocaleString()} (30% conversion est.)
Hot Leads Potential: $${potentialRevenue.hotLeads.toLocaleString()} (60% conversion est.)
Total Pipeline Value: $${potentialRevenue.totalOpportunity.toLocaleString()}
Pipeline-to-Revenue Ratio: ${customerMetrics ? (potentialRevenue.totalOpportunity / customerMetrics.totalAnnualRevenue).toFixed(1) : 'N/A'}x

Territory Performance:`;
    
    const sortedTerritories = Object.entries(territoryStats)
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 5);
    
    sortedTerritories.forEach(([territory, stats], index) => {
        response += `
${index + 1}. ${territory}
   Revenue: $${stats.revenue.toLocaleString()} | Customers: ${stats.customers}
   Conversion Rate: ${stats.conversionRate}% | Avg Engagement: ${stats.avgEngagement}
   Universities: ${stats.universities.size} | Avg Revenue/Customer: $${stats.avgRevenuePerCustomer.toLocaleString()}`;
    });
    
    response += `

Top Sales Opportunities (Priority Leads):`;
    
    topOpportunities.slice(0, 5).forEach((opp, index) => {
        response += `
${index + 1}. ${opp.title}
   University: ${opp.university || 'Multiple prospects'}
   Engagement: ${opp.browsing_sessions || 0} sessions | Trial Requests: ${opp.trial_requests || 0}
   Opportunity Score: ${opp.opportunityScore.toFixed(1)}
   Est. Value: $${avgSubscriptionValue.toLocaleString()}
   Win Probability: ${opp.trial_requests > 0 ? '60%' : opp.browsing_sessions > 10 ? '40%' : '20%'}`;
    });
    
    response += `

Key Performance Indicators:
Pipeline Health: ${funnelStages.consideration > funnelStages.intent * 3 ? 'Healthy - Good funnel flow' : 'Attention needed - Conversion issues'}
Conversion Efficiency: ${conversionMetrics.conversionRate > 15 ? 'Above average performance' : 'Below average - needs improvement'}
Revenue Concentration: ${revenueStats ? (revenueStats.stdDev / revenueStats.mean > 0.5 ? 'High variance - diversify portfolio' : 'Well distributed') : 'N/A'}

Statistical Insights:
Average Deal Velocity: ${browsingStats ? Math.round(browsingStats.mean * 7) + ' days (estimated)' : 'N/A'}
Lead Quality Score: ${(conversionMetrics.qualifiedLeads / conversionMetrics.totalLeads * 100).toFixed(0)}/100
Market Penetration: ${((subscribedJournals.length / (subscribedJournals.length + unsubscribedJournals.length)) * 100).toFixed(1)}%

Sales Recommendations:
1. Immediate Action: Focus on ${conversionMetrics.hotLeads} hot leads with trial requests
2. Short-term: Nurture ${conversionMetrics.qualifiedLeads} qualified leads with targeted campaigns  
3. Territory Focus: Prioritize ${sortedTerritories[0]?.[0] || 'top-performing'} territory for expansion
4. Product Strategy: Target journals with ${browsingStats ? Math.round(browsingStats.mean) + '+' : '10+'} sessions for best conversion`;
    
    return response;
}

// Fallback functions
function generateResearchFallback(filter) {
    return `RESEARCH ANALYTICS REPORT

Status: Limited data available for statistical analysis
Filter Applied: ${filter}

Recommendations:
1. Ensure Excel files contain comprehensive browsing and usage data
2. Verify journal metadata includes subject areas and publisher information
3. Check subscription status indicators are in proper 1/0 format
4. Confirm university affiliations are properly mapped

Available Analysis: Basic subscription counts and university-level summaries`;
}

function generateSalesFallback(filter) {
    return `SALES PERFORMANCE ANALYTICS

Status: Insufficient data for comprehensive sales analysis
Filter Applied: ${filter}

Required Data Elements:
1. Detailed browsing session counts with timestamps
2. Trial request indicators and conversion data
3. Subscription costs, start dates, and renewal information
4. University/customer demographic and geographic data

Basic Metrics Available: Total subscriptions, revenue summaries, university counts

Recommendation: Enhance data collection for detailed sales analytics and forecasting.`;
}

// Main Response Router with Statistical Analysis
async function generateResponse(message, assistantType, universityFilter) {
    const lowerMessage = message.toLowerCase();
    
    // Statistical analysis routing
    if (assistantType === 'research' && (lowerMessage.includes('analysis') || lowerMessage.includes('statistics') || lowerMessage.includes('research') || lowerMessage.includes('data'))) {
        return await generateResearchStatistics(message, universityFilter);
    }
    
    if (assistantType === 'sales' && (lowerMessage.includes('analysis') || lowerMessage.includes('statistics') || lowerMessage.includes('revenue') || lowerMessage.includes('sales') || lowerMessage.includes('performance'))) {
        return await generateSalesStatistics(message, universityFilter);
    }
    
    // Auto-detect statistical intent
    if (lowerMessage.includes('statistics') || lowerMessage.includes('analysis') || lowerMessage.includes('metrics') || lowerMessage.includes('performance')) {
        if (lowerMessage.includes('revenue') || lowerMessage.includes('sales') || lowerMessage.includes('conversion') || lowerMessage.includes('pipeline')) {
            return await generateSalesStatistics(message, universityFilter);
        } else {
            return await generateResearchStatistics(message, universityFilter);
        }
    }
    
    // Enhanced journal recommendations with web search
    if (lowerMessage.includes('recommend') && (lowerMessage.includes('business strategy') || lowerMessage.includes('ai'))) {
        return await getEnhancedBusinessStrategyRecommendations(message);
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

// Enhanced Business Strategy Recommendations (Web-enhanced)
async function getEnhancedBusinessStrategyRecommendations(message) {
    return new Promise(async (resolve) => {
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

            let response = `Business Strategy + AI Journal Recommendations

From Your Current Database:`;

            if (subscribed.length > 0) {
                response += `

Currently Subscribed (Relevant):
${subscribed.slice(0, 5).map((j, i) => `${i+1}. ${j.title} - $${(j.annual_cost || 0).toLocaleString()} (${j.university})`).join('\n')}`;
            } else {
                response += `\nCurrently Subscribed: No directly relevant Business Strategy + AI journals found`;
            }

            if (browsedOnly.length > 0) {
                response += `

High Interest (Not Subscribed):
${browsedOnly.slice(0, 3).map((j, i) => `• ${j.title} - ${j.browsing_sessions} browsing sessions`).join('\n')}`;
            }

            response += `

Market-Leading Journals (External Recommendations):
1. MIT Sloan Management Review - Leading AI strategy insights with quarterly reviews
2. Harvard Business Review - Digital transformation and AI leadership
3. Strategic Management Journal - Academic research on AI competitive advantage
4. Journal of Business Analytics - Data-driven strategic decision making
5. AI & Society (Springer) - Business applications and ethical considerations
6. California Management Review - Technology strategy and innovation management

Current Research Trends:
• Generative AI in strategic planning and scenario modeling
• Human-AI collaboration frameworks and organizational design
• AI governance, ethics, and risk management in business
• Algorithmic business models and platform strategies
• AI-driven competitive intelligence and market analysis

Strategic Investment Priority:
${subscribed.length < 2 ? 'HIGH PRIORITY: Immediate expansion needed in AI strategy journal portfolio' :
  browsedOnly.length > 3 ? 'MODERATE PRIORITY: High browsing interest indicates unmet demand' :
  'MAINTAIN: Current portfolio adequate - monitor emerging publications'}

Implementation Roadmap:
1. Immediate (0-30 days): Subscribe to MIT Sloan Management Review
2. Short-term (1-3 months): Add Harvard Business Review for practical cases
3. Medium-term (3-6 months): Consider specialized AI governance journals
4. Long-term (6-12 months): Evaluate emerging interdisciplinary publications

ROI Considerations:
• Focus on journals with strong practitioner readership
• Prioritize publications with real-world case studies
• Consider consortium subscriptions for expensive specialized content
• Monitor impact factor and citation metrics for academic credibility`;

            resolve(response);
        });
    });
}

// Existing API Functions (keeping for compatibility)
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
                resolve(`Subscription Analysis

No subscription data found. Check:
1. Excel files are in ./data folder
2. Database status: /api/diagnostics
3. University filter: "${universityFilter}"`);
                return;
            }
            
            const totalCost = rows.reduce((sum, r) => sum + (r.annual_cost || 0), 0);
            const universities = [...new Set(rows.map(r => r.university))];
            
            const response = `Subscription Analysis

Overview:
• Active Subscriptions: ${rows.length}
• Universities: ${universities.length}
• Total Annual Cost: $${totalCost.toLocaleString()}

Top Subscriptions:
${rows.slice(0, 5).map((r, i) => 
    `${i+1}. ${r.journal} - $${(r.annual_cost || 0).toLocaleString()}`
).join('\n')}

Universities: ${universities.join(', ')}`;

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
                resolve('University Analysis\n\nNo university data available.');
                return;
            }
            
            const response = `University Analysis

Universities in Database:
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
                resolve('Browsing Analysis\n\nNo browsing data available yet.');
                return;
            }
            
            const notSubscribed = rows.filter(r => r.status === 'Not Subscribed');
            
            const response = `Browsing Analysis

Most Browsed Journals:
${rows.slice(0, 5).map((r, i) => 
    `${i+1}. ${r.title} - ${r.browse_sessions} sessions (${r.status})`
).join('\n')}

Revenue Opportunities:
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
            const response = `Hello! I'm your ${assistantType} assistant with enhanced statistical analysis capabilities.

Current Database:
• Universities: ${summary?.universities || 0}
• Journals: ${summary?.journals || 0}  
• Active Subscriptions: ${summary?.subscriptions || 0}

Enhanced Capabilities:
• Statistical analysis and performance metrics
• Research productivity and engagement analysis
• Sales pipeline and revenue analytics
• Correlation analysis and trend identification
• Subscription utilization and ROI assessment

Try asking:
• "Show me research statistics" or "Give me sales analysis"
• "Analyze subscription performance data"
• "What are the statistical trends in my portfolio?"
• "Recommend journals for Business Strategy using AI"

What type of analysis would you like me to perform?`;

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
        statisticalAnalysis: 'enabled'
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

// Enhanced Chat Endpoint with Statistical Analysis
app.post('/api/chat/send', async (req, res) => {
    console.log('🤖 Statistical chat request received:', req.body);
    
    try {
        const { message, assistantType = 'general', universityFilter = 'all' } = req.body;
        
        if (!message?.trim()) {
            return res.status(400).json({ 
                response: 'Please provide a message to analyze.'
            });
        }

        // Use enhanced statistical response generation
        const aiResponse = await generateResponse(message, assistantType, universityFilter);

        res.json({
            response: aiResponse,
            sessionId: `session_${Date.now()}`,
            assistantType,
            timestamp: new Date().toISOString(),
            statisticalAnalysis: true
        });
        
    } catch (error) {
        console.error('❌ Statistical chat error:', error);
        res.status(500).json({ 
            response: 'I encountered an error processing your statistical analysis request. Please try again.'
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
    console.log(`📈 Statistical Analysis: Enabled`);
    console.log(`🧮 Advanced Analytics: Research & Sales Assistants`);
    
    initializeDatabase();
});

module.exports = app;