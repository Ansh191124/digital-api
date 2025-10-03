import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
// ✅ CORRECTION: Changed from default to NAMED export for ES Modules
import { User } from '../models/User.js'; 

const router = express.Router();

// ------------------------------------
// --- 1. AUTHENTICATION MIDDLEWARE ---
// ------------------------------------

// Middleware to authenticate token
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied - No token provided' });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// ------------------------------------
// --- 2. PUBLIC ROUTES ---
// ------------------------------------

// USER REGISTRATION
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, assignedPhoneNumber, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user instance
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      assignedPhoneNumber: assignedPhoneNumber || null, 
      role: role || 'user'
    });

    const savedUser = await newUser.save();

    console.log(`New user registered: ${savedUser.email}`);
    res.status(201).json({ message: 'User registered successfully', userId: savedUser._id });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// USER LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create JWT Token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        phoneNumber: user.assignedPhoneNumber,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`User logged in: ${user.email}`);

    res.json({ 
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        phoneNumber: user.assignedPhoneNumber,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ------------------------------------
// --- 3. PROTECTED ROUTES ---
// ------------------------------------

// VERIFY TOKEN
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ valid: false, error: 'User not found' });
    }

    res.json({
      valid: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        phoneNumber: user.assignedPhoneNumber,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ valid: false, error: 'Verification failed' });
  }
});

// GET CURRENT USER
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
       return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Fetch user error:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// ------------------------------------
// --- 4. FINAL EXPORT ---
// ------------------------------------

// ✅ Correct Named Export for the router
export { router };