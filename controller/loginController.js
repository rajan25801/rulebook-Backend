const jwt = require('jsonwebtoken');

// Mock user data (replace with database integration later)
const users = [
  { username: 'maker1', password: 'password123', role: 'maker' },
  { username: 'checker1', password: 'password123', role: 'checker' }
];

exports.login = (req, res) => {
  console.log('Login request body:', req.body); // Debug log
  if (!req.body || !req.body.username || !req.body.password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  const { username, password } = req.body;

  // Find user
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Generate JWT token
  const token = jwt.sign({ username: user.username, role: user.role }, 'your_jwt_secret', { expiresIn: '1h' });

  // Respond in the format expected by frontend
  res.json({
    success: true,
    data: {
      user: { username: user.username, role: user.role },
      token: token
    }
  });
};
