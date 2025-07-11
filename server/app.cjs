

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
const allowedOrigins = [
  'http://localhost:5173', // for local dev
  'https://your-deployed-frontend-url.com' // replace with your actual frontend URL
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Database setup
const db = new sqlite3.Database('./portfolio.db');

// Initialize database tables
db.serialize(() => {
  // User table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    email TEXT,
    face_descriptor TEXT,
    token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Profile table
  db.run(`CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    title TEXT,
    bio TEXT,
    photo TEXT,
    cv_url TEXT,
    location TEXT,
    email TEXT,
    phone TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
//about table 

db.run(`CREATE TABLE IF NOT EXISTS about (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aboutText TEXT,
  frontend TEXT,
  backend TEXT,
  database TEXT,
  tools TEXT,
  image TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

  // Skills table
  db.run(`CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    category TEXT,
    percentage INTEGER,
    icon TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Projects table
  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    image TEXT,
    technologies TEXT,
    github_url TEXT,
    live_url TEXT,
    featured BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Experience table
  db.run(`CREATE TABLE IF NOT EXISTS experience (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    company TEXT,
    location TEXT,
    start_date TEXT,
    end_date TEXT,
    description TEXT,
    current BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Achievements table
  db.run(`CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    date TEXT,
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Contact info table
db.run(`CREATE TABLE IF NOT EXISTS contact_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  github TEXT,
  linkedin TEXT,
  twitter TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
// Resume table
db.run(`CREATE TABLE IF NOT EXISTS resume (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT,
    original_name TEXT,
    file_path TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Messages table
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT,
    subject TEXT,
    message TEXT,
    read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Insert default admin user
  const hashedPassword = bcrypt.hashSync('Soumyadiya@123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, email) VALUES (?, ?, ?)`, 
    ['Soumyadiya', hashedPassword, 'Soumyasingharoy06@gmail.com']);

  // Insert default profile data
  db.run(`INSERT OR IGNORE INTO profile (id, name, title, bio, location, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
    [1, 'Soumya', 'Full Stack Developer', 'Passionate developer creating amazing digital experiences', 'Your City, Country', 'your@email.com', '+1234567890']);
});

db.run(
  `INSERT OR IGNORE INTO contact_info 
    (id, title, description, email, phone, location, github, linkedin, twitter) 
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    1,
    "Let's Start a Conversation",
    "I'm always excited to discuss new opportunities.",
    "",
    "",
    "",
    "",
    "",
    ""
  ]
);

// Example insert
// Modify user table to include face_descriptor
db.run(`ALTER TABLE users ADD COLUMN face_descriptor TEXT`, (err) => {});
db.run(`ALTER TABLE users ADD COLUMN token TEXT`, (err) => {});
db.run(`ALTER TABLE experience ADD COLUMN resume TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column')) {
    console.error('Error adding resume column:', err);
  }
});


// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });
// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Auth routes
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);

    // Save token in DB
    db.run('UPDATE users SET token = ? WHERE id = ?', [token, user.id]);

    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  });
});

// Face login route
app.post('/api/auth/face-login', (req, res) => {
  const { descriptor } = req.body;

  if (!descriptor) {
    return res.status(400).json({ error: 'Descriptor is required' });
  }

  db.all('SELECT * FROM users WHERE face_descriptor IS NOT NULL', (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    let matchedUser = null;
    let lowestDistance = Number.MAX_VALUE;

    // Compare descriptor with each user
    users.forEach(user => {
      const storedDescriptor = JSON.parse(user.face_descriptor);
      const distance = euclideanDistance(descriptor, storedDescriptor);

      if (distance < 0.6 && distance < lowestDistance) {
        matchedUser = user;
        lowestDistance = distance;
      }
    });

    if (matchedUser) {
      // Use stored token
      let token = matchedUser.token;

      // If no token exists, generate one and update DB
      if (!token) {
        token = jwt.sign({ id: matchedUser.id, username: matchedUser.username }, JWT_SECRET);
        db.run('UPDATE users SET token = ? WHERE id = ?', [token, matchedUser.id]);
      }

      return res.json({
        token,
        user: { id: matchedUser.id, username: matchedUser.username, email: matchedUser.email }
      });
    } else {
      return res.status(401).json({ error: 'Face not recognized' });
    }
  });
});

function euclideanDistance(desc1, desc2) {
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    sum += (desc1[i] - desc2[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// Save face descriptor route
app.post('/api/auth/save-face', authenticateToken, (req, res) => {
  const { descriptor } = req.body;

  if (!descriptor) {
    return res.status(400).json({ error: 'Descriptor is required' });
  }

  const userId = req.user.id;
  const token = jwt.sign({ id: userId, username: req.user.username }, JWT_SECRET);

  db.run(
    'UPDATE users SET face_descriptor = ?, token = ? WHERE id = ?',
    [JSON.stringify(descriptor), token, userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Face descriptor and token saved successfully', token });
    }
  );
});


// Profile routes
app.get('/api/profile', (req, res) => {
  db.get('SELECT * FROM profile WHERE id = 1', (err, profile) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(profile || {});
  });
});
app.put('/api/profile', authenticateToken, upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'cv', maxCount: 1 }
]), (req, res) => {
  const { name, title, bio, location, email, phone } = req.body;

  const photo = req.files['photo'] ? `/uploads/${req.files['photo'][0].filename}` : null;
  const cv = req.files['cv'] ? `/uploads/${req.files['cv'][0].filename}` : null;

  let query = `UPDATE profile SET name = ?, title = ?, bio = ?, location = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`;
  let params = [name, title, bio, location, email, phone];

  if (photo && cv) {
    query = `UPDATE profile SET name = ?, title = ?, bio = ?, photo = ?, cv_url = ?, location = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`;
    params = [name, title, bio, photo, cv, location, email, phone];
  } else if (photo) {
    query = `UPDATE profile SET name = ?, title = ?, bio = ?, photo = ?, location = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`;
    params = [name, title, bio, photo, location, email, phone];
  } else if (cv) {
    query = `UPDATE profile SET name = ?, title = ?, bio = ?, cv_url = ?, location = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`;
    params = [name, title, bio, cv, location, email, phone];
  }

  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Profile updated successfully' });
  });
});

// About routes
app.get('/api/about', (req, res) => {
  db.get('SELECT * FROM about WHERE id = 1', (err, about) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(about || {});
  });
});
app.put('/api/about', authenticateToken, upload.single('image'), (req, res) => {
  const { aboutText, frontend, backend, database, tools } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  let query = `UPDATE about SET aboutText = ?, frontend = ?, backend = ?, database = ?, tools = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`;
  let params = [aboutText, frontend, backend, database, tools];

  if (image) {
    query = `UPDATE about SET aboutText = ?, frontend = ?, backend = ?, database = ?, tools = ?, image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`;
    params = [aboutText, frontend, backend, database, tools, image];
  }

  db.run(query, params, function (err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ message: 'About section updated successfully' });
  });
});
// Insert default about data
db.run(`INSERT OR IGNORE INTO about (id, aboutText, frontend, backend, database, tools) VALUES (?, ?, ?, ?, ?, ?)`, 
  [1, 'Beyond the code and pixels, I\'m a lifelong learner who loves solving real-world problems through technology. Whether I\'m mentoring newcomers, writing blog posts, or building side projects, I believe in the power of community and continuous improvement.', 'React, Next.js, TypeScript', 'Node.js, Python, Django', 'PostgreSQL, MongoDB, Firebase', 'Git, Docker, Figma']);


// Skills routes
app.get('/api/skills', (req, res) => {
  db.all('SELECT * FROM skills ORDER BY category, name', (err, skills) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(skills);
  });
});

app.post('/api/skills', authenticateToken, (req, res) => {
  const { name, category, percentage, icon } = req.body;
  
  db.run('INSERT INTO skills (name, category, percentage, icon) VALUES (?, ?, ?, ?)', 
    [name, category, percentage, icon], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ id: this.lastID, message: 'Skill added successfully' });
  });
});

app.delete('/api/skills/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM skills WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Skill deleted successfully' });
  });
});

// Projects routes
app.get('/api/projects', (req, res) => {
  db.all('SELECT * FROM projects ORDER BY created_at DESC', (err, projects) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(projects);
  });
});

app.post('/api/projects', authenticateToken, upload.single('image'), (req, res) => {
  const { title, description, technologies, github_url, live_url, featured } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  db.run('INSERT INTO projects (title, description, image, technologies, github_url, live_url, featured) VALUES (?, ?, ?, ?, ?, ?, ?)', 
    [title, description, image, technologies, github_url, live_url, featured || 0], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ id: this.lastID, message: 'Project added successfully' });
  });
});

app.delete('/api/projects/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM projects WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Project deleted successfully' });
  });
});

// Experience routes
// --- Fetch all experiences
app.get('/api/experience', (req, res) => {
  db.all('SELECT * FROM experience ORDER BY start_date DESC', (err, experiences) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(experiences);
  });
});

// --- Add new experience
app.post('/api/experience', authenticateToken, (req, res) => {
  const { title, company, location, start_date, end_date, description, current } = req.body;

  db.run(
    'INSERT INTO experience (title, company, location, start_date, end_date, description, current) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, company, location, start_date, end_date, description, current || 0],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ id: this.lastID, message: 'Experience added successfully' });
    }
  );
});

// --- Update an existing experience
app.post('/api/experience/update', authenticateToken, (req, res) => {
  const { id, title, company, location, start_date, end_date, description, current } = req.body;

  db.run(
    'UPDATE experience SET title = ?, company = ?, location = ?, start_date = ?, end_date = ?, description = ?, current = ? WHERE id = ?',
    [title, company, location, start_date, end_date, description, current || 0, id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Experience not found' });
      }
      res.json({ message: 'Experience updated successfully' });
    }
  );
});

// --- Delete experience
app.delete('/api/experience/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM experience WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Experience not found' });
    }
    res.json({ message: 'Experience deleted successfully' });
  });
});

// --- Upload resume file
app.post('/api/upload-resume', authenticateToken, upload.single('resume'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const filePath = `/uploads/${req.file.filename}`;
  const originalName = req.file.originalname;
  const filename = req.file.filename;

  // Store resume info in database
  db.run(
    'INSERT OR REPLACE INTO resume (id, filename, original_name, file_path) VALUES (1, ?, ?, ?)',
    [filename, originalName, filePath],
    function(err) {
      if (err) {
        console.error('Error saving resume info:', err);
        return res.status(500).json({ message: 'Error saving resume info' });
      }

      res.json({
        message: 'Resume uploaded successfully',
        path: filePath,
        filename: originalName
      });
    }
  );
});

// Get current resume info
app.get('/api/resume', (req, res) => {
  db.get('SELECT * FROM resume WHERE id = 1', (err, resume) => {
    if (err) {
      console.error('Error fetching resume:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(resume || {});
  });
});

// Achievements routes
app.get('/api/achievements', (req, res) => {
  db.all('SELECT * FROM achievements ORDER BY date DESC', (err, achievements) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(achievements);
  });
});

app.post('/api/achievements', authenticateToken, (req, res) => {
  const { title, description, date, category } = req.body;
  
  db.run('INSERT INTO achievements (title, description, date, category) VALUES (?, ?, ?, ?)', 
    [title, description, date, category], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ id: this.lastID, message: 'Achievement added successfully' });
  });
});
app.put('/api/achievements/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { title, description, date, category } = req.body;

  db.run('UPDATE achievements SET title = ?, description = ?, date = ?, category = ? WHERE id = ?', 
    [title, description, date, category, id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Achievement updated successfully' });
  });
});
app.delete('/api/achievements/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM achievements WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Achievement deleted successfully' });
  });
});

//projects

app.get('/api/projects', (req, res) => {
  db.all('SELECT * FROM projects ORDER BY created_at DESC', (err, projects) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(projects);
  });
});

// Messages routes
app.get('/api/messages', authenticateToken, (req, res) => {
  db.all('SELECT * FROM messages ORDER BY created_at DESC', (err, messages) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(messages);
  });
});

app.post('/api/messages', (req, res) => {
  const { name, email, subject, message } = req.body;
  
  db.run('INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)', 
    [name, email, subject, message], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ id: this.lastID, message: 'Message sent successfully' });
  });
});

app.put('/api/messages/:id/read', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('UPDATE messages SET read = 1 WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Message marked as read' });
  });
});

// Contact info routes
app.put('/api/contact-info', (req, res) => {
  const { email, phone, location, github, linkedin, twitter } = req.body;

  const sql = `
    UPDATE contact_info
    SET email = ?, phone = ?, location = ?, github = ?, linkedin = ?, twitter = ?
    WHERE id = 1
  `;

  db.run(sql, [email, phone, location, github, linkedin, twitter], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Failed to update contact info' });
    }
    res.json({ message: 'Contact info updated successfully' });
  });
});

app.get('/api/contact-info', (req, res) => {
  db.get(`SELECT * FROM contact_info WHERE id = 1`, [], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error fetching contact info' });
    }
    res.json(row);
  });
});

// Update password route
app.put('/api/change-password', (req, res) => {
  const { username, currentPassword, newPassword } = req.body;

  // Get user by username
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err || !user) {
      return res.status(400).json({ message: "User not found" });
    }

    // Compare current password
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const hashedNewPassword = bcrypt.hashSync(newPassword, 10);

    // Update password
    db.run(`UPDATE users SET password = ? WHERE username = ?`, [hashedNewPassword, username], function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Failed to update password" });
      }

      res.json({ message: "Password updated successfully" });
    });
  });
});

// Create uploads directory
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
