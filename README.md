# Publishing Intelligence Platform

A simplified, production-ready AI-powered dashboard for scientific publishing analytics.

## Quick Deployment

### One-Click Deployment
```bash
curl -fsSL https://raw.githubusercontent.com/your-repo/one-click-deploy.sh | bash
```

### Manual Deployment
1. Clone this repository
2. Run: `chmod +x one-click-deploy.sh && ./one-click-deploy.sh`
3. Configure `.env` file with your OpenAI API key
4. Place Excel files in `data/` directory
5. Access dashboard at `http://your-vm-ip`

## Features
- Interactive dashboard with real-time metrics
- SQLite database for data persistence
- AI-powered insights using OpenAI API
- Excel file upload and processing
- Revenue opportunity analysis
- Usage pattern analytics

## File Structure
```
├── app.js              # Main server
├── package.json        # Dependencies
├── .env               # Configuration
├── setup.js           # Database setup
├── data-import.js     # Excel import
├── public/
│   └── index.html     # Dashboard
├── data/              # Excel files
└── uploads/           # Temp uploads
```

## API Endpoints
- `GET /` - Dashboard interface
- `GET /api/dashboard` - Metrics
- `GET /api/universities` - University list
- `POST /api/chat` - AI chat
- `POST /api/upload` - File upload

## Configuration
Edit `.env` file:
```
PORT=3001
OPENAI_API_KEY=your_key_here
DATABASE_PATH=./publishing_data.db
```

## Management Commands
```bash
# Check status
sudo systemctl status publishing-platform

# View logs
sudo journalctl -u publishing-platform -f

# Restart
sudo systemctl restart publishing-platform
```

## Support
- Application logs: `sudo journalctl -u publishing-platform -f`
- Database check: `sqlite3 publishing_data.db ".tables"`
- File permissions: Ensure proper ownership and permissions

## License
MIT License