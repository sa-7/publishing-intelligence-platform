const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

console.log('Setting up Publishing Intelligence Platform...');

// Create directories
const dirs = ['public', 'data', 'uploads', 'logs'];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

// Initialize database
const db = new sqlite3.Database('./publishing_data.db', (err) => {
    if (err) {
        console.error('Error creating database:', err);
        process.exit(1);
    } else {
        console.log('Database created successfully');
        initializeTables();
    }
});

function initializeTables() {
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
        )`,
        
        `CREATE TABLE IF NOT EXISTS insights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT DEFAULT 'Medium',
            university_id INTEGER,
            data_source TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (university_id) REFERENCES universities (id)
        )`
    ];

    let completed = 0;
    tables.forEach((sql, index) => {
        db.run(sql, (err) => {
            if (err) {
                console.error(`Error creating table ${index + 1}:`, err);
            } else {
                console.log(`Table ${index + 1} created successfully`);
            }
            
            completed++;
            if (completed === tables.length) {
                insertSampleData();
            }
        });
    });
}

function insertSampleData() {
    const universities = [
        { code: 'nus', name: 'National University of Singapore' },
        { code: 'ntu', name: 'Nanyang Technological University' },
        { code: 'mahidol', name: 'Mahidol University' },
        { code: 'aalborg', name: 'Aalborg University' }
    ];

    console.log('Inserting sample data...');
    
    universities.forEach(uni => {
        db.run(
            'INSERT OR IGNORE INTO universities (code, name) VALUES (?, ?)',
            [uni.code, uni.name],
            function(err) {
                if (err) {
                    console.error('Error inserting university:', err);
                } else if (this.changes > 0) {
                    console.log(`Inserted university: ${uni.name}`);
                }
            }
        );
    });

    console.log('Setup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Copy .env.example to .env and configure your settings');
    console.log('2. Place your Excel files in the data/ directory');
    console.log('3. Run: npm start');
    console.log('4. Open http://localhost:3001 in your browser');
    
    db.close();
}
