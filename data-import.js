const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const db = new sqlite3.Database('./publishing_data.db');

async function importExcelFiles() {
    console.log('Starting data import...');
    
    const dataFiles = {
        'nus': 'Export_National_University_of_Singapore_20250908_034106.xlsx',
        'ntu': 'Export_Nanyang_Technological_University_20250818_034823.xlsx',
        'mahidol': 'Export_Mahidol_University_20250725_052645.xlsx',
        'aalborg': 'Export_Aalborg_University_20250805_095356.xlsx'
    };

    for (const [universityCode, filename] of Object.entries(dataFiles)) {
        const filePath = path.join('./data', filename);
        
        if (fs.existsSync(filePath)) {
            console.log(`Processing ${filename}...`);
            await processFile(filePath, universityCode);
        } else {
            console.log(`File not found: ${filePath}`);
        }
    }
    
    console.log('Data import completed!');
    db.close();
}

async function processFile(filePath, universityCode) {
    return new Promise((resolve, reject) => {
        db.get('SELECT id FROM universities WHERE code = ?', [universityCode], (err, university) => {
            if (err || !university) {
                console.error(`University ${universityCode} not found`);
                resolve();
                return;
            }

            const universityId = university.id;
            const workbook = XLSX.readFile(filePath);
            let totalRecords = 0;

            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(sheet);

                if (data.length === 0) return;

                if (sheetName.toLowerCase().includes('subscription')) {
                    importSubscriptions(data, universityId);
                    totalRecords += data.length;
                } else if (sheetName.toLowerCase().includes('usage')) {
                    importUsage(data, universityId);
                    totalRecords += data.length;
                } else if (sheetName.toLowerCase().includes('book')) {
                    importBooks(data, universityId);
                    totalRecords += data.length;
                }
            });

            console.log(`Imported ${totalRecords} records for ${universityCode}`);
            resolve();
        });
    });
}

function importSubscriptions(data, universityId) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO journal_subscriptions 
        (university_id, journal_title, journal_abbreviation, current_year, previous_year)
        VALUES (?, ?, ?, ?, ?)
    `);

    data.forEach(row => {
        stmt.run([
            universityId,
            row.journal_title || row.Journal || '',
            row.journal_abbreviation || row.Abbreviation || '',
            row.current_year || row.Current || 0,
            row.previous_year || row.Previous || 0
        ]);
    });

    stmt.finalize();
}

function importUsage(data, universityId) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO journal_usage 
        (university_id, journal_title, publisher, usage_date, total_requests, unique_requests)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    data.forEach(row => {
        Object.keys(row).forEach(key => {
            if (key.includes('Total_Item_Requests')) {
                const month = key.split('_')[0];
                const year = key.split('_')[1];
                const date = `${month}_${year}`;
                
                stmt.run([
                    universityId,
                    row.Title || row.title || '',
                    row.Publisher || row.publisher || '',
                    date,
                    row[key] || 0,
                    row[key.replace('Total', 'Unique')] || 0
                ]);
            }
        });
    });

    stmt.finalize();
}

function importBooks(data, universityId) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO books_purchased 
        (university_id, book_code, book_title, year)
        VALUES (?, ?, ?, ?)
    `);

    data.forEach(row => {
        stmt.run([
            universityId,
            row.bookcode || row.code || '',
            row.book_title || row.title || '',
            row.year || new Date().getFullYear()
        ]);
    });

    stmt.finalize();
}

if (require.main === module) {
    importExcelFiles().catch(console.error);
}

module.exports = { importExcelFiles };