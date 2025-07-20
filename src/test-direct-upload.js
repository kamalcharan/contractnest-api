const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

// Enable CORS
app.use(cors());

// Multer setup (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// Serve the HTML file on GET /direct-upload
app.get('/direct-upload', (req, res) => {
  const filePath = path.join(__dirname, 'upload.html');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('upload.html not found');
  }
});

// Handle POST /direct-upload for file upload
app.post('/direct-upload', upload.single('file'), (req, res) => {
  console.log('=== DIRECT UPLOAD TEST ===');
  console.log('Headers:', req.headers);
  console.log('File:', req.file);
  console.log('Body:', req.body);
  
  if (req.file) {
    res.json({
      success: true,
      file: {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      },
      category: req.body.category
    });
  } else {
    res.status(400).json({ error: 'No file received' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Direct test server running on http://localhost:${PORT}/direct-upload`);
});
